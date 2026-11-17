'use strict';
/* 지상(사막 협곡) 맵 생성 */
const GT = { SAND: 0, DIRT: 1, GRASS: 2, ROCKY: 3, MOUNTAIN: 4, WATER: 5, TOWN: 6, ROAD: 7 };
const OT = {
  NONE: 0, CACTUS: 1, BOULDER: 2, SHRUB: 3, DEADTREE: 4, SKULL: 5, TREE: 6, MINE: 7, LOST: 8,
  TENT: 9, FIRE: 10, CHEST: 11, CHEST_OPEN: 12, WELL: 13, BUILDING: 14, BARREL: 15, CRATE: 16,
  SIGN: 17, DTENT: 18, POST: 19, CACTUS2: 20, FENCE: 21,
};
const OBJ_SOLID = new Set([OT.CACTUS, OT.BOULDER, OT.DEADTREE, OT.TREE, OT.TENT, OT.CHEST, OT.CHEST_OPEN,
  OT.WELL, OT.BUILDING, OT.BARREL, OT.CRATE, OT.SIGN, OT.DTENT, OT.POST, OT.CACTUS2, OT.FENCE]);

const BUILDINGS = [
  { id: 'store', name: '잡화점' },
  { id: 'assay', name: '금 분석소' },
  { id: 'bank', name: '은행' },
  { id: 'saloon', name: '살롱' },
  { id: 'hotel', name: '호텔' },
  { id: 'doctor', name: '병원' },
  { id: 'stable', name: '마구간' },
  { id: 'sheriff', name: '보안관' },
];

const MINE_PREFIX = ['까마귀', '해골', '늙은 피트', '붉은 바위', '독수리', '방울뱀', '과부', '한숨', '은빛', '부서진 바퀴',
  '검은 물', '행운', '외로운 별', '모래시계', '녹슨 못', '코요테', '천둥', '마른 샘', '황혼', '푸른 연기', '늑대 이빨', '노새 귀',
  '먼지 폭풍', '돌무덤', '깨진 종', '세 갈래', '은둔자', '불탄 마차'];
const MINE_SUFFIX = ['광산', '갱도', '굴', '광산', '갱도'];

