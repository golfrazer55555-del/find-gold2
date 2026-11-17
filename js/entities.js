'use strict';
/* 적, 총알, 다이너마이트, 줍는 아이템, 파티클 */
const EDEF = {
  snake: { name: '방울뱀', hp: 2, speed: 1.3, r: 0.3, dmg: 6, poison: 14, aggro: 4.5, sprite: 'snake', frames: 3 },
  scorpion: { name: '전갈', hp: 1, speed: 1.7, r: 0.28, dmg: 5, poison: 10, aggro: 5, sprite: 'scorpion', frames: 3 },
  coyote: { name: '코요테', hp: 2, speed: 3.9, r: 0.34, dmg: 8, aggro: 8, sprite: 'coyote', frames: 3 },
  bandit: { name: '산적', hp: 3, speed: 2.4, r: 0.32, dmg: 10, ranged: true, aggro: 10, sprite: 'bandit', person: true, cd: [1.5, 2.5] },
  boss: { name: '붉은 스카프 맥', hp: 16, speed: 2.3, r: 0.4, dmg: 12, ranged: true, aggro: 13, sprite: 'boss', person: true, scale: 1.3, cd: [1.0, 1.6] },
  bat: { name: '박쥐', hp: 1, speed: 3.3, r: 0.25, dmg: 4, fly: true, aggro: 7, sprite: 'bat', frames: 3 },
  spider: { name: '동굴 거미', hp: 2, speed: 2.3, r: 0.3, dmg: 6, aggro: 6, sprite: 'spider', frames: 2 },
  ghost: { name: '광부의 유령', hp: 999, speed: 1.25, r: 0.35, dmg: 9, phase: true, aggro: 11, sprite: 'ghost', frames: 2 },
};

