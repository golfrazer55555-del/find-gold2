'use strict';
/* 광산 내부 생성 (층마다 절차적 생성) */
const MT = {
  FLOOR: 0, DIRT: 1, ROCK: 2, HARD: 3, BEDROCK: 4, GOLD: 5, RICH: 6, EXIT: 7, DOWN: 8, UP: 9,
  PUDDLE: 10, TIMBER: 11, CHEST: 12, CHEST_OPEN: 13, RUBBLE: 14, HEART: 15, FCHEST: 16,
};
const MT_SOLID = new Set([MT.DIRT, MT.ROCK, MT.HARD, MT.BEDROCK, MT.GOLD, MT.RICH, MT.CHEST, MT.CHEST_OPEN, MT.RUBBLE, MT.HEART, MT.FCHEST]);
const MT_WALL = new Set([MT.DIRT, MT.ROCK, MT.HARD, MT.BEDROCK, MT.GOLD, MT.RICH, MT.HEART]);
/* 곡괭이로 파는 데 걸리는 시간(초) */
const DIG_TIME = { [MT.DIRT]: 0.45, [MT.RUBBLE]: 0.5, [MT.ROCK]: 1.0, [MT.GOLD]: 1.3, [MT.RICH]: 1.7, [MT.HEART]: 2.6 };