const World = (() => {
  const W = 128, H = 128;

  function generate(seed) {
    const rng = new U.RNG(seed);
    const ground = new Uint8Array(W * H);
    const obj = new Uint8Array(W * H);
    const idx = (x, y) => y * W + x;
    const cx = 64, cy = 64;

    // 1) 고도 & 습도
    const elev = new Float32Array(W * H), moist = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let e = U.fbm(x / 20, y / 20, seed, 4) * 0.8 + U.fbm(x / 7, y / 7, seed + 31, 2) * 0.2;
        const dEdge = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (dEdge < 7) e += (7 - dEdge) * 0.08;
        const dt = Math.hypot(x - cx, (y - cy) * 1.25);
        if (dt < 22) e -= ((22 - dt) / 22) * 0.35;
        elev[idx(x, y)] = e;
        moist[idx(x, y)] = U.fbm(x / 13 + 50, y / 13 + 50, seed + 7, 3);
      }
    }
    const mtnT = U.percentile(elev, 0.74), rockT = U.percentile(elev, 0.64);
    const grassT = U.percentile(moist, 0.82), dirtT = U.percentile(moist, 0.3);
    for (let i = 0; i < W * H; i++) {
      const e = elev[i], m = moist[i];
      if (e > mtnT) ground[i] = GT.MOUNTAIN;
      else if (e > rockT) ground[i] = GT.ROCKY;
      else if (m > grassT) ground[i] = GT.GRASS;
      else if (m < dirtT) ground[i] = GT.DIRT;
      else ground[i] = GT.SAND;
    }
    for (let x = 0; x < W; x++) { ground[idx(x, 0)] = ground[idx(x, H - 1)] = GT.MOUNTAIN; }
    for (let y = 0; y < H; y++) { ground[idx(0, y)] = ground[idx(W - 1, y)] = GT.MOUNTAIN; }

    // 2) 강 두 줄기 (마을을 피해 흐름)
    const paintWater = (x, y) => {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      ground[idx(x, y)] = GT.WATER;
    };
    const bank = (x, y) => {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return;
      const g = ground[idx(x, y)];
      if (g !== GT.WATER && g !== GT.MOUNTAIN) ground[idx(x, y)] = GT.GRASS;
    };
    const rx0 = rng.int(22, 34), rph = rng.range(0, 6);
    for (let y = 0; y < H; y++) {
      const x = Math.round(rx0 + Math.sin(y / 9 + rph) * 4 + (U.fbm(y / 10, 3, seed + 5, 2) - 0.5) * 10);
      for (let k = -1; k <= 1; k++) bank(x + k - 2, y), bank(x + k + 3, y);
      paintWater(x, y); paintWater(x + 1, y);
      if (y % 7 === 0) paintWater(x + 2, y);
    }
    const ry0 = rng.int(96, 106), rph2 = rng.range(0, 6);
    for (let x = 0; x < H; x++) {
      const y = Math.round(ry0 + Math.sin(x / 10 + rph2) * 4 + (U.fbm(x / 10, 9, seed + 6, 2) - 0.5) * 8);
      for (let k = -1; k <= 1; k++) bank(x, y + k - 2), bank(x, y + k + 3);
      paintWater(x, y); paintWater(x, y + 1);
    }
    // 오아시스 연못
    const ponds = [];
    for (let k = 0; k < 4; k++) {
      for (let tries = 0; tries < 40; tries++) {
        const px = rng.int(12, W - 12), py = rng.int(12, H - 12);
        if (Math.hypot(px - cx, py - cy) < 24) continue;
        if (ground[idx(px, py)] === GT.MOUNTAIN) continue;
        const r = rng.range(1.6, 2.8);
        for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) {
          const d = Math.hypot(x, y);
          const tx = px + x, ty = py + y;
          if (tx < 1 || ty < 1 || tx >= W - 1 || ty >= H - 1) continue;
          if (d < r) ground[idx(tx, ty)] = GT.WATER;
          else if (d < r + 2.2 && ground[idx(tx, ty)] !== GT.WATER) ground[idx(tx, ty)] = GT.GRASS;
        }
        ponds.push({ x: px, y: py });
        break;
      }
    }

    // 3) 마을
    const town = { cx, cy, x0: cx - 15, y0: cy - 9, x1: cx + 13, y1: cy + 8 };
    for (let y = town.y0 - 3; y <= town.y1 + 3; y++) for (let x = town.x0 - 3; x <= town.x1 + 3; x++) {
      if (ground[idx(x, y)] === GT.MOUNTAIN || ground[idx(x, y)] === GT.WATER) ground[idx(x, y)] = GT.SAND;
    }
    for (let y = town.y0; y <= town.y1; y++) for (let x = town.x0; x <= town.x1; x++) ground[idx(x, y)] = GT.TOWN;
    const buildings = [];
    BUILDINGS.forEach((b, i) => {
      const row = i < 4 ? 0 : 1, col = i % 4;
      const x0 = cx - 12 + col * 6, y0 = row === 0 ? cy - 7 : cy + 1;
      const bd = { ...b, x: x0, y: y0, w: 5, h: 3, door: { x: x0 + 2, y: y0 + 3 } };
      for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 5; x++) obj[idx(x, y)] = OT.BUILDING;
      buildings.push(bd);
    });
    const well = { x: cx - 1, y: cy - 2 };
    obj[idx(well.x, well.y)] = OT.WELL;
    // 장식: 통, 상자, 말뚝
    const deco = [[cx - 13, cy - 3, OT.BARREL], [cx + 11, cy - 3, OT.CRATE], [cx - 13, cy + 5, OT.CRATE], [cx + 12, cy + 5, OT.BARREL],
      [cx + 5, cy - 3, OT.POST], [cx - 7, cy + 5, OT.POST]];
    for (const [x, y, t] of deco) obj[idx(x, y)] = t;
    const signPos = { x: cx - 16, y: cy - 3 };
    obj[idx(signPos.x, signPos.y)] = OT.SIGN;

    // 4) 길 (마을에서 사방으로 뻗음)
    const roadTargets = [];
    const roadWalk = (sx, sy, dx, dy, len) => {
      let x = sx, y = sy;
      for (let s = 0; s < len; s++) {
        if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) break;
        const g = ground[idx(x, y)];
        if (g === GT.MOUNTAIN) break;
        if (g !== GT.WATER && g !== GT.TOWN) ground[idx(x, y)] = GT.ROAD;
        if (rng.chance(0.2)) { if (dx) y += rng.chance(0.5) ? 1 : -1; else x += rng.chance(0.5) ? 1 : -1; }
        else { x += dx; y += dy; }
      }
      roadTargets.push({ x, y });
    };
    roadWalk(town.x0 - 1, cy - 1, -1, 0, 40);
    roadWalk(town.x1 + 1, cy - 1, 1, 0, 40);
    roadWalk(cx - 1, town.y0 - 1, 0, -1, 40);
    roadWalk(cx - 1, town.y1 + 1, 0, 1, 40);

    // 5) 도달 가능 영역 (마을 기준 BFS)
    const solidAt = (x, y) => ground[idx(x, y)] === GT.MOUNTAIN || OBJ_SOLID.has(obj[idx(x, y)]);
    const reach = new Uint8Array(W * H);
    const q = [idx(cx, cy - 1)]; reach[q[0]] = 1;
    while (q.length) {
      const i = q.pop(); const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = idx(nx, ny);
        if (reach[j] || ground[j] === GT.MOUNTAIN) continue;
        reach[j] = 1; q.push(j);
      }
    }

    // 6) 광산 입구 후보: 산 절벽면 아래쪽이 도달 가능한 평지
    const cands = [];
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
      if (ground[idx(x, y)] !== GT.MOUNTAIN || ground[idx(x, y - 1)] !== GT.MOUNTAIN) continue;
      const below = ground[idx(x, y + 1)];
      if (below === GT.MOUNTAIN || below === GT.WATER || !reach[idx(x, y + 1)]) continue;
      if (ground[idx(x - 1, y)] !== GT.MOUNTAIN || ground[idx(x + 1, y)] !== GT.MOUNTAIN) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < 16) continue;
      cands.push({ x, y, d });
    }
    rng.shuffle(cands);
    const mines = [];
    const usedNames = new Set();
    const farEnough = (x, y, list, md) => list.every((m) => Math.hypot(m.x - x, m.y - y) >= md);
    // 전설의 광맥: 가장 먼 후보 중 하나
    const sortedFar = cands.slice().sort((a, b) => b.d - a.d);
    const lost = sortedFar[Math.min(sortedFar.length - 1, rng.int(0, 4))] || { x: 10, y: 10, d: 80 };
    for (const c of cands) {
      if (mines.length >= 24) break;
      if (Math.hypot(c.x - lost.x, c.y - lost.y) < 10) continue;
      if (!farEnough(c.x, c.y, mines, 9)) continue;
      let name;
      for (let t = 0; t < 30; t++) {
        name = rng.pick(MINE_PREFIX) + ' ' + rng.pick(MINE_SUFFIX);
        if (!usedNames.has(name)) break;
      }
      usedNames.add(name);
      const depth = c.d < 34 ? 1 : c.d < 52 ? 2 : 3;
      mines.push({
        id: mines.length, x: c.x, y: c.y, name, d: c.d,
        depth: U.clamp(depth + (rng.chance(0.25) ? (rng.chance(0.5) ? 1 : -1) : 0), 1, 3),
        rich: U.clamp(0.55 + rng.range(0, 0.5) + c.d / 120, 0.5, 1.6),
        fragment: null,
      });
    }
    // 깊이: 마을에서 가까운 순서대로 1층 → 2층 → 3층 (조금씩 섞기)
    mines.slice().sort((a, b) => a.d - b.d).forEach((m, i, arr) => {
      const r = i / arr.length;
      const base = r < 0.35 ? 1 : r < 0.72 ? 2 : 3;
      m.depth = U.clamp(base + (rng.chance(0.2) ? (rng.chance(0.5) ? 1 : -1) : 0), 1, 3);
    });
    for (const m of mines) { obj[idx(m.x, m.y)] = OT.MINE; obj[idx(m.x, m.y + 1)] = OT.NONE; }
    obj[idx(lost.x, lost.y)] = OT.LOST; obj[idx(lost.x, lost.y + 1)] = OT.NONE;

    // 지도 조각 광산 두 곳 배정 (A: 중간 거리, C: 먼 곳)
    const byDist = mines.slice().sort((a, b) => a.d - b.d);
    const mid = byDist.filter((m) => m.d > 24 && m.d < 46);
    const fragA = mid.length ? mid[rng.int(0, mid.length - 1)] : byDist[Math.floor(byDist.length / 2)];
    fragA.fragment = 'A'; fragA.depth = Math.max(2, fragA.depth);
    const far = byDist.filter((m) => m !== fragA && m.d >= 40);
    const fragC = far.length ? far[rng.int(0, far.length - 1)] : byDist[byDist.length - 1];
    fragC.fragment = 'C'; fragC.depth = 3;

    // 7) 장식 오브젝트 흩뿌리기
    const nearTown = (x, y) => x > town.x0 - 4 && x < town.x1 + 4 && y > town.y0 - 4 && y < town.y1 + 4;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = idx(x, y);
      if (obj[i] || nearTown(x, y)) continue;
      if (ground[idx(x, y + 1)] === GT.MOUNTAIN && obj[idx(x, y + 1)]) continue;
      const g = ground[i], r = rng.next();
      if (obj[idx(x, y - 1)] === OT.MINE || obj[idx(x, y - 1)] === OT.LOST) continue;
      if (g === GT.SAND) {
        if (r < 0.022) obj[i] = OT.CACTUS; else if (r < 0.035) obj[i] = OT.CACTUS2; else if (r < 0.06) obj[i] = OT.SHRUB;
        else if (r < 0.068) obj[i] = OT.BOULDER; else if (r < 0.071) obj[i] = OT.SKULL;
      } else if (g === GT.DIRT) {
        if (r < 0.04) obj[i] = OT.SHRUB; else if (r < 0.055) obj[i] = OT.BOULDER; else if (r < 0.063) obj[i] = OT.DEADTREE;
        else if (r < 0.07) obj[i] = OT.CACTUS2;
      } else if (g === GT.GRASS) {
        if (r < 0.06) obj[i] = OT.SHRUB; else if (r < 0.085) obj[i] = OT.TREE;
      } else if (g === GT.ROCKY) {
        if (r < 0.06) obj[i] = OT.BOULDER; else if (r < 0.075) obj[i] = OT.SHRUB; else if (r < 0.08) obj[i] = OT.SKULL;
      }
    }

    // 8) 버려진 야영지와 산적 은신처
    const openSpot = (x, y, r) => {
      for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
        if (xx < 2 || yy < 2 || xx >= W - 2 || yy >= H - 2) return false;
        const g = ground[idx(xx, yy)];
        if (g === GT.MOUNTAIN || g === GT.WATER || g === GT.TOWN || !reach[idx(xx, yy)]) return false;
        if (obj[idx(xx, yy)] === OT.MINE || obj[idx(xx, yy)] === OT.LOST) return false;
      }
      return true;
    };
    const clear = (x, y, r) => { for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) obj[idx(xx, yy)] = OT.NONE; };
    const camps = [];
    for (let tries = 0; tries < 600 && camps.length < 5; tries++) {
      const x = rng.int(8, W - 9), y = rng.int(8, H - 9);
      const d = Math.hypot(x - cx, y - cy);
      if (d < 22 || !openSpot(x, y, 2) || !farEnough(x, y, camps, 18)) continue;
      clear(x, y, 2);
      obj[idx(x - 1, y - 1)] = OT.TENT; obj[idx(x + 1, y)] = OT.FIRE; obj[idx(x, y + 1)] = OT.CHEST;
      camps.push({ id: camps.length, x, y, chest: { x, y: y + 1 } });
    }
    let hideout = null;
    const hideCands = [];
    for (let tries = 0; tries < 900; tries++) {
      const x = rng.int(8, W - 9), y = rng.int(8, H - 9);
      const d = Math.hypot(x - cx, y - cy);
      if (d < 36 || !openSpot(x, y, 3) || !farEnough(x, y, camps, 10)) continue;
      hideCands.push({ x, y, d });
      if (hideCands.length > 6) break;
    }
    if (hideCands.length) {
      hideout = hideCands[rng.int(0, hideCands.length - 1)];
      clear(hideout.x, hideout.y, 3);
      obj[idx(hideout.x - 2, hideout.y - 2)] = OT.DTENT;
      obj[idx(hideout.x + 2, hideout.y - 2)] = OT.DTENT;
      obj[idx(hideout.x, hideout.y)] = OT.FIRE;
      obj[idx(hideout.x - 3, hideout.y + 2)] = OT.BARREL;
      obj[idx(hideout.x + 3, hideout.y + 1)] = OT.CRATE;
    } else {
      hideout = { x: cx + 30, y: cy + 20 };
    }

    // 9) 시작 위치: 우물 앞
    const spawn = { x: well.x + 0.5, y: well.y + 2.1 };

    const world = {
      W, H, ground, obj, seed, town, buildings, well, signPos, mines, lost: { x: lost.x, y: lost.y },
      camps, hideout, spawn, ponds, roadTargets,
      fragMines: { A: fragA.id, C: fragC.id },
    };
    return world;
  }

  return { generate, W, H };
})();
