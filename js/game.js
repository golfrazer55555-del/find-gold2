'use strict';
/* 게임 상태, 메인 루프, 플레이어, 렌더링 */
var G = null;

const Game = (() => {
  const SAVE_KEY = 'goldcanyon_save_v1';
  const BASE_CAP = 12;
  const LOST_ID = 'lost';
  let canvas, ctx, lightC, lctx;
  let dpr = 1, cw = 0, ch = 0;
  let last = 0;
  const cam = { x: 64, y: 64, P: 32, offX: 0, offY: 0, shake: 0 };
  let toastCooldown = {};
  let hudT = 0;

  /* ───────── 상태 ───────── */
  function defaultInv() {
    return { food: 3, water: 6, waterMax: 6, oil: 60, pick: 1, lantern: 1, dynamite: 1, timber: 2, ammo: 12, bandage: 1, antidote: 0, pan: false, bedroll: false };
  }
  function newState(seed) {
    const world = World.generate(seed);
    return {
      v: 1, seed, world,
      day: 1, time: 7 * 60, goldPrice: 20,
      scene: 'world', mineId: null, levelNo: 0, level: null,
      player: {
        x: world.spawn.x, y: world.spawn.y, dir: 0, face: 1, ax: 0, ay: 1,
        hp: 100, maxHp: 100, hunger: 100, thirst: 100, poison: 0,
        money: 40, bank: 0,
        inv: defaultInv(),
        ore: 0, nuggets: [], dust: 0,
        horse: false, mule: false, mounted: false,
        frags: { A: false, B: false, C: false }, heart: false,
        iframes: 0, dead: false, walkT: 0, moving: false, shootCd: 0,
      },
      explored: new Uint8Array(world.W * world.H),
      known: [], visited: [], rumored: [], rumorStep: 0,
      quest: { boss: 'none', banditKills: 0, banditPaid: 0 },
      campsOpened: [], lostRevealed: false, waypoint: null,
      mineStates: {}, saloon: { day: 0, bank: {} },
      flags: {}, stats: { oreMined: 0, earned: 0, kills: 0, deepest: 0, pokerNet: 0, deaths: 0, dug: 0 },
      enemies: [], bullets: [], bombs: [], pickups: [], particles: [], floaters: [], flashes: [], caveins: [],
      trail: [], dig: null, vis: null, spawnT: 2, exploreT: 0, bossSpawned: false, paused: false, demo: false,
    };
  }
  const P = () => G.player;
  function capacity() { const p = P(); return BASE_CAP + (p.mule ? 40 : 0) + (p.horse ? 12 : 0); }
  function lostDef() { return { id: 999, name: '전설의 광맥', depth: 3, rich: 1.3, fragment: null }; }
  function mineDef(id) { return id === LOST_ID ? lostDef() : G.world.mines[id]; }
  function isNightTime(t = G.time) { return t < 5 * 60 || t >= 20 * 60; }
  function nightness(t = G.time) {
    const hh = t / 60;
    if (hh >= 7 && hh < 18) return 0;
    if (hh >= 18 && hh < 20.5) return (hh - 18) / 2.5;
    if (hh >= 4.5 && hh < 7) return 1 - (hh - 4.5) / 2.5;
    return 1;
  }
  function inTown(x, y) { const t = G.world.town; return x >= t.x0 - 1 && x <= t.x1 + 2 && y >= t.y0 - 1 && y <= t.y1 + 2; }

  /* ───────── 메시지 ───────── */
  function toast(text, kind = 'info', key = null, cd = 3) {
    if (key) {
      const now = performance.now() / 1000;
      if (toastCooldown[key] && now - toastCooldown[key] < cd) return;
      toastCooldown[key] = now;
    }
    UI.toast(text, kind);
  }

  /* ───────── 충돌 ───────── */
  function solidAt(tx, ty) {
    if (G.scene === 'world') {
      const w = G.world;
      if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return true;
      const i = ty * w.W + tx;
      return w.ground[i] === GT.MOUNTAIN || OBJ_SOLID.has(w.obj[i]);
    }
    const L = G.level;
    if (tx < 0 || ty < 0 || tx >= L.W || ty >= L.H) return true;
    return MT_SOLID.has(L.tiles[ty * L.W + tx]);
  }
  function collides(x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r), y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidAt(tx, ty)) return true;
    return false;
  }
  function moveCircle(e, dx, dy, r, assist = false) {
    if (dx) {
      const nx = e.x + dx;
      if (!collides(nx, e.y, r)) e.x = nx;
      else {
        const snap = dx > 0 ? Math.floor(nx + r) - r - 0.001 : Math.floor(nx - r) + 1 + r + 0.001;
        if (!collides(snap, e.y, r) && Math.abs(snap - e.x) < Math.abs(dx) + 0.01) e.x = snap;
        if (assist && Math.abs(dy) < Math.abs(dx) * 0.5) {
          const cy = Math.floor(e.y) + 0.5;
          if (!collides(nx, cy, r)) e.y += Math.sign(cy - e.y) * Math.min(Math.abs(cy - e.y), Math.abs(dx));
        }
      }
    }
    if (dy) {
      const ny = e.y + dy;
      if (!collides(e.x, ny, r)) e.y = ny;
      else {
        const snap = dy > 0 ? Math.floor(ny + r) - r - 0.001 : Math.floor(ny - r) + 1 + r + 0.001;
        if (!collides(e.x, snap, r) && Math.abs(snap - e.y) < Math.abs(dy) + 0.01) e.y = snap;
        if (assist && Math.abs(dx) < Math.abs(dy) * 0.5) {
          const cx = Math.floor(e.x) + 0.5;
          if (!collides(cx, ny, r)) e.x += Math.sign(cx - e.x) * Math.min(Math.abs(cx - e.x), Math.abs(dy));
        }
      }
    }
  }
  function bulletBlocked(x, y) {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (G.scene === 'world') {
      const w = G.world;
      if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return true;
      const i = ty * w.W + tx, o = w.obj[i];
      return w.ground[i] === GT.MOUNTAIN || (OBJ_SOLID.has(o) && o !== OT.POST && o !== OT.FENCE && o !== OT.CACTUS2);
    }
    return solidAt(tx, ty);
  }
  function lineOfSight(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d * 3);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (bulletBlocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /* ───────── 플레이어 피해/회복 ───────── */
  function damagePlayer(amount, cause, poison) {
    const p = P();
    if (p.dead || p.iframes > 0 || G.paused) return;
    p.hp -= amount; p.iframes = 0.7;
    if (poison) { p.poison = Math.max(p.poison, poison); toast('독에 중독됐다! 해독제를 쓰거나 의사에게 가자.', 'bad', 'poison', 6); }
    cam.shake = Math.max(cam.shake, 0.25);
    FX.floater(p.x, p.y - 1.1, '-' + Math.round(amount), '#ff6a5a');
    Sfx.play('hurt');
    if (navigator.vibrate && Input.touchMode) { try { navigator.vibrate(40); } catch (e) { /* 무시 */ } }
    if (p.hp <= 0) die(cause);
  }
  function heal(n) { const p = P(); p.hp = Math.min(p.maxHp, p.hp + n); }
  function eat(auto) {
    const p = P();
    if (p.inv.food <= 0) { if (!auto) toast('식량이 없다.', 'bad', 'nofood'); return false; }
    if (!auto && p.hunger > 92) { toast('아직 배부르다.', 'info', 'full'); return false; }
    p.inv.food--; p.hunger = Math.min(100, p.hunger + 45);
    Sfx.play('eat');
    toast(auto ? '배가 고파 육포를 씹었다. (식량 -1)' : '식사를 했다. (식량 -1)', 'info');
    return true;
  }
  function drink(auto) {
    const p = P();
    if (p.inv.water <= 0) { if (!auto) toast('물통이 비었다! 우물이나 강에서 채우자.', 'bad', 'nowater'); return false; }
    if (!auto && p.thirst > 92) { toast('목이 마르지 않다.', 'info', 'full'); return false; }
    p.inv.water--; p.thirst = Math.min(100, p.thirst + 35);
    Sfx.play('water');
    if (auto) toast(`목이 말라 물을 마셨다. (물 ${p.inv.water}/${p.inv.waterMax})`, 'info');
    return true;
  }
  function useBandage() {
    const p = P();
    if (p.inv.bandage <= 0) { toast('붕대가 없다.', 'bad', 'nob'); return; }
    if (p.hp >= p.maxHp) { toast('다친 곳이 없다.', 'info', 'nohurt'); return; }
    p.inv.bandage--; heal(35); Sfx.play('heal');
    FX.floater(p.x, p.y - 1.1, '+35', '#7ee08a');
    toast('붕대를 감았다. 체력 +35', 'good');
  }
  function useAntidote() {
    const p = P();
    if (p.inv.antidote <= 0) { toast('해독제가 없다.', 'bad', 'noa'); return; }
    if (p.poison <= 0) { toast('중독되지 않았다.', 'info', 'nopo'); return; }
    p.inv.antidote--; p.poison = 0; Sfx.play('heal');
    toast('해독제를 마셨다. 독이 사라졌다.', 'good');
  }

  function die(cause) {
    const p = P();
    if (p.dead) return;
    p.dead = true; p.hp = 0;
    G.stats.deaths++;
    Sfx.play('lose');
    const lostOre = p.ore, lostNug = p.nuggets.length, lostDust = p.dust, lostCash = Math.floor(p.money / 2);
    setTimeout(() => {
      p.ore = 0; p.nuggets = []; p.dust = 0; p.money -= lostCash;
      const fee = Math.min(p.money, 15);
      p.money -= fee;
      if (G.scene === 'mine') stashLevel();
      G.scene = 'world'; G.level = null; G.mineId = null;
      clearRuntime();
      const doc = G.world.buildings.find((b) => b.id === 'doctor');
      p.x = doc.door.x + 0.5; p.y = doc.door.y + 0.6;
      p.hp = 50; p.hunger = Math.max(p.hunger, 60); p.thirst = Math.max(p.thirst, 60); p.poison = 0; p.dead = false; p.mounted = false;
      advanceTime(8 * 60);
      Sfx.setMusicMode('desert');
      snapCamera();
      save();
      UI.showDeath({ cause, lostOre, lostNug, lostDust, lostCash, fee });
    }, 1300);
  }

  /* ───────── 시간 ───────── */
  function advanceTime(mins) {
    G.time += mins;
    while (G.time >= 1440) { G.time -= 1440; newDay(); }
  }
  function newDay() {
    G.day++;
    const p = P();
    const drift = (20 - G.goldPrice) * 0.15 + (Math.random() - 0.5) * 6;
    G.goldPrice = Math.round(U.clamp(G.goldPrice + drift, 12, 32) * 2) / 2;
    if (p.bank > 0) p.bank = Math.floor(p.bank * 1.01 * 100) / 100;
    toast(`${G.day}일째가 밝았다. 오늘 금 시세: ${U.fmtMoney(G.goldPrice)}/kg`, 'info');
  }

  function updateNeeds(dt) {
    const p = P();
    advanceTime(dt * 2);
    const town = G.scene === 'world' && inTown(p.x, p.y);
    const day = !isNightTime();
    p.hunger -= dt * 0.125 * (town ? 0.6 : 1);
    p.thirst -= dt * (G.scene === 'mine' ? 0.1 : day ? 0.26 : 0.13) * (town ? 0.5 : 1);
    if (p.hunger < 30 && p.inv.food > 0) eat(true);
    if (p.thirst < 30 && p.inv.water > 0) drink(true);
    if (p.hunger <= 0) { p.hunger = 0; p.hp -= dt * 0.6; toast('굶주리고 있다! 식량을 구하자.', 'bad', 'starve', 8); }
    if (p.thirst <= 0) { p.thirst = 0; p.hp -= dt * 0.9; toast('목이 타들어 간다! 물을 찾아야 한다.', 'bad', 'thirst', 8); }
    else if (p.thirst < 18 && p.inv.water <= 0) toast('물이 떨어졌다. 우물, 강, 지하 웅덩이에서 채울 수 있다.', 'bad', 'thirstw', 20);
    if (p.poison > 0) { p.poison -= dt; p.hp -= dt * 0.5; }
    if (p.hunger > 50 && p.thirst > 50 && p.poison <= 0) heal(dt * 0.12);
    if (G.scene === 'mine') {
      const before = p.inv.oil;
      p.inv.oil = Math.max(0, p.inv.oil - dt * (p.inv.lantern >= 2 ? 0.17 : 0.25));
      if (before > 0 && p.inv.oil === 0) toast('등불 기름이 다 떨어졌다! 앞이 거의 보이지 않는다.', 'bad');
      else if (before > 15 && p.inv.oil <= 15) toast('등불 기름이 얼마 남지 않았다.', 'bad');
    }
    if (p.hp <= 0) die(p.thirst <= 0 ? '탈수' : p.hunger <= 0 ? '굶주림' : '독');
  }

  /* ───────── 장면 전환 ───────── */
  function clearRuntime() {
    G.enemies = []; G.bullets = []; G.bombs = []; G.pickups = []; G.particles = []; G.floaters = [];
    G.flashes = []; G.caveins = []; G.dig = null; G.flow = null; G.flowKey = null; G.trail = []; G.bossSpawned = false;
  }
  function stashLevel() {
    if (G.scene !== 'mine' || !G.level) return;
    const key = String(G.mineId);
    G.mineStates[key] = G.mineStates[key] || {};
    G.mineStates[key][G.levelNo] = { tiles: G.level.tiles, seen: G.level.seen };
  }
  function enterMine(mineId, level, fromBelow) {
    const p = P();
    stashLevel();
    const def = mineDef(mineId);
    const isLost = mineId === LOST_ID;
    const L = Mine.generate(def, level, G.seed, isLost);
    const saved = G.mineStates[String(mineId)] && G.mineStates[String(mineId)][level];
    if (saved) { L.tiles = saved.tiles; L.seen = saved.seen; }
    const firstVisit = G.scene === 'world' && !G.visited.includes(mineId);
    if (G.scene === 'world') {
      if (!G.visited.includes(mineId)) G.visited.push(mineId);
      if (p.horse && p.mounted) toast('말은 입구에 묶어 두었다.', 'info', 'tiehorse', 60);
    }
    G.scene = 'mine'; G.mineId = mineId; G.levelNo = level; G.level = L;
    clearRuntime();
    G.vis = new Uint8Array(L.W * L.H);
    for (const e of L.enemies) {
      const t = L.tiles[Math.floor(e.y) * L.W + Math.floor(e.x)];
      if (!MT_SOLID.has(t)) Ent.spawn(e.type, e.x, e.y);
    }
    if (fromBelow && L.down) {
      p.x = L.down.x + 0.5; p.y = L.down.y + 0.5;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!solidAt(L.down.x + dx, L.down.y + dy)) { p.x = L.down.x + dx + 0.5; p.y = L.down.y + dy + 0.5; break; }
      }
    } else {
      p.x = L.entry.x + 0.5; p.y = L.entry.y - 0.5;
    }
    G.stats.deepest = Math.max(G.stats.deepest, level);
    Sfx.setMusicMode('mine');
    Sfx.play('door');
    UI.banner(def.name, `지하 ${level}층` + (def.depth > level ? '' : ' · 최하층'));
    if (firstVisit && !G.flags.mineTip) {
      G.flags.mineTip = true;
      setTimeout(() => toast(Input.touchMode ? '반짝이는 벽을 바라보고 [행동] 버튼을 누르고 있으면 금을 캔다.' : '반짝이는 벽을 바라보고 E(또는 Space)를 누르고 있으면 금을 캔다.', 'info'), 1200);
    }
    if (isLost && level === def.depth) setTimeout(() => toast('단단한 암반 너머로 황금빛이 새어 나온다… 다이너마이트가 필요하다.', 'good'), 1500);
    snapCamera();
    updateVisibility();
  }
  function exitMine() {
    stashLevel();
    const id = G.mineId;
    const m = id === LOST_ID ? G.world.lost : G.world.mines[id];
    G.scene = 'world'; G.level = null; G.mineId = null; G.levelNo = 0;
    clearRuntime();
    const p = P();
    p.x = m.x + 0.5; p.y = m.y + 1.55;
    Sfx.setMusicMode('desert');
    Sfx.play('door');
    if (G.flags.lastMineTip !== true && p.ore > 0) { G.flags.lastMineTip = true; toast('광석은 마을의 금 분석소에서 팔 수 있다.', 'info'); }
    snapCamera();
    save();
  }

  /* ───────── 상호작용 ───────── */
  function nearTile(tx, ty, r) { const p = P(); return Math.hypot(p.x - (tx + 0.5), p.y - (ty + 0.5)) < r; }
  function facingVec() { return [[0, 1], [0, -1], [1, 0], [-1, 0]][P().dir4 || 0]; }
  function digTarget() {
    const p = P(), [dx, dy] = facingVec();
    const tx = Math.floor(p.x + dx * 0.68), ty = Math.floor(p.y + dy * 0.68);
    return { tx, ty };
  }

  function getContext() {
    const p = P();
    if (p.dead) return null;
    if (G.scene === 'world') {
      const w = G.world;
      for (const b of w.buildings) if (nearTile(b.door.x, b.door.y, 0.95)) return { label: b.name + ' 들어가기', run: () => { Sfx.play('door'); save(); UI.openBuilding(b.id); } };
      if (nearTile(w.well.x, w.well.y, 1.35)) return { label: '물 채우기', run: refillWater };
      for (const m of w.mines) if (nearTile(m.x, m.y, 1.3) && p.y > m.y + 0.5) return { label: m.name + ' 들어가기', run: () => enterMine(m.id, 1) };
      if (G.lostRevealed && nearTile(w.lost.x, w.lost.y, 1.3) && p.y > w.lost.y + 0.5) return { label: '전설의 광맥 들어가기', run: () => enterMine(LOST_ID, 1) };
      for (const c of w.camps) if (!G.campsOpened.includes(c.id) && nearTile(c.chest.x, c.chest.y, 1.3)) return { label: '상자 열기', run: () => openCampChest(c) };
      if (nearTile(w.signPos.x, w.signPos.y, 1.3)) return { label: '표지판 읽기', run: () => toast('“더스트우드 — 인구 112명. 술주정 금지, 총질 금지.”', 'info') };
      const tx = Math.floor(p.x), ty = Math.floor(p.y);
      let water = false;
      for (let y = ty - 1; y <= ty + 1 && !water; y++) for (let x = tx - 1; x <= tx + 1; x++) if (w.ground[y * w.W + x] === GT.WATER && nearTile(x, y, 1.15)) { water = true; break; }
      if (water) {
        if (p.inv.water < p.inv.waterMax) return { label: '물 채우기', run: refillWater };
        if (p.inv.pan) return { label: '사금 채취', run: () => UI.openPanning() };
        return { label: '물 마시기', run: () => { p.thirst = 100; Sfx.play('water'); toast('시원한 물을 실컷 마셨다.', 'info'); } };
      }
      if (p.inv.bedroll && isNightTime() && !inTown(p.x, p.y)) return { label: '야영하기', run: camp };
      return null;
    }
    // 광산
    const L = G.level;
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      const t = L.tiles[y * L.W + x];
      if (t === MT.EXIT && nearTile(x, y, 1.0)) return { label: '밖으로 나가기', run: exitMine };
      if (t === MT.UP && nearTile(x, y, 1.0)) return { label: '위층으로', run: () => enterMine(G.mineId, G.levelNo - 1, true) };
      if (t === MT.DOWN && nearTile(x, y, 1.0)) return { label: `지하 ${G.levelNo + 1}층으로`, run: () => enterMine(G.mineId, G.levelNo + 1, false) };
      if ((t === MT.CHEST || t === MT.FCHEST) && nearTile(x, y, 1.25)) return { label: '상자 열기', run: () => openMineChest(x, y) };
    }
    const { tx: dtx, ty: dty } = digTarget();
    const dt = L.tiles[dty * L.W + dtx];
    if (DIG_TIME[dt]) return { label: dt === MT.GOLD || dt === MT.RICH ? '금 캐기' : dt === MT.HEART ? '황금 심장 캐기' : '파기', dig: true };
    if (dt === MT.HARD) return { label: '암반 (폭약 필요)', dig: true, hard: true };
    if (dt === MT.BEDROCK) return { label: '기반암', dig: true, bedrock: true };
    const here = L.tiles[ty * L.W + tx];
    if (here === MT.PUDDLE || dt === MT.PUDDLE) {
      if (p.inv.water < p.inv.waterMax) return { label: '물 채우기', run: refillWater };
    }
    return null;
  }
  function refillWater() {
    const p = P();
    p.inv.water = p.inv.waterMax; p.thirst = Math.max(p.thirst, 95);
    Sfx.play('water');
    toast(`물통을 가득 채웠다. (${p.inv.water}/${p.inv.waterMax})`, 'good');
  }
  function camp() {
    const p = P();
    UI.fade(() => {
      const ambush = Math.random() < 0.18;
      const target = 6 * 60;
      const mins = (target - G.time + 1440) % 1440;
      advanceTime(mins);
      p.hunger = Math.max(5, p.hunger - 25); p.thirst = Math.max(5, p.thirst - 25);
      heal(40);
      save();
      if (ambush) {
        for (let i = 0; i < 3; i++) Ent.spawn('coyote', p.x + Math.cos(i * 2) * 5, p.y + Math.sin(i * 2) * 5);
        toast('으르렁… 코요테 무리에 둘러싸여 잠이 깼다!', 'bad');
      } else toast('모닥불 곁에서 푹 잤다. 체력 +40 (저장됨)', 'good');
    });
  }
  function openCampChest(c) {
    const p = P();
    G.campsOpened.push(c.id);
    G.world.obj[c.chest.y * G.world.W + c.chest.x] = OT.CHEST_OPEN;
    const r = new U.RNG(G.seed + c.id * 31);
    const money = r.int(15, 45); p.money += money;
    const got = [U.fmtMoney(money)];
    if (r.chance(0.6)) { p.inv.food += 2; got.push('식량 2'); }
    if (r.chance(0.5)) { p.inv.dynamite += 1; got.push('다이너마이트 1'); }
    if (r.chance(0.5)) { p.inv.ammo += 6; got.push('총알 6'); }
    Sfx.play('coin');
    toast('버려진 상자에서 ' + got.join(', ') + '을(를) 찾았다.', 'good');
    if (c.id === 0) {
      const m = G.world.mines[G.world.fragMines.A];
      setTimeout(() => UI.note('낡은 일기장', `“…지도를 세 조각으로 찢었다. 한 조각은 <b>${m.name}</b> 맨 아래층에 묻어 두었다. 나머지는…” 이후 페이지는 찢겨 있다.`), 400);
      markRumor(m.id);
    }
  }
  function openMineChest(x, y) {
    const L = G.level, p = P();
    const t = L.tiles[y * L.W + x];
    L.tiles[y * L.W + x] = MT.CHEST_OPEN;
    const lv = G.levelNo;
    Sfx.play('coin');
    if (t === MT.FCHEST) {
      const def = mineDef(G.mineId);
      Ent.dropPickup(x + 0.5, y + 1.1, 'frag', def.fragment);
      Ent.dropPickup(x + 0.5, y + 1.1, 'money', 30 + Math.floor(Math.random() * 30));
      FX.gold(x + 0.5, y + 0.5, 20);
      toast('낡은 상자 안에 접힌 양피지가 있다!', 'good');
      return;
    }
    const r = Math.random;
    Ent.dropPickup(x + 0.5, y + 1.1, 'money', Math.floor((10 + r() * 30) * lv));
    if (r() < 0.35) Ent.dropPickup(x + 0.5, y + 1.1, 'dynamite', 1 + (r() < 0.3 ? 1 : 0));
    if (r() < 0.3) Ent.dropPickup(x + 0.5, y + 1.1, 'oil', 30);
    if (r() < 0.25) Ent.dropPickup(x + 0.5, y + 1.1, 'food', 2);
    if (r() < 0.2) Ent.dropPickup(x + 0.5, y + 1.1, 'ammo', 6);
    if (r() < 0.18) Ent.dropPickup(x + 0.5, y + 1.1, 'nugget', Math.floor(40 + r() * 80 * lv));
    toast('오래된 광부의 상자를 열었다.', 'info');
  }

  /* ───────── 채굴 ───────── */
  function supported(tx, ty) {
    const L = G.level;
    for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H) continue;
      if (L.tiles[y * L.W + x] === MT.TIMBER) return true;
    }
    return false;
  }
  function finishDig(tx, ty) {
    const L = G.level, p = P();
    const i = ty * L.W + tx, t = L.tiles[i];
    const def = mineDef(G.mineId);
    L.tiles[i] = MT.FLOOR;
    G.stats.dug++;
    const cx = tx + 0.5, cy = ty + 0.5;
    const lvMul = 1 + (G.levelNo - 1) * 0.2;
    Sfx.play('break');
    FX.dust(cx, cy, t === MT.DIRT ? '#7b5636' : '#6f6a66', 8);
    if (t === MT.GOLD || t === MT.RICH) {
      const kg = (t === MT.GOLD ? 0.3 + Math.random() * 0.6 : 1.0 + Math.random() * 1.0) * def.rich * lvMul;
      gainOre(kg, cx, cy);
      if (Math.random() < (t === MT.GOLD ? 0.07 : 0.22)) {
        const v = Math.floor((40 + Math.random() * 90) * lvMul * (G.mineId === LOST_ID ? 1.5 : 1));
        p.nuggets.push(v);
        FX.floater(cx, cy - 0.8, `금덩이! (${U.fmtMoney(v)})`, '#ffe27a');
      }
      Sfx.play('gold');
      FX.gold(cx, cy, 10);
    } else if (t === MT.HEART) {
      p.heart = true;
      FX.gold(cx, cy, 60);
      Sfx.play('win');
      cam.shake = 0.5;
      setTimeout(() => UI.note('황금 심장', '사람 머리만 한 순금 덩어리가 손안에서 묵직하게 빛난다. 전설은 사실이었다! <br><br>이제 살아서 <b>더스트우드의 금 분석소</b>까지 가져가자.'), 600);
    } else if ((t === MT.ROCK || t === MT.DIRT) && Math.random() < 0.02) {
      const v = 2 + Math.floor(Math.random() * 8);
      Ent.dropPickup(cx, cy, 'money', v);
      toast('흙 속에서 오래된 동전이 나왔다.', 'info', 'coin', 10);
    }
    // 낙반 위험
    if (t !== MT.RUBBLE && !supported(tx, ty)) {
      const risk = 0.022 + 0.01 * G.levelNo + (t === MT.GOLD || t === MT.RICH ? 0.01 : 0) + (G.mineId === LOST_ID ? 0.012 : 0);
      if (Math.random() < risk) startCaveIn(tx, ty);
    }
  }
  function gainOre(kg, x, y) {
    const p = P();
    const room = capacity() - p.ore;
    const take = Math.max(0, Math.min(room, kg));
    if (take > 0.01) {
      p.ore += take; G.stats.oreMined += take;
      FX.floater(x, y - 0.4, '+' + U.fmtKg(take) + ' 광석', '#ffd54a');
    }
    if (kg - take > 0.01) {
      Ent.dropPickup(x, y, 'ore', kg - take);
      toast('짐이 꽉 찼다! 광석이 바닥에 떨어졌다. 노새가 있으면 더 실을 수 있다.', 'bad', 'full', 6);
    }
  }
  function startCaveIn(tx, ty) {
    G.caveins.push({ x: tx + 0.5, y: ty + 0.5, t: 1.5, r: 2.4 });
    Sfx.play('rumble');
    toast('⚠ 천장이 흔들린다! 어서 피해!', 'bad');
  }
  function updateCaveIns(dt) {
    const p = P();
    for (let i = G.caveins.length - 1; i >= 0; i--) {
      const c = G.caveins[i];
      c.t -= dt;
      cam.shake = Math.max(cam.shake, 0.12);
      if (Math.random() < dt * 30) FX.add(c.x + (Math.random() - 0.5) * c.r * 2, c.y + (Math.random() - 0.5) * c.r * 2 - 1, 0, 2, 0.5, '#8a7a66', 0.08, 3);
      if (c.t > 0) continue;
      G.caveins.splice(i, 1);
      const L = G.level;
      cam.shake = 0.6;
      Sfx.play('boom');
      for (let y = Math.floor(c.y - c.r); y <= Math.floor(c.y + c.r); y++) for (let x = Math.floor(c.x - c.r); x <= Math.floor(c.x + c.r); x++) {
        if (x < 2 || y < 2 || x >= L.W - 2 || y >= L.H - 2) continue;
        const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
        if (d > c.r) continue;
        const t = L.tiles[y * L.W + x];
        if (t !== MT.FLOOR && t !== MT.PUDDLE) continue;
        if (Math.abs(p.x - (x + 0.5)) < 0.85 && Math.abs(p.y - (y + 0.5)) < 0.85) continue;
        if (Math.random() < 0.75 - d * 0.18) { L.tiles[y * L.W + x] = MT.RUBBLE; FX.dust(x + 0.5, y + 0.5, '#7a6e64', 4); }
      }
      if (Math.hypot(p.x - c.x, p.y - c.y) < c.r) { p.iframes = 0; damagePlayer(24, '낙반'); toast('돌무더기에 깔렸다!', 'bad'); }
      for (const e of G.enemies) if (e.type !== 'ghost' && Math.hypot(e.x - c.x, e.y - c.y) < c.r * 0.8) e.hp = 0;
      G.flowKey = null;
    }
  }

  function explode(x, y) {
    const p = P();
    FX.explosion(x, y);
    Sfx.play('boom');
    cam.shake = 0.7;
    const R = 1.7;
    if (G.scene === 'mine') {
      const L = G.level;
      for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
        if (tx < 2 || ty < 2 || tx >= L.W - 2 || ty >= L.H - 2) continue;
        if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > R) continue;
        const i = ty * L.W + tx, t = L.tiles[i];
        if (t === MT.GOLD || t === MT.RICH) {
          const def = mineDef(G.mineId);
          L.tiles[i] = MT.FLOOR;
          Ent.dropPickup(tx + 0.5, ty + 0.5, 'ore', (t === MT.GOLD ? 0.4 : 1.2) * def.rich * (1 + (G.levelNo - 1) * 0.2));
        } else if (t === MT.DIRT || t === MT.ROCK || t === MT.HARD || t === MT.RUBBLE || t === MT.TIMBER) {
          L.tiles[i] = MT.FLOOR;
        } else if (t === MT.CHEST || t === MT.FCHEST) {
          openMineChest(tx, ty);
        }
      }
      G.flowKey = null;
      if (!supported(Math.floor(x), Math.floor(y)) && Math.random() < 0.3) setTimeout(() => { if (G && G.scene === 'mine') startCaveIn(Math.floor(x), Math.floor(y)); }, 500);
    } else {
      const w = G.world;
      if (!inTown(x, y)) {
        const breakable = new Set([OT.BOULDER, OT.CACTUS, OT.CACTUS2, OT.SHRUB, OT.DEADTREE, OT.BARREL, OT.CRATE, OT.SKULL]);
        for (let ty = Math.floor(y - R); ty <= Math.floor(y + R); ty++) for (let tx = Math.floor(x - R); tx <= Math.floor(x + R); tx++) {
          if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) continue;
          if (Math.hypot(tx + 0.5 - x, ty + 0.5 - y) > R) continue;
          if (breakable.has(w.obj[ty * w.W + tx])) w.obj[ty * w.W + tx] = OT.NONE;
        }
      }
    }
    for (const e of G.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < R + 0.3) {
        if (e.type === 'ghost') e.hp = 0;
        else { e.hp -= 6; e.kx += (e.x - x) / (d || 1) * 8; e.ky += (e.y - y) / (d || 1) * 8; }
      }
    }
    const pd = Math.hypot(p.x - x, p.y - y);
    if (pd < R + 0.5) { p.iframes = 0; damagePlayer(Math.round(34 * (1 - pd / (R + 1))), '다이너마이트'); }
  }

  function collect(k) {
    const p = P();
    switch (k.kind) {
      case 'ore': {
        const room = capacity() - p.ore;
        if (room <= 0.05) { toast('짐이 꽉 찼다!', 'bad', 'full', 5); return false; }
        const take = Math.min(room, k.amount);
        p.ore += take; k.amount -= take; G.stats.oreMined += take;
        FX.floater(p.x, p.y - 1, '+' + U.fmtKg(take), '#ffd54a');
        Sfx.play('coin');
        return k.amount <= 0.05;
      }
      case 'nugget': p.nuggets.push(k.amount); FX.floater(p.x, p.y - 1, `금덩이 ${U.fmtMoney(k.amount)}`, '#ffe27a'); Sfx.play('gold'); break;
      case 'money': p.money += k.amount; FX.floater(p.x, p.y - 1, '+' + U.fmtMoney(k.amount), '#ffe27a'); Sfx.play('coin'); break;
      case 'ammo': p.inv.ammo += k.amount; FX.floater(p.x, p.y - 1, `총알 +${k.amount}`, '#e8d8b0'); Sfx.play('click'); break;
      case 'food': p.inv.food += k.amount; FX.floater(p.x, p.y - 1, `식량 +${k.amount}`, '#e8d8b0'); Sfx.play('click'); break;
      case 'oil': p.inv.oil = Math.min(100, p.inv.oil + k.amount); FX.floater(p.x, p.y - 1, `기름 +${k.amount}`, '#e8d8b0'); Sfx.play('click'); break;
      case 'dynamite': p.inv.dynamite += k.amount; FX.floater(p.x, p.y - 1, `폭약 +${k.amount}`, '#ff9a7a'); Sfx.play('click'); break;
      case 'frag': gotFragment(k.amount); break;
      default: break;
    }
    return true;
  }
  const FRAG_NAME = { A: '첫 번째', B: '두 번째', C: '세 번째' };
  function gotFragment(id) {
    const p = P();
    if (p.frags[id]) return;
    p.frags[id] = true;
    Sfx.play('win');
    const n = Object.values(p.frags).filter(Boolean).length;
    FX.floater(p.x, p.y - 1.2, `지도 조각 ${n}/3`, '#fff2a0');
    if (n === 3) {
      G.lostRevealed = true;
      G.waypoint = { x: G.world.lost.x + 0.5, y: G.world.lost.y + 1.5, label: '전설의 광맥' };
      setTimeout(() => UI.note('지도가 완성됐다!', '세 조각을 이어 붙이자 협곡의 등고선과 함께 붉은 X 표시가 드러났다. <b>전설의 광맥</b>의 위치가 지도에 표시되었다.<br><br>깊은 곳의 단단한 암반을 뚫으려면 <b>다이너마이트</b>를 넉넉히 챙기자.'), 500);
    } else {
      setTimeout(() => UI.note('지도 조각', `${FRAG_NAME[id]} 지도 조각을 손에 넣었다. (${n}/3)<br><br>세 조각을 모두 모으면 전설의 광맥 위치가 드러난다.`), 500);
    }
    save();
  }
  function markRumor(id) { if (!G.rumored.includes(id)) G.rumored.push(id); }

  /* ───────── 플레이어 갱신 ───────── */
  function aimVector() {
    const p = P();
    const aim = !Input.touchMode ? Input.takeAim() : null;
    if (aim) {
      const wx = (aim.x * dpr - cam.offX) / cam.P, wy = (aim.y * dpr - cam.offY) / cam.P;
      const dx = wx - p.x, dy = wy - (p.y - 0.35), d = Math.hypot(dx, dy);
      if (d > 0.2) return [dx / d, dy / d];
    }
    // 자동 조준: 바라보는 방향 근처의 가장 가까운 적
    let best = null, bd = 1e9;
    for (const e of G.enemies) {
      if (e.type === 'ghost') continue;
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > 8.5) continue;
      if (G.scene === 'mine' && G.vis && !G.vis[Math.floor(e.y) * G.level.W + Math.floor(e.x)]) continue;
      const dot = (dx * p.ax + dy * p.ay) / (d || 1);
      const score = d * (dot > 0.3 ? 1 : 2.5);
      if (score < bd && lineOfSight(p.x, p.y - 0.3, e.x, e.y - 0.3)) { bd = score; best = e; }
    }
    if (best) { const dx = best.x - p.x, dy = best.y - 0.25 - (p.y - 0.35), d = Math.hypot(dx, dy) || 1; return [dx / d, dy / d]; }
    return [p.ax, p.ay];
  }

  function updatePlayer(dt) {
    const p = P();
    if (p.dead) return;
    p.iframes -= dt; p.shootCd -= dt;
    const mv = Input.getMove();
    let speed = G.scene === 'world' && p.mounted ? 5.6 : 3.1;
    const tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (G.scene === 'world') {
      if (G.world.ground[ty * G.world.W + tx] === GT.WATER) speed *= p.mounted ? 0.6 : 0.45;
      else if (G.world.ground[ty * G.world.W + tx] === GT.ROAD) speed *= 1.1;
    } else if (G.level.tiles[ty * G.level.W + tx] === MT.PUDDLE) speed *= 0.7;
    if (p.poison > 0) speed *= 0.9;
    const ml = Math.hypot(mv.x, mv.y);
    if (ml > 0.05) {
      p.ax = mv.x / ml; p.ay = mv.y / ml;
      if (Math.abs(mv.x) > Math.abs(mv.y)) p.dir4 = mv.x > 0 ? 2 : 3; else p.dir4 = mv.y > 0 ? 0 : 1;
      if (Math.abs(mv.x) > 0.1) p.face = mv.x > 0 ? 1 : -1;
      moveCircle(p, mv.x * speed * dt, mv.y * speed * dt, 0.3, true);
      p.walkT += dt * speed * ml;
      p.moving = true;
    } else p.moving = false;

    // 노새가 따라오는 경로
    if (G.scene === 'world' && p.mule) {
      const lt = G.trail[G.trail.length - 1];
      if (!lt || Math.hypot(lt.x - p.x, lt.y - p.y) > 0.12) { G.trail.push({ x: p.x, y: p.y }); if (G.trail.length > 30) G.trail.shift(); }
    }

    // 채굴
    const ctxA = G.context;
    if (G.scene === 'mine' && ctxA && ctxA.dig && Input.isHeld('action')) {
      const { tx: dtx, ty: dty } = digTarget();
      if (ctxA.hard) { toast('너무 단단한 암반이다. 다이너마이트로 날려야 한다.', 'bad', 'hard', 4); G.dig = null; }
      else if (ctxA.bedrock) { toast('이 아래는 곡괭이가 들어가지 않는 기반암이다.', 'info', 'bed', 6); G.dig = null; }
      else {
        const t = G.level.tiles[dty * G.level.W + dtx];
        if (!G.dig || G.dig.tx !== dtx || G.dig.ty !== dty) G.dig = { tx: dtx, ty: dty, t: 0, need: DIG_TIME[t] / (p.inv.pick >= 2 ? 1.7 : 1), snd: 0 };
        G.dig.t += dt; G.dig.snd -= dt;
        if (G.dig.snd <= 0) {
          G.dig.snd = 0.26;
          Sfx.play('dig', t !== MT.DIRT && t !== MT.RUBBLE);
          FX.spark(dtx + 0.5 - facingVec()[0] * 0.45, dty + 0.5 - facingVec()[1] * 0.45, t === MT.GOLD || t === MT.RICH || t === MT.HEART ? '#ffd54a' : '#bba890', 3);
        }
        if (G.dig.t >= G.dig.need) { finishDig(dtx, dty); G.dig = null; }
      }
    } else G.dig = null;

    // 행동 (한 번 누르기)
    if (Input.consume('action') && ctxA && ctxA.run) ctxA.run();

    // 사격
    if ((Input.isHeld('shoot') || Input.consume('shoot')) && p.shootCd <= 0) {
      if (G.scene === 'world' && inTown(p.x, p.y)) { toast('마을 안에서 총을 쏘면 보안관에게 끌려간다.', 'bad', 'townshoot', 5); p.shootCd = 0.5; }
      else if (p.inv.ammo <= 0) { toast('총알이 없다! 잡화점에서 살 수 있다.', 'bad', 'noammo', 4); Sfx.play('click'); p.shootCd = 0.4; }
      else {
        const [ax, ay] = aimVector();
        p.inv.ammo--; p.shootCd = 0.36;
        if (Math.abs(ax) > 0.3) p.face = ax > 0 ? 1 : -1;
        Ent.fireBullet(p.x + ax * 0.3, p.y - 0.35 + ay * 0.3, Math.atan2(ay, ax), 'p', 1);
        FX.muzzle(p.x + ax * 0.55, p.y - 0.35 + ay * 0.55);
        Sfx.play('shoot');
        cam.shake = Math.max(cam.shake, 0.06);
      }
    }
    if (Input.consume('dynamite')) {
      if (G.scene === 'world' && inTown(p.x, p.y)) toast('마을 안에서는 폭약을 쓸 수 없다!', 'bad', 'townbomb');
      else if (p.inv.dynamite <= 0) toast('다이너마이트가 없다.', 'bad', 'nodyn');
      else {
        let ax = p.ax, ay = p.ay;
        const aim = !Input.touchMode ? Input.takeAim() : null;
        if (aim) {
          const wx = (aim.x * dpr - cam.offX) / cam.P, wy = (aim.y * dpr - cam.offY) / cam.P;
          const d = Math.hypot(wx - p.x, wy - p.y);
          if (d > 0.3) { ax = (wx - p.x) / d; ay = (wy - p.y) / d; }
        }
        p.inv.dynamite--;
        Ent.throwBomb(ax, ay);
        toast('불붙은 다이너마이트를 던졌다! 물러서!', 'info', 'throw', 2);
      }
    }
    if (Input.consume('timber')) placeTimber();
    if (Input.consume('heal')) useBandage();
    if (Input.consume('eat')) eat(false);
    if (Input.consume('drink')) drink(false);
    if (Input.consume('antidote')) useAntidote();
    if (Input.consume('ride')) toggleRide();
  }
  function placeTimber() {
    const p = P();
    if (G.scene !== 'mine') { toast('버팀목은 광산 안에서만 세울 수 있다.', 'info', 'timberw'); return; }
    if (p.inv.timber <= 0) { toast('버팀목이 없다. 잡화점에서 살 수 있다.', 'bad', 'notimber'); return; }
    const L = G.level, tx = Math.floor(p.x), ty = Math.floor(p.y);
    if (L.tiles[ty * L.W + tx] !== MT.FLOOR) { toast('여기에는 세울 수 없다.', 'bad', 'notimber2'); return; }
    L.tiles[ty * L.W + tx] = MT.TIMBER;
    p.inv.timber--;
    Sfx.play('dig', false);
    toast(`버팀목을 세웠다. 반경 3칸은 낙반에서 안전하다. (남은 ${p.inv.timber}개)`, 'good');
  }
  function toggleRide() {
    const p = P();
    if (!p.horse) { toast('말이 없다. 마구간에서 살 수 있다.', 'info', 'nohorse'); return; }
    if (G.scene !== 'world') { toast('말은 광산 입구에 묶어 두었다.', 'info', 'horsemine'); return; }
    p.mounted = !p.mounted;
    Sfx.play('click');
    toast(p.mounted ? '말에 올라탔다.' : '말에서 내렸다.', 'info');
  }

  /* ───────── 지상 이벤트 ───────── */
  function updateWorldEvents(dt) {
    const p = P(), w = G.world;
    G.exploreT -= dt;
    if (G.exploreT <= 0) {
      G.exploreT = 0.25;
      const R = 9, ptx = Math.floor(p.x), pty = Math.floor(p.y);
      for (let y = pty - R; y <= pty + R; y++) for (let x = ptx - R; x <= ptx + R; x++) {
        if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
        if ((x - ptx) ** 2 + (y - pty) ** 2 <= R * R) G.explored[y * w.W + x] = 1;
      }
      for (const m of w.mines) {
        if (!G.known.includes(m.id) && Math.hypot(m.x - p.x, m.y - p.y) < 7) {
          G.known.push(m.id);
          toast(`새 광산 발견: ${m.name}`, 'good');
        }
      }
      const inT = inTown(p.x, p.y);
      if (inT !== G.wasInTown) {
        if (inT && G.wasInTown === false) UI.banner('더스트우드', '국경 마을');
        G.wasInTown = inT;
      }
      if (G.waypoint && Math.hypot(G.waypoint.x - p.x, G.waypoint.y - p.y) < 2) { toast(`목적지 도착: ${G.waypoint.label}`, 'good'); G.waypoint = null; }
    }
    // 적 출현
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 3;
      for (const e of G.enemies) if (Math.hypot(e.x - p.x, e.y - p.y) > 30 && e.type !== 'boss') e.despawn = true;
      const dTown = Math.hypot(p.x - w.town.cx, p.y - w.town.cy);
      const night = isNightTime();
      const max = (night ? 6 : 3) + (dTown > 45 ? 1 : 0);
      const count = G.enemies.filter((e) => e.type !== 'boss').length;
      if (dTown > 22 && count < max && Math.random() < (night ? 0.7 : 0.42)) {
        const r = Math.random();
        const type = night
          ? (r < 0.5 ? 'coyote' : r < 0.75 ? 'bandit' : r < 0.9 ? 'snake' : 'scorpion')
          : (r < 0.33 ? 'snake' : r < 0.6 ? 'scorpion' : r < 0.82 ? 'bandit' : 'coyote');
        const n = type === 'coyote' && night ? 2 : type === 'bandit' && Math.random() < 0.3 ? 2 : 1;
        for (let tries = 0; tries < 12; tries++) {
          const a = Math.random() * Math.PI * 2, d = 11 + Math.random() * 4;
          const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
          const tx = Math.floor(x), ty = Math.floor(y);
          if (tx < 1 || ty < 1 || tx >= w.W - 1 || ty >= w.H - 1) continue;
          if (solidAt(tx, ty) || w.ground[ty * w.W + tx] === GT.WATER || inTown(x, y)) continue;
          for (let k = 0; k < n; k++) Ent.spawn(type, x + k * 0.8, y + k * 0.5);
          break;
        }
      }
    }
    // 산적 두목
    if (G.quest.boss === 'active') {
      const h = w.hideout, d = Math.hypot(h.x - p.x, h.y - p.y);
      if (!G.bossSpawned && d < 15) {
        G.bossSpawned = true;
        Ent.spawn('boss', h.x + 0.5, h.y - 0.5);
        for (let k = 0; k < 3; k++) Ent.spawn('bandit', h.x + 0.5 + Math.cos(k * 2.1) * 2.5, h.y + 0.5 + Math.sin(k * 2.1) * 2.5);
        toast('“여기까지 찾아오다니 배짱 한번 좋군!” — 붉은 스카프 맥', 'bad');
      } else if (G.bossSpawned && d > 40) {
        G.bossSpawned = false;
        G.enemies = G.enemies.filter((e) => e.type !== 'boss');
      }
    }
  }

  /* ───────── 광산 시야 ───────── */
  function lightRadius() {
    const p = P();
    if (G.scene !== 'mine') return 0;
    if (p.inv.oil <= 0) return 1.7;
    return (p.inv.lantern >= 2 ? 7 : 5.5) * (0.97 + Math.sin(performance.now() / 130) * 0.015 + Math.sin(performance.now() / 47) * 0.01);
  }
  function updateVisibility() {
    const L = G.level, p = P();
    if (!G.vis || G.vis.length !== L.W * L.H) G.vis = new Uint8Array(L.W * L.H);
    G.vis.fill(0);
    const R = Math.ceil(lightRadius()) + 1;
    const ptx = Math.floor(p.x), pty = Math.floor(p.y);
    for (let y = pty - R; y <= pty + R; y++) for (let x = ptx - R; x <= ptx + R; x++) {
      if (x < 0 || y < 0 || x >= L.W || y >= L.H) continue;
      const cx = x + 0.5, cy = y + 0.5, d = Math.hypot(cx - p.x, cy - p.y);
      if (d > R) continue;
      const n = Math.ceil(d * 2.5);
      let ok = true;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const sx = Math.floor(p.x + (cx - p.x) * t), sy = Math.floor(p.y + (cy - p.y) * t);
        if (sx === x && sy === y) break;
        if (MT_SOLID.has(L.tiles[sy * L.W + sx])) { ok = false; break; }
      }
      if (ok) { G.vis[y * L.W + x] = 1; L.seen[y * L.W + x] = 1; }
    }
  }

  /* ───────── 메인 루프 ───────── */
  function update(dt) {
    if (G.demo) {
      cam.x = 64 + Math.sin(performance.now() / 9000) * 18;
      cam.y = 60 + Math.cos(performance.now() / 11000) * 10;
      return;
    }
    if (UI.isOpen() || G.paused) {
      const esc = Input.consume('esc'), map = Input.consume('map'), bag = Input.consume('bag');
      if (esc || (map && UI.current() === 'map') || (bag && UI.current() === 'bag')) UI.tryClose();
      return;
    }
    if (Input.consume('esc')) { UI.openMenu(); return; }
    if (Input.consume('map')) { UI.openMap(); return; }
    if (Input.consume('bag')) { UI.openBag(); return; }

    G.context = getContext();
    updatePlayer(dt);
    if (G.paused || UI.isOpen()) return;
    updateNeeds(dt);
    Ent.update(dt);
    Ent.updateBullets(dt);
    Ent.updateBombs(dt);
    Ent.updatePickups(dt);
    FX.update(dt);
    if (G.scene === 'world') updateWorldEvents(dt);
    else { updateCaveIns(dt); updateVisibility(); if (Math.random() < dt * 0.3) Sfx.play('drip'); }

    const p = P();
    cam.x += (p.x - cam.x) * Math.min(1, dt * 8);
    cam.y += (p.y - 0.4 - cam.y) * Math.min(1, dt * 8);
    cam.shake = Math.max(0, cam.shake - dt * 1.6);
  }
  function snapCamera() { if (G && G.player) { cam.x = G.player.x; cam.y = G.player.y - 0.4; } }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0);
    last = ts;
    if (G) {
      update(dt);
      render();
      hudT -= dt;
      if (hudT <= 0 && !G.demo) { hudT = 0.12; UI.refreshHud(); }
    }
    Input.endFrame();
    requestAnimationFrame(loop);
  }

  /* ───────── 렌더링 ───────── */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(window.innerWidth * dpr)), h = Math.max(1, Math.floor(window.innerHeight * dpr));
    if (w !== cw || h !== ch) {
      cw = w; ch = h;
      canvas.width = w; canvas.height = h;
      lightC.width = w; lightC.height = h;
    }
  }
  function tilePx() {
    const sw = window.innerWidth, sh = window.innerHeight;
    const short = Math.min(sw, sh);
    const tiles = sw < sh ? 11.5 : sw > 1000 ? 15 : 13;
    return Math.round(U.clamp(short / tiles, 26, 72) * dpr);
  }

  function render() {
    resize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = false;
    const Pp = tilePx();
    cam.P = Pp;
    const mapW = G.scene === 'world' ? G.world.W : G.level.W, mapH = G.scene === 'world' ? G.world.H : G.level.H;
    const halfW = cw / 2 / Pp, halfH = ch / 2 / Pp;
    // 지상은 가장자리 3칸까지만 넘어가게, 광산은 제한 없이 (터치 버튼에 캐릭터가 가리지 않도록)
    const margin = G.scene === 'world' ? 3 : 99;
    const cx = mapW + margin * 2 > halfW * 2 ? U.clamp(cam.x, halfW - margin, mapW + margin - halfW) : mapW / 2;
    const cy = mapH + margin * 2 > halfH * 2 ? U.clamp(cam.y, halfH - margin, mapH + margin - halfH) : mapH / 2;
    const sh = cam.shake > 0 ? cam.shake * 0.35 * Pp : 0;
    cam.offX = Math.round(cw / 2 - cx * Pp + (Math.random() - 0.5) * sh);
    cam.offY = Math.round(ch / 2 - cy * Pp + (Math.random() - 0.5) * sh);
    ctx.setTransform(Pp, 0, 0, Pp, cam.offX, cam.offY);
    const x0 = Math.max(0, Math.floor(-cam.offX / Pp) - 1), y0 = Math.max(0, Math.floor(-cam.offY / Pp) - 1);
    const x1 = Math.min(mapW - 1, Math.ceil((cw - cam.offX) / Pp) + 1), y1 = Math.min(mapH - 1, Math.ceil((ch - cam.offY) / Pp) + 2);
    const labels = [];
    if (G.scene === 'world') drawWorld(x0, y0, x1, y1, labels);
    else drawMine(x0, y0, x1, y1);
    drawEffects();
    drawLighting(Pp);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawScreenText(labels, Pp);
  }

  function drawShadow(x, y, rx) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y, rx, rx * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawWorld(x0, y0, x1, y1, labels) {
    const w = G.world, T = Art.T;
    const wf = Math.floor(performance.now() / 450) % 3;
    const sorted = [];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * w.W + tx, g = w.ground[i];
        let tex;
        switch (g) {
          case GT.SAND: tex = Art.pickTile('sand', tx, ty); break;
          case GT.DIRT: tex = Art.pickTile('dirt', tx, ty); break;
          case GT.GRASS: tex = Art.pickTile('grass', tx, ty); break;
          case GT.ROCKY: tex = Art.pickTile('rocky', tx, ty); break;
          case GT.MOUNTAIN: {
            const below = ty + 1 < w.H ? w.ground[i + w.W] : GT.MOUNTAIN;
            tex = Art.pickTile(below === GT.MOUNTAIN ? 'mtn' : 'mtnFace', tx, ty);
            break;
          }
          case GT.WATER: tex = T.water[(wf + tx + ty) % 3]; break;
          case GT.TOWN: tex = Art.pickTile('town', tx, ty); break;
          default: tex = Art.pickTile('road', tx, ty);
        }
        ctx.drawImage(tex, tx, ty, 1, 1);
        if (g === GT.WATER) {
          ctx.fillStyle = 'rgba(236,222,180,0.6)';
          if (w.ground[i - w.W] !== GT.WATER) ctx.fillRect(tx, ty, 1, 0.07);
          if (w.ground[i + w.W] !== GT.WATER) ctx.fillRect(tx, ty + 0.93, 1, 0.07);
          if (w.ground[i - 1] !== GT.WATER) ctx.fillRect(tx, ty, 0.07, 1);
          if (w.ground[i + 1] !== GT.WATER) ctx.fillRect(tx + 0.93, ty, 0.07, 1);
        } else if (g !== GT.MOUNTAIN && ty > 0 && w.ground[i - w.W] === GT.MOUNTAIN) {
          ctx.fillStyle = 'rgba(40,20,10,0.22)';
          ctx.fillRect(tx, ty, 1, 0.22);
        }
        const o = w.obj[i];
        if (!o) continue;
        if (o === OT.MINE) Art.draw(ctx, 'mine', tx + 0.5, ty + 1);
        else if (o === OT.LOST) { if (G.lostRevealed) Art.draw(ctx, 'lostmine', tx + 0.5, ty + 1); }
        else if (o === OT.SKULL) Art.draw(ctx, 'skull', tx + 0.5, ty + 0.8);
        else if (o === OT.SHRUB) Art.draw(ctx, 'shrub', tx + 0.5, ty + 0.95);
        else if (o !== OT.BUILDING) sorted.push({ y: ty + 0.95, o, tx, ty });
      }
    }
    for (const b of w.buildings) {
      if (b.x + b.w < x0 || b.x > x1 + 1 || b.y + b.h < y0 || b.y > y1 + 1) continue;
      sorted.push({ y: b.y + b.h, b });
    }
    // 아이템
    for (const k of G.pickups) drawPickup(k);
    for (const e of G.enemies) sorted.push({ y: e.y, e });
    if (G.player.mule && !G.demo) sorted.push({ y: muleY(), mule: true });
    if (!G.demo) sorted.push({ y: G.player.y, player: true });
    sorted.sort((a, b) => a.y - b.y);
    const flameT = performance.now() / 90;
    for (const s of sorted) {
      if (s.player) drawPlayer();
      else if (s.e) drawEnemy(s.e);
      else if (s.mule) drawMule();
      else if (s.b) {
        Art.draw(ctx, 'b_' + s.b.id, s.b.x + s.b.w / 2, s.b.y + s.b.h);
        labels.push({ x: s.b.x + s.b.w / 2, y: s.b.y + 0.17, text: s.b.name, size: 0.4, color: '#3a2412' });
      } else {
        const { o, tx, ty } = s;
        const cx = tx + 0.5, by = ty + 1;
        switch (o) {
          case OT.CACTUS: Art.draw(ctx, 'cactus', cx, by - 0.02); break;
          case OT.CACTUS2: Art.draw(ctx, 'cactus2', cx, by - 0.05); break;
          case OT.BOULDER: Art.draw(ctx, 'boulder', cx, by - 0.02); break;
          case OT.DEADTREE: Art.draw(ctx, 'deadtree', cx, by); break;
          case OT.TREE: Art.draw(ctx, 'tree', cx, by); break;
          case OT.TENT: Art.draw(ctx, 'tent', cx, by + 0.05); break;
          case OT.DTENT: Art.draw(ctx, 'dtent', cx, by + 0.05); break;
          case OT.CHEST: Art.draw(ctx, 'chest', cx, by - 0.1); break;
          case OT.CHEST_OPEN: Art.draw(ctx, 'chestOpen', cx, by - 0.1); break;
          case OT.WELL: Art.draw(ctx, 'well', cx, by); break;
          case OT.BARREL: Art.draw(ctx, 'barrel', cx, by - 0.05); break;
          case OT.CRATE: Art.draw(ctx, 'crate', cx, by - 0.05); break;
          case OT.POST: Art.draw(ctx, 'post', cx, by - 0.1); break;
          case OT.FENCE: Art.draw(ctx, 'fence', cx, by - 0.1); break;
          case OT.SIGN:
            Art.draw(ctx, 'sign', cx, by);
            labels.push({ x: cx, y: ty - 0.05, text: '더스트우드', size: 0.2, color: '#2a1608' });
            break;
          case OT.FIRE: {
            Art.draw(ctx, 'fire', cx, by - 0.2);
            for (let k = 0; k < 3; k++) {
              const fh = 0.25 + Math.sin(flameT + k * 2) * 0.08;
              ctx.fillStyle = k === 0 ? '#ff7a20' : k === 1 ? '#ffb030' : '#ffe080';
              ctx.fillRect(cx - 0.12 + k * 0.08 - 0.04, by - 0.5 - fh + k * 0.06, 0.12, fh);
            }
            if (Math.random() < 0.05) FX.add(cx, by - 0.6, (Math.random() - 0.5) * 0.3, -0.8, 1, '#ffcf6a', 0.05, 0);
            break;
          }
          default: break;
        }
      }
    }
    // 웨이포인트 표시
    if (G.waypoint) {
      const bob = Math.sin(performance.now() / 200) * 0.12;
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(G.waypoint.x, G.waypoint.y - 0.4 + bob);
      ctx.lineTo(G.waypoint.x - 0.25, G.waypoint.y - 0.85 + bob);
      ctx.lineTo(G.waypoint.x + 0.25, G.waypoint.y - 0.85 + bob);
      ctx.fill();
    }
  }

  const MINE_TEX = {
    [MT.DIRT]: 'wdirt', [MT.ROCK]: 'wrock', [MT.HARD]: 'whard', [MT.BEDROCK]: 'wbed',
    [MT.GOLD]: 'wgold', [MT.RICH]: 'wrich', [MT.RUBBLE]: 'mrubble', [MT.HEART]: 'mheart',
  };
  function drawMine(x0, y0, x1, y1) {
    const L = G.level;
    const now = performance.now();
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const i = ty * L.W + tx;
        if (!L.seen[i]) continue;
        const t = L.tiles[i];
        let key;
        if (MT_WALL.has(t) && t !== MT.HEART) {
          const below = ty + 1 < L.H ? L.tiles[i + L.W] : MT.BEDROCK;
          key = MINE_TEX[t] + (MT_SOLID.has(below) ? '' : 'F');
        } else {
          switch (t) {
            case MT.EXIT: case MT.UP: key = 'mexit'; break;
            case MT.DOWN: key = 'mdown'; break;
            case MT.PUDDLE: key = 'mpuddle'; break;
            case MT.TIMBER: key = 'mtimber'; break;
            case MT.RUBBLE: key = 'mrubble'; break;
            case MT.HEART: key = 'mheart'; break;
            default: key = 'mfloor';
          }
        }
        ctx.drawImage(Art.pickTile(key, tx, ty), tx, ty, 1, 1);
        if (t === MT.CHEST) Art.draw(ctx, 'chest', tx + 0.5, ty + 0.9);
        else if (t === MT.CHEST_OPEN) Art.draw(ctx, 'chestOpen', tx + 0.5, ty + 0.9);
        else if (t === MT.FCHEST) Art.draw(ctx, 'fchest', tx + 0.5, ty + 0.9);
        const vis = G.vis[i];
        if ((t === MT.GOLD || t === MT.RICH || t === MT.HEART) && vis) {
          const ph = (now / 600 + U.hash2(tx, ty, 5) * 6) % 6;
          if (ph < 0.5) {
            const sx = tx + 0.2 + U.hash2(tx, ty, 6) * 0.6, sy = ty + 0.2 + U.hash2(tx, ty, 7) * 0.5;
            const s = 0.06 + Math.sin(ph * Math.PI * 2) * 0.05;
            ctx.fillStyle = '#fff8d0';
            ctx.fillRect(sx - s, sy - 0.015, s * 2, 0.03); ctx.fillRect(sx - 0.015, sy - s, 0.03, s * 2);
          }
        }
        if (!vis) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(tx, ty, 1, 1); }
      }
    }
    // 낙반 경고 영역
    for (const c of G.caveins) {
      ctx.fillStyle = `rgba(255,60,30,${0.12 + Math.sin(now / 60) * 0.06})`;
      ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
    }
    for (const k of G.pickups) if (G.vis[Math.floor(k.y) * L.W + Math.floor(k.x)]) drawPickup(k);
    const list = G.enemies.filter((e) => e.type === 'ghost' ? Math.hypot(e.x - G.player.x, e.y - G.player.y) < lightRadius() + 2.5 : G.vis[Math.floor(e.y) * L.W + Math.floor(e.x)]);
    list.push({ player: true, y: G.player.y });
    list.sort((a, b) => a.y - b.y);
    for (const e of list) { if (e.player) drawPlayer(); else drawEnemy(e); }
    // 채굴 대상 표시
    const c = G.context;
    if (c && c.dig && !c.hard && !c.bedrock) {
      const { tx, ty } = digTarget();
      ctx.strokeStyle = 'rgba(255,230,150,0.55)';
      ctx.lineWidth = 0.05;
      ctx.strokeRect(tx + 0.05, ty + 0.05, 0.9, 0.9);
    }
  }

  function drawPickup(k) {
    const key = { ore: 'ore', nugget: 'nugget', money: 'coin', ammo: 'ammo', food: 'food', frag: 'frag', dynamite: 'stick', oil: 'barrel' }[k.kind] || 'coin';
    const bob = Math.sin(k.t * 4) * 0.05 + k.z;
    drawShadow(k.x, k.y + 0.05, 0.18);
    Art.draw(ctx, key, k.x, k.y - bob, false, key === 'barrel' ? 0.5 : 1);
    if (k.kind === 'frag' || k.kind === 'nugget') {
      if (Math.random() < 0.05) FX.add(k.x + (Math.random() - 0.5) * 0.4, k.y - 0.3, 0, -0.6, 0.5, '#fff2a0', 0.05, 0);
    }
  }

  function personKey(base, dir4, frame) {
    const d = dir4 === 0 ? 0 : dir4 === 1 ? 1 : 2;
    return `${base}_${d}_${frame}`;
  }
  function drawPlayer() {
    const p = G.player;
    if (p.dead) {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.PI / 2);
      Art.draw(ctx, 'player_0_0', 0, 0.3);
      ctx.restore();
      return;
    }
    if (p.iframes > 0 && Math.floor(p.iframes * 18) % 2 === 0) return;
    const frame = p.moving ? 1 + (Math.floor(p.walkT * 2.4) % 2) : 0;
    if (G.scene === 'world' && p.mounted) {
      drawShadow(p.x, p.y + 0.1, 0.7);
      const hf = p.moving ? 1 + (Math.floor(p.walkT * 1.8) % 2) : 0;
      const flip = p.face < 0;
      Art.draw(ctx, 'horse_' + hf, p.x, p.y + 0.2, flip);
      const c = Art.S['player_2_0'];
      const srcH = 15;
      const w = c.width / 16, hh = srcH / 16;
      ctx.save();
      ctx.translate(p.x + (flip ? 0.05 : -0.05), 0);
      if (flip) ctx.scale(-1, 1);
      ctx.drawImage(c, 0, 0, c.width, srcH, -w / 2 - 0.05, p.y - 0.62 - hh + (p.moving && hf === 1 ? -0.04 : 0), w, hh);
      ctx.restore();
      return;
    }
    drawShadow(p.x, p.y + 0.08, 0.32);
    const d = p.dir4 || 0;
    Art.draw(ctx, personKey('player', d, frame), p.x, p.y + 0.15, d === 3);
    // 광산에서는 손에 든 등불
    if (G.scene === 'mine' && p.inv.oil > 0) {
      const lx = p.x + (d === 3 ? -0.38 : 0.38), ly = p.y - 0.3;
      ctx.fillStyle = '#5a4a3a'; ctx.fillRect(lx - 0.06, ly - 0.1, 0.12, 0.16);
      ctx.fillStyle = '#ffd060'; ctx.fillRect(lx - 0.04, ly - 0.07, 0.08, 0.1);
    }
  }
  function muleY() {
    const t = G.trail;
    return t.length > 12 ? t[t.length - 12].y : G.player.y - 0.01;
  }
  function drawMule() {
    const t = G.trail;
    if (t.length < 12) return;
    const a = t[t.length - 12], b = t[t.length - 11];
    const flip = b.x < a.x - 0.001 ? true : b.x > a.x + 0.001 ? false : G.player.face < 0;
    drawShadow(a.x, a.y + 0.08, 0.5);
    const f = G.player.moving ? 1 + (Math.floor(G.player.walkT * 2) % 2) : 0;
    Art.draw(ctx, 'mule_' + f, a.x, a.y + 0.15, flip);
  }
  function drawEnemy(e) {
    const d = e.d;
    const sc = d.scale || 1;
    if (e.hurt > 0 && Math.floor(e.hurt * 30) % 2 === 0) ctx.globalAlpha = 0.45;
    if (e.type === 'ghost') {
      const f = Math.floor(e.t * 3) % 2;
      const a = 0.55 + Math.sin(e.t * 3) * 0.15;
      Art.draw(ctx, 'ghost_' + f, e.x, e.y + Math.sin(e.t * 2) * 0.1, e.face < 0, 1, a);
    } else if (d.person) {
      drawShadow(e.x, e.y + 0.08, 0.32 * sc);
      const frame = e.moving ? 1 + (Math.floor(e.t * 5) % 2) : 0;
      const dir4 = e.dir === 0 ? 0 : e.dir === 1 ? 1 : e.face < 0 ? 3 : 2;
      Art.draw(ctx, personKey(d.sprite, dir4, frame), e.x, e.y + 0.15, dir4 === 3, sc);
    } else if (e.type === 'bat') {
      const f = Math.floor(e.t * 10) % 3;
      drawShadow(e.x, e.y + 0.3, 0.2);
      Art.draw(ctx, 'bat_' + f, e.x, e.y - 0.25 + Math.sin(e.t * 5) * 0.08, e.face < 0);
    } else {
      const fr = d.frames || 2;
      const f = e.moving ? Math.floor(e.t * 8) % fr : 0;
      drawShadow(e.x, e.y + 0.05, d.r);
      Art.draw(ctx, `${d.sprite}_${f}`, e.x, e.y + 0.2, e.face < 0);
    }
    ctx.globalAlpha = 1;
  }

  function drawEffects() {
    for (const b of G.bombs) {
      drawShadow(b.x, b.y, 0.12);
      ctx.save(); ctx.translate(b.x, b.y - 0.2); ctx.rotate(b.t * 6);
      Art.draw(ctx, 'stick', 0, 0.25);
      ctx.restore();
    }
    ctx.lineWidth = 0.07;
    for (const b of G.bullets) {
      ctx.strokeStyle = b.from === 'p' ? '#fff3b0' : '#ff9a6a';
      ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (const q of G.particles) {
      ctx.globalAlpha = q.fade ? Math.max(0, q.life / q.max) : 1;
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    ctx.globalAlpha = 1;
  }

  function punch(x, y, r, strength = 1) {
    const g = lctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(0.55, `rgba(0,0,0,${strength * 0.75})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lctx.fillStyle = g;
    lctx.beginPath(); lctx.arc(x, y, r, 0, Math.PI * 2); lctx.fill();
  }
  function drawLighting(Pp) {
    const p = G.player;
    const sx = (wx) => cam.offX + wx * Pp, sy = (wy) => cam.offY + wy * Pp;
    let dark = 0, col = '0,0,0';
    if (G.scene === 'mine') { dark = 0.9; col = '0,0,0'; }
    else if (!G.demo) { dark = nightness() * 0.74; col = '8,12,34'; }
    else dark = 0;
    if (G.scene === 'world' && !G.demo) {
      const hh = G.time / 60;
      if (hh > 16.5 && hh < 19.5) {
        const a = Math.sin(((hh - 16.5) / 3) * Math.PI) * 0.16;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(255,110,40,${a})`;
        ctx.fillRect(0, 0, cw, ch);
      }
    }
    if (dark < 0.02) return;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, cw, ch);
    lctx.fillStyle = `rgba(${col},${dark})`;
    lctx.fillRect(0, 0, cw, ch);
    lctx.globalCompositeOperation = 'destination-out';
    if (G.scene === 'mine') {
      punch(sx(p.x), sy(p.y - 0.3), lightRadius() * Pp, 1);
      const L = G.level;
      const ex = L.entry;
      if (G.levelNo === 1) punch(sx(ex.x + 0.5), sy(ex.y + 0.5), 2.6 * Pp, 0.8);
      if (L.heart && L.tiles[L.heart.y * L.W + L.heart.x] === MT.HEART && L.seen[L.heart.y * L.W + L.heart.x]) punch(sx(L.heart.x + 0.5), sy(L.heart.y + 0.5), 2.2 * Pp, 0.7);
      for (const b of G.bombs) punch(sx(b.x), sy(b.y), 1.4 * Pp, 0.6);
    } else {
      punch(sx(p.x), sy(p.y - 0.3), 4.6 * Pp, 1);
      const w = G.world;
      for (const b of w.buildings) {
        punch(sx(b.x + 1.15), sy(b.y + 2.1), 1.5 * Pp, 0.7);
        punch(sx(b.x + 3.85), sy(b.y + 2.1), 1.5 * Pp, 0.7);
      }
      const fl = 1 + Math.sin(performance.now() / 80) * 0.05;
      for (const c of w.camps) punch(sx(c.x + 1.5), sy(c.y + 0.5), 3 * Pp * fl, 0.85);
      punch(sx(w.hideout.x + 0.5), sy(w.hideout.y + 0.5), 3.4 * Pp * fl, 0.85);
      if (G.lostRevealed) punch(sx(w.lost.x + 0.5), sy(w.lost.y + 0.6), 1.8 * Pp, 0.7);
    }
    for (const f of G.flashes) punch(sx(f.x), sy(f.y), f.r * Pp * (f.life / f.max + 0.3), Math.min(1, f.life / f.max + 0.2));
    lctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightC, 0, 0);
    if (G.scene === 'world' && dark > 0.2) {
      ctx.globalCompositeOperation = 'lighter';
      const w = G.world;
      for (const b of w.buildings) {
        for (const ox of [1.15, 3.85]) {
          const x = sx(b.x + ox), y = sy(b.y + 2.1);
          if (x < -50 || y < -50 || x > cw + 50 || y > ch + 50) continue;
          ctx.fillStyle = `rgba(255,190,90,${dark * 0.35})`;
          ctx.fillRect(x - 0.38 * Pp, y - 0.38 * Pp, 0.76 * Pp, 0.7 * Pp);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawScreenText(labels, Pp) {
    const sx = (wx) => cam.offX + wx * Pp, sy = (wy) => cam.offY + wy * Pp;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fam = '"Black Han Sans","Apple SD Gothic Neo","Malgun Gothic",sans-serif';
    for (const l of labels) {
      ctx.font = `${Math.round(l.size * Pp)}px ${fam}`;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, sx(l.x), sy(l.y));
    }
    for (const f of G.floaters) {
      const a = Math.min(1, f.life / f.max * 2);
      ctx.globalAlpha = a;
      ctx.font = `${Math.round(0.34 * Pp)}px ${fam}`;
      ctx.lineWidth = Math.max(2, 0.08 * Pp);
      ctx.strokeStyle = 'rgba(20,10,4,0.9)';
      ctx.strokeText(f.text, sx(f.x), sy(f.y));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, sx(f.x), sy(f.y));
    }
    ctx.globalAlpha = 1;
    if (G.demo) return;
    // 채굴 진행 막대
    if (G.dig) {
      const x = sx(G.dig.tx + 0.5), y = sy(G.dig.ty - 0.15);
      const bw = Pp * 0.9, bh = Math.max(6, Pp * 0.12);
      ctx.fillStyle = 'rgba(20,10,4,0.85)'; ctx.fillRect(x - bw / 2 - 2, y - bh / 2 - 2, bw + 4, bh + 4);
      ctx.fillStyle = '#ffd34d'; ctx.fillRect(x - bw / 2, y - bh / 2, bw * Math.min(1, G.dig.t / G.dig.need), bh);
    }
    // 웨이포인트 화살표
    if (G.waypoint && G.scene === 'world') {
      const wx = sx(G.waypoint.x), wy = sy(G.waypoint.y);
      const m = 70 * dpr;
      const p = G.player;
      const dist = Math.round(Math.hypot(G.waypoint.x - p.x, G.waypoint.y - p.y) * 10);
      if (wx < m || wy < m * 1.4 || wx > cw - m || wy > ch - m * 2) {
        const cx = cw / 2, cy = ch / 2;
        const ang = Math.atan2(wy - cy, wx - cx);
        const rx = cw / 2 - m, ry = ch / 2 - m * 1.6;
        const k = Math.min(Math.abs(rx / Math.cos(ang)), Math.abs(ry / Math.sin(ang)));
        const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
        ctx.fillStyle = 'rgba(20,10,4,0.75)';
        ctx.beginPath(); ctx.arc(0, 0, 22 * dpr, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd34d';
        ctx.beginPath(); ctx.moveTo(15 * dpr, 0); ctx.lineTo(-7 * dpr, -10 * dpr); ctx.lineTo(-3 * dpr, 0); ctx.lineTo(-7 * dpr, 10 * dpr); ctx.fill();
        ctx.restore();
        ctx.font = `${Math.round(12 * dpr)}px ${fam}`;
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(`${G.waypoint.label} ${dist}m`, ax, ay + 34 * dpr);
      }
    }
    // 보스 체력
    const boss = G.enemies.find((e) => e.type === 'boss');
    if (boss && Math.hypot(boss.x - G.player.x, boss.y - G.player.y) < 14) {
      const bw = Math.min(cw * 0.6, 360 * dpr), bh = 10 * dpr;
      const x = (cw - bw) / 2, y = ch - (Input.touchMode ? 210 : 90) * dpr;
      ctx.fillStyle = 'rgba(20,10,4,0.85)'; ctx.fillRect(x - 3, y - 3, bw + 6, bh + 6);
      ctx.fillStyle = '#c0302a'; ctx.fillRect(x, y, bw * Math.max(0, boss.hp / boss.d.hp), bh);
      ctx.font = `${Math.round(13 * dpr)}px ${fam}`; ctx.fillStyle = '#ffe9b0';
      ctx.fillText(boss.d.name, cw / 2, y - 12 * dpr);
    }
  }

  /* ───────── 저장/불러오기 ───────── */
  function serialize() {
    const p = G.player;
    if (G.scene === 'mine') stashLevel();
    const mines = {};
    for (const id in G.mineStates) {
      mines[id] = {};
      for (const lv in G.mineStates[id]) {
        const s = G.mineStates[id][lv];
        mines[id][lv] = { t: U.rleEncode(s.tiles), s: U.rleEncode(s.seen), n: s.tiles.length };
      }
    }
    const pl = { ...p }; delete pl.iframes; delete pl.dead; delete pl.moving; delete pl.walkT; delete pl.shootCd;
    return JSON.stringify({
      v: 1, seed: G.seed, day: G.day, time: G.time, goldPrice: G.goldPrice,
      scene: G.scene, mineId: G.mineId, levelNo: G.levelNo,
      player: pl, explored: U.rleEncode(G.explored), known: G.known, visited: G.visited, rumored: G.rumored, rumorStep: G.rumorStep,
      quest: G.quest, campsOpened: G.campsOpened, lostRevealed: G.lostRevealed, waypoint: G.waypoint,
      mines, saloon: G.saloon, flags: G.flags, stats: G.stats, savedAt: Date.now(),
    });
  }
  function save() {
    if (!G || G.demo || G.player.dead) return false;
    try { return U.store.set(SAVE_KEY, serialize()); } catch (e) { return false; }
  }
  function hasSave() { return !!U.store.get(SAVE_KEY); }
  function saveInfo() {
    try { const d = JSON.parse(U.store.get(SAVE_KEY)); return d ? { day: d.day, money: d.player.money + d.player.bank, frags: Object.values(d.player.frags).filter(Boolean).length } : null; }
    catch (e) { return null; }
  }
  function load() {
    let d;
    try { d = JSON.parse(U.store.get(SAVE_KEY)); } catch (e) { d = null; }
    if (!d || d.v !== 1) return false;
    G = newState(d.seed);
    G.day = d.day; G.time = d.time; G.goldPrice = d.goldPrice;
    Object.assign(G.player, d.player);
    G.player.inv = { ...defaultInv(), ...d.player.inv };
    G.explored = U.rleDecode(d.explored, G.world.W * G.world.H);
    G.known = d.known || []; G.visited = d.visited || []; G.rumored = d.rumored || []; G.rumorStep = d.rumorStep || 0;
    G.quest = { ...G.quest, ...d.quest }; G.campsOpened = d.campsOpened || []; G.lostRevealed = !!d.lostRevealed; G.waypoint = d.waypoint || null;
    G.saloon = d.saloon || G.saloon; G.flags = d.flags || {}; G.stats = { ...G.stats, ...d.stats };
    for (const id in d.mines || {}) {
      G.mineStates[id] = {};
      for (const lv in d.mines[id]) {
        const m = d.mines[id][lv];
        G.mineStates[id][lv] = { tiles: U.rleDecode(m.t, m.n), seen: U.rleDecode(m.s, m.n) };
      }
    }
    for (const c of G.world.camps) if (G.campsOpened.includes(c.id)) G.world.obj[c.chest.y * G.world.W + c.chest.x] = OT.CHEST_OPEN;
    if (G.quest.boss === 'killed' || G.quest.boss === 'done') G.bossSpawned = true;
    if (d.scene === 'mine' && d.mineId != null) {
      const px = G.player.x, py = G.player.y;
      G.scene = 'world';
      enterMine(d.mineId === LOST_ID ? LOST_ID : Number(d.mineId), d.levelNo, false);
      if (!collides(px, py, 0.3)) { G.player.x = px; G.player.y = py; }
    }
    G.wasInTown = inTown(G.player.x, G.player.y);
    Sfx.setMusicMode(G.scene === 'mine' ? 'mine' : 'desert');
    snapCamera();
    return true;
  }
  function wipeSave() { U.store.del(SAVE_KEY); }

  /* ───────── 시작 ───────── */
  function startDemo() {
    G = newState(20260117);
    G.demo = true;
    G.time = 17.2 * 60;
  }
  function newGame() {
    const seed = (Math.random() * 1e9) >>> 0;
    G = newState(seed);
    G.wasInTown = true;
    snapCamera();
    Sfx.setMusicMode('desert');
    save();
  }
  function continueGame() { return load(); }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d');
    lightC = document.createElement('canvas');
    lctx = lightC.getContext('2d');
    Art.init();
    Input.bindTouch();
    UI.init();
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { save(); if (G && !G.demo && !UI.isOpen()) UI.openMenu(); }
    });
    window.addEventListener('pagehide', save);
    startDemo();
    UI.showTitle();
    requestAnimationFrame((ts) => { last = ts; loop(ts); });
  }

  return {
    init, newGame, continueGame, hasSave, saveInfo, save, wipeSave, startDemo,
    solidAt, moveCircle, bulletBlocked, lineOfSight, damagePlayer, explode, collect, toast,
    capacity, eat, drink, useBandage, useAntidote, advanceTime, heal, enterMine, exitMine, markRumor, gotFragment,
    isNightTime, inTown, snapCamera, LOST_ID,
    get cam() { return cam; },
  };
})();

if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => Game.init());
else Game.init();