const Mine = (() => {
  function generate(mine, level, worldSeed, isLost) {
    const size = 32 + level * 6 + (isLost ? 6 : 0);
    const W = size, H = size;
    const seed = (worldSeed ^ Math.imul(mine.id + 1, 7919) ^ Math.imul(level, 104729)) >>> 0;
    const rng = new U.RNG(seed);
    const t = new Uint8Array(W * H);
    const idx = (x, y) => y * W + x;
    const inb = (x, y) => x >= 2 && y >= 2 && x < W - 2 && y < H - 2;

    // 1) 바위 채우기
    const hardBias = 0.7 - level * 0.03;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) { t[idx(x, y)] = MT.BEDROCK; continue; }
      const n = U.fbm(x / 6, y / 6, seed, 3);
      t[idx(x, y)] = n > hardBias ? MT.HARD : n > 0.47 - level * 0.03 ? MT.ROCK : MT.DIRT;
    }
    // 2) 금맥: 노이즈 군집
    const rich = mine.rich * (isLost ? 1.6 : 1) * (1 + (level - 1) * 0.25);
    const goldT = 0.74 - rich * 0.07, richT = 0.86 - rich * 0.06;
    for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) {
      const i = idx(x, y);
      if (t[i] === MT.HARD) continue;
      const v = U.fbm(x / 3.5, y / 3.5, seed + 77, 2);
      if (v > richT) t[i] = MT.RICH;
      else if (v > goldT) t[i] = MT.GOLD;
    }

    // 3) 입구와 갱도 굴착
    const ex = W >> 1, ey = H - 3;
    const carved = [];
    const carve = (x, y) => {
      if (!inb(x, y)) return;
      const i = idx(x, y);
      if (t[i] === MT.EXIT || t[i] === MT.UP) return;
      if (t[i] !== MT.FLOOR) { t[i] = MT.FLOOR; carved.push(i); }
    };
    t[idx(ex, ey)] = level === 1 ? MT.EXIT : MT.UP;
    carve(ex, ey - 1); carve(ex - 1, ey - 1); carve(ex + 1, ey - 1);
    const timbers = [];
    const walkers = 3 + level + (isLost ? 2 : 0);
    const DIRS = [[0, -1], [1, 0], [-1, 0], [0, 1]];
    for (let w = 0; w < walkers; w++) {
      let x = ex, y = ey - 1;
      if (w > 0 && carved.length) { const i = carved[rng.int(0, carved.length - 1)]; x = i % W; y = (i / W) | 0; }
      let d = w === 0 ? 0 : rng.int(0, 3);
      const len = 45 + level * 22 + rng.int(0, 30);
      for (let s = 0; s < len; s++) {
        if (rng.chance(0.22)) d = rng.chance(0.45) ? 0 : rng.int(0, 3);
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1];
        if (!inb(nx, ny) || ny > ey - 1) { d = rng.int(0, 3); continue; }
        x = nx; y = ny; carve(x, y);
        if (s % 11 === 5 && rng.chance(0.5)) timbers.push(idx(x, y));
        if (rng.chance(0.05)) {
          const rw = rng.int(1, 2), rh = rng.int(1, 2);
          for (let yy = -rh; yy <= rh; yy++) for (let xx = -rw; xx <= rw; xx++) carve(x + xx, y + yy);
        }
      }
    }

    // 4) 전설의 광맥 최하층: 황금 심장 방
    let heart = null;
    if (isLost && level === mine.depth) {
      const hx = W >> 1, hy = 6;
      for (let yy = -3; yy <= 3; yy++) for (let xx = -3; xx <= 3; xx++) {
        const i = idx(hx + xx, hy + yy);
        const ring = Math.max(Math.abs(xx), Math.abs(yy));
        if (ring === 3) t[i] = MT.HARD;
        else t[i] = MT.FLOOR;
      }
      t[idx(hx, hy)] = MT.HEART;
      t[idx(hx - 1, hy - 1)] = MT.RICH; t[idx(hx + 1, hy - 1)] = MT.RICH; t[idx(hx - 1, hy + 1)] = MT.RICH; t[idx(hx + 1, hy + 1)] = MT.RICH;
      heart = { x: hx, y: hy };
      // 방 아래까지 갱도 연결 (단단한 암반 벽에서 멈춤)
      let x = ex, y = ey - 1;
      while (y > hy + 4) {
        carve(x, y);
        if (x !== hx && rng.chance(0.6)) x += x < hx ? 1 : -1;
        else y--;
      }
      while (x !== hx) { carve(x, y); x += x < hx ? 1 : -1; }
      carve(hx, hy + 4); carve(hx - 1, hy + 4); carve(hx + 1, hy + 4);
    }

    // 5) BFS로 가장 먼 지점 계산
    const distFrom = (sx, sy) => {
      const dist = new Int16Array(W * H).fill(-1);
      const q = [idx(sx, sy)]; dist[q[0]] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi]; const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of DIRS) {
          const j = idx(x + dx, y + dy);
          if (dist[j] >= 0 || MT_SOLID.has(t[j])) continue;
          dist[j] = dist[i] + 1; q.push(j);
        }
      }
      return dist;
    };
    let dist = distFrom(ex, ey - 1);
    const floorTiles = [];
    for (let i = 0; i < W * H; i++) if (dist[i] > 0 && t[i] === MT.FLOOR) floorTiles.push(i);
    floorTiles.sort((a, b) => dist[b] - dist[a]);

    let down = null;
    if (level < mine.depth && floorTiles.length) {
      const i = floorTiles[0];
      t[i] = MT.DOWN; down = { x: i % W, y: (i / W) | 0 };
    }
    // 6) 막다른 길에 보물상자
    const deadEnds = floorTiles.filter((i) => {
      if (t[i] !== MT.FLOOR || dist[i] < 10) return false;
      const x = i % W, y = (i / W) | 0;
      let open = 0;
      for (const [dx, dy] of DIRS) if (!MT_SOLID.has(t[idx(x + dx, y + dy)])) open++;
      return open === 1;
    });
    const chests = [];
    const wantFrag = mine.fragment && level === mine.depth;
    if (wantFrag) {
      const pool = deadEnds.length ? deadEnds : floorTiles.filter((i) => t[i] === MT.FLOOR);
      if (pool.length) { const i = pool[0]; t[i] = MT.FCHEST; chests.push(i); }
    }
    const nChests = rng.int(1, 2) + (level >= 2 ? 1 : 0);
    rng.shuffle(deadEnds);
    for (const i of deadEnds) {
      if (chests.length >= nChests + (wantFrag ? 1 : 0)) break;
      if (t[i] !== MT.FLOOR) continue;
      if (chests.some((c) => Math.abs((c % W) - (i % W)) + Math.abs(((c / W) | 0) - ((i / W) | 0)) < 6)) continue;
      t[i] = MT.CHEST; chests.push(i);
    }
    // 7) 물웅덩이와 옛 버팀목
    const open = floorTiles.filter((i) => t[i] === MT.FLOOR && dist[i] > 6);
    rng.shuffle(open);
    for (let k = 0; k < Math.min(open.length, 2 + level); k++) t[open[k]] = MT.PUDDLE;
    for (const i of timbers) if (t[i] === MT.FLOOR && rng.chance(0.6)) t[i] = MT.TIMBER;

    // 8) 적 배치
    const enemies = [];
    const spawnable = floorTiles.filter((i) => (t[i] === MT.FLOOR || t[i] === MT.TIMBER) && dist[i] > 9);
    rng.shuffle(spawnable);
    const n = 3 + level * 2 + (isLost ? 4 : 0);
    for (let k = 0; k < Math.min(n, spawnable.length); k++) {
      const i = spawnable[k];
      const r = rng.next();
      const type = r < 0.45 ? 'bat' : r < 0.72 ? 'spider' : 'snake';
      enemies.push({ type, x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 });
    }
    const ghosts = (level >= 2 ? level - 1 : 0) + (isLost ? 3 : 0) + (mine.fragment === 'C' && level === mine.depth ? 2 : 0);
    for (let k = 0; k < ghosts && spawnable.length; k++) {
      const i = spawnable[(n + k * 3) % spawnable.length];
      enemies.push({ type: 'ghost', x: (i % W) + 0.5, y: ((i / W) | 0) + 0.5 });
    }

    return { W, H, tiles: t, entry: { x: ex, y: ey }, down, heart, enemies, seen: new Uint8Array(W * H) };
  }

  return { generate };
})();