const Ent = (() => {
  function spawn(type, x, y, extra) {
    const d = EDEF[type];
    const e = {
      type, d, x, y, hp: d.hp, t: Math.random() * 10, state: 'wander',
      wdir: Math.random() * Math.PI * 2, wt: 0, cd: 1 + Math.random(), hurt: 0,
      face: 1, dir: 0, moving: false, kx: 0, ky: 0, retreat: 0, strafe: Math.random() < 0.5 ? 1 : -1,
      ...extra,
    };
    G.enemies.push(e);
    return e;
  }

  /* 광산: 플레이어 기준 BFS 거리장 (적 길찾기) */
  function updateFlow() {
    if (G.scene !== 'mine') return;
    const L = G.level, p = G.player;
    const ptx = Math.floor(p.x), pty = Math.floor(p.y);
    if (G.flowKey === ptx + ',' + pty && G.flow) return;
    G.flowKey = ptx + ',' + pty;
    const W = L.W, H = L.H;
    const flow = G.flow && G.flow.length === W * H ? G.flow : new Int16Array(W * H);
    flow.fill(-1);
    const q = [pty * W + ptx];
    flow[q[0]] = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], v = flow[i];
      if (v > 24) continue;
      const x = i % W, y = (i / W) | 0;
      const nb = [i - 1, i + 1, i - W, i + W];
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || j >= W * H || flow[j] >= 0) continue;
        if (k < 2 && ((j / W) | 0) !== y) continue;
        if (MT_SOLID.has(L.tiles[j])) continue;
        flow[j] = v + 1; q.push(j);
      }
      void x;
    }
    G.flow = flow;
  }
  function flowDir(e) {
    if (G.scene !== 'mine' || !G.flow) return null;
    const L = G.level, W = L.W;
    const tx = Math.floor(e.x), ty = Math.floor(e.y);
    const here = G.flow[ty * W + tx];
    if (here < 0) return null;
    if (here <= 1) return null;
    let best = null, bv = here;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const v = G.flow[(ty + dy) * W + tx + dx];
      if (v >= 0 && v < bv) { bv = v; best = [tx + dx + 0.5, ty + dy + 0.5]; }
    }
    if (!best) return null;
    const ddx = best[0] - e.x, ddy = best[1] - e.y, dd = Math.hypot(ddx, ddy) || 1;
    return [ddx / dd, ddy / dd];
  }

  function update(dt) {
    const p = G.player;
    updateFlow();
    for (const e of G.enemies) {
      e.t += dt; e.cd -= dt; e.hurt = Math.max(0, e.hurt - dt); e.retreat = Math.max(0, e.retreat - dt);
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 0.001;
      const nx = dx / d, ny = dy / d;
      if (!p.dead && d < e.d.aggro) e.state = 'chase';
      else if (d > e.d.aggro * 1.7 || p.dead) e.state = 'wander';
      let mx = 0, my = 0, spd = e.d.speed;

      if (e.state === 'wander') {
        e.wt -= dt;
        if (e.wt <= 0) { e.wt = 1 + Math.random() * 2.5; e.wdir = Math.random() * Math.PI * 2; e.idle = Math.random() < 0.35; }
        if (!e.idle) { mx = Math.cos(e.wdir); my = Math.sin(e.wdir); spd *= 0.4; }
      } else if (e.type === 'ghost') {
        const lit = p.inv.oil > 0;
        if (lit && d < 2.7) {
          mx = -nx; my = -ny; spd *= 0.9;
          if (!e.warned) { e.warned = true; Game.toast('유령이 등불 빛을 피해 물러난다.', 'info'); }
        } else { mx = nx; my = ny; if (!lit) spd *= 1.5; }
        if (d < 0.65 && e.cd <= 0) { e.cd = 0.9; Game.damagePlayer(e.d.dmg, '유령의 손길'); }
        if (Math.random() < dt * 0.15) Sfx.play('ghost');
      } else if (e.d.ranged) {
        if (d > 6.2) { mx = nx; my = ny; }
        else if (d < 3.6) { mx = -nx; my = -ny; }
        else { mx = -ny * e.strafe; my = nx * e.strafe; spd *= 0.6; if (Math.random() < dt * 0.4) e.strafe *= -1; }
        if (e.cd <= 0 && d < 9.5 && Game.lineOfSight(e.x, e.y, p.x, p.y)) {
          const [a, b] = e.d.cd;
          e.cd = a + Math.random() * (b - a);
          const ang = Math.atan2(dy, dx);
          const shots = e.type === 'boss' ? [-0.18, 0, 0.18] : [(Math.random() - 0.5) * 0.15];
          for (const o of shots) fireBullet(e.x, e.y - 0.3, ang + o, 'e', e.d.dmg, 8.5);
          Sfx.play('enemyShoot');
          FX.muzzle(e.x + Math.cos(ang) * 0.4, e.y - 0.3 + Math.sin(ang) * 0.4);
        }
      } else {
        if (e.retreat > 0) { mx = -nx; my = -ny; }
        else {
          const f = flowDir(e);
          if (f) { mx = f[0]; my = f[1]; } else { mx = nx; my = ny; }
          if (e.type === 'bat') {
            const w = Math.sin(e.t * 7) * 0.9;
            mx += -ny * w; my += nx * w;
            if (Math.random() < dt * 0.6) Sfx.play('bat');
          }
        }
        if (d < e.d.r + 0.42 && e.cd <= 0) {
          e.cd = 1.1;
          Game.damagePlayer(e.d.dmg, e.d.name, e.d.poison);
          if (e.type === 'coyote' || e.type === 'bat') e.retreat = 0.6;
        }
      }
      // 넉백
      e.kx *= Math.pow(0.002, dt); e.ky *= Math.pow(0.002, dt);
      const ml = Math.hypot(mx, my);
      if (ml > 0) { mx /= ml; my /= ml; }
      const vx = mx * spd + e.kx, vy = my * spd + e.ky;
      e.moving = ml > 0.01;
      if (Math.abs(mx) > 0.2) e.face = mx > 0 ? 1 : -1;
      if (Math.abs(my) > Math.abs(mx)) e.dir = my > 0 ? 0 : 1; else e.dir = 2;
      if (e.d.phase) { e.x += vx * dt; e.y += vy * dt; }
      else Game.moveCircle(e, vx * dt, vy * dt, e.d.r * 0.8);
    }
    // 사망 처리
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      if (e.hp <= 0) { G.enemies.splice(i, 1); onKill(e); }
      else if (e.despawn) G.enemies.splice(i, 1);
    }
  }

  function onKill(e) {
    FX.poof(e.x, e.y - 0.2, e.type === 'ghost' ? '#e8f0f4' : '#c8b8a0', 14);
    G.stats.kills++;
    if (e.type === 'bandit') {
      G.quest.banditKills++;
      dropPickup(e.x, e.y, 'money', 5 + Math.floor(Math.random() * 20));
      if (Math.random() < 0.5) dropPickup(e.x + 0.3, e.y, 'ammo', 2 + Math.floor(Math.random() * 3));
    } else if (e.type === 'boss') {
      dropPickup(e.x, e.y, 'money', 80);
      dropPickup(e.x + 0.4, e.y + 0.2, 'frag', 'B');
      G.quest.boss = 'killed';
      Game.toast('붉은 스카프 맥을 쓰러뜨렸다! 보안관에게 알리자.', 'good');
    } else if (e.type === 'coyote' && Math.random() < 0.3) {
      dropPickup(e.x, e.y, 'food', 1);
    } else if (e.type === 'ghost') {
      Game.toast('유령이 흩어져 사라졌다…', 'info');
    } else if (Math.random() < 0.15) {
      dropPickup(e.x, e.y, 'money', 2 + Math.floor(Math.random() * 5));
    }
  }

  function hitEnemy(e, dmg, kx, ky) {
    if (e.type === 'ghost') return false;
    e.hp -= dmg; e.hurt = 0.18; e.kx += kx * 6; e.ky += ky * 6;
    e.state = 'chase';
    Sfx.play('hit');
    FX.spark(e.x, e.y - 0.3, '#ffefc0', 5);
    return true;
  }

  /* ───────── 총알 ───────── */
  function fireBullet(x, y, ang, from, dmg, speed = 15) {
    G.bullets.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, life: from === 'p' ? 0.65 : 1.3, from, dmg });
  }
  function updateBullets(dt) {
    const p = G.player;
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.life -= dt;
      let dead = b.life <= 0;
      const steps = 3;
      for (let s = 0; s < steps && !dead; s++) {
        b.x += (b.vx * dt) / steps; b.y += (b.vy * dt) / steps;
        if (Game.bulletBlocked(b.x, b.y)) { dead = true; FX.spark(b.x, b.y, '#d8c8a0', 4); break; }
        if (b.from === 'p') {
          for (const e of G.enemies) {
            if (e.type === 'ghost') continue;
            if (Math.hypot(e.x - b.x, e.y - 0.25 - b.y) < e.d.r + 0.18) {
              const sp = Math.hypot(b.vx, b.vy);
              hitEnemy(e, b.dmg, b.vx / sp, b.vy / sp);
              dead = true; break;
            }
          }
        } else if (!p.dead && Math.hypot(p.x - b.x, p.y - 0.3 - b.y) < 0.36) {
          Game.damagePlayer(b.dmg, '총알');
          dead = true;
        }
      }
      if (dead) G.bullets.splice(i, 1);
    }
  }

  /* ───────── 다이너마이트 ───────── */
  function throwBomb(ax, ay) {
    const p = G.player;
    G.bombs.push({ x: p.x + ax * 0.4, y: p.y + ay * 0.4, vx: ax * 7, vy: ay * 7, fuse: 1.8, t: 0 });
  }
  function updateBombs(dt) {
    for (let i = G.bombs.length - 1; i >= 0; i--) {
      const b = G.bombs[i];
      b.fuse -= dt; b.t += dt;
      const f = Math.pow(0.004, dt);
      b.vx *= f; b.vy *= f;
      const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
      if (Game.solidAt(Math.floor(nx), Math.floor(b.y))) b.vx = -b.vx * 0.3; else b.x = nx;
      if (Game.solidAt(Math.floor(b.x), Math.floor(ny))) b.vy = -b.vy * 0.3; else b.y = ny;
      if (Math.random() < dt * 20) FX.spark(b.x, b.y - 0.5, '#ffd060', 1);
      if (Math.random() < dt * 8) Sfx.play('fuse');
      if (b.fuse <= 0) { G.bombs.splice(i, 1); Game.explode(b.x, b.y); }
    }
  }

  /* ───────── 줍는 아이템 ───────── */
  function dropPickup(x, y, kind, amount) {
    G.pickups.push({ x: x + (Math.random() - 0.5) * 0.3, y: y + (Math.random() - 0.5) * 0.3, kind, amount, t: Math.random() * 3, z: 0.6, vz: 2.5 });
  }
  function updatePickups(dt) {
    const p = G.player;
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const k = G.pickups[i];
      k.t += dt;
      if (k.z > 0 || k.vz > 0) { k.vz -= 12 * dt; k.z = Math.max(0, k.z + k.vz * dt); if (k.z === 0) k.vz = 0; }
      if (p.dead) continue;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (d < 1.7 && !k.blocked) {
        const s = 7 * dt / Math.max(d, 0.01);
        k.x += (p.x - k.x) * Math.min(1, s); k.y += (p.y - k.y) * Math.min(1, s);
      }
      if (d < 0.45) {
        if (Game.collect(k)) G.pickups.splice(i, 1);
        else k.blocked = true;
      } else if (d > 2.5) k.blocked = false;
    }
  }

  return { spawn, update, updateBullets, fireBullet, hitEnemy, throwBomb, updateBombs, dropPickup, updatePickups };
})();

/* ───────── 파티클 & 떠오르는 글자 ───────── */
const FX = (() => {
  function add(x, y, vx, vy, life, color, size = 0.08, grav = 0, fade = true) {
    if (G.particles.length > 500) G.particles.shift();
    G.particles.push({ x, y, vx, vy, life, max: life, color, size, grav, fade });
  }
  return {
    add,
    spark(x, y, color, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3; add(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.2, color, 0.07, 4); }
    },
    poof(x, y, color, n) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.8; add(x, y, Math.cos(a) * s, Math.sin(a) * s - 0.5, 0.5 + Math.random() * 0.4, color, 0.12 + Math.random() * 0.08, -0.5); }
    },
    dust(x, y, color = '#8a7a66', n = 6) {
      for (let i = 0; i < n; i++) add(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, 0.4 + Math.random() * 0.3, color, 0.1, 0);
    },
    gold(x, y, n = 8) {
      for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.5; add(x, y, Math.cos(a) * s, Math.sin(a) * s - 1.5, 0.6 + Math.random() * 0.3, Math.random() < 0.5 ? '#ffd54a' : '#fff2a0', 0.07, 5); }
    },
    muzzle(x, y) {
      for (let i = 0; i < 4; i++) add(x, y, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.08, '#fff0a0', 0.14, 0);
      G.flashes.push({ x, y, r: 2.2, life: 0.07, max: 0.07 });
    },
    explosion(x, y) {
      for (let i = 0; i < 40; i++) { const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 5; add(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, i % 3 === 0 ? '#ffd060' : i % 3 === 1 ? '#ff7a30' : '#5a4a3a', 0.12 + Math.random() * 0.12, 1); }
      for (let i = 0; i < 18; i++) add(x + (Math.random() - 0.5), y + (Math.random() - 0.5), (Math.random() - 0.5) * 1.2, -Math.random() * 1.5, 1 + Math.random(), '#6a5e54', 0.25, -0.3);
      G.flashes.push({ x, y, r: 7, life: 0.35, max: 0.35 });
    },
    floater(x, y, text, color = '#fff') {
      G.floaters.push({ x, y, text, color, life: 1.4, max: 1.4 });
    },
    update(dt) {
      for (let i = G.particles.length - 1; i >= 0; i--) {
        const q = G.particles[i];
        q.life -= dt;
        if (q.life <= 0) { G.particles.splice(i, 1); continue; }
        q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        q.vx *= Math.pow(0.2, dt); q.vy *= q.grav ? 1 : Math.pow(0.2, dt);
      }
      for (let i = G.floaters.length - 1; i >= 0; i--) {
        const f = G.floaters[i];
        f.life -= dt; f.y -= dt * 0.6;
        if (f.life <= 0) G.floaters.splice(i, 1);
      }
      for (let i = G.flashes.length - 1; i >= 0; i--) {
        G.flashes[i].life -= dt;
        if (G.flashes[i].life <= 0) G.flashes.splice(i, 1);
      }
    },
  };
})();
