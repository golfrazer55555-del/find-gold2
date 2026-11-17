'use strict';
/* 모든 그래픽은 코드로 그린 16px 픽셀 아트 (외부 이미지 없음) */
const Art = (() => {
  const T = {};   // 타일 텍스처: key -> [canvas...]
  const S = {};   // 스프라이트: key -> canvas
  const OUTLINE = 'rgba(28,16,8,0.92)';

  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function hashStr(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h >>> 0; }
  function make(w, h, fn) {
    const c = cv(w, h);
    const g = c.getContext('2d');
    const P = (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
    fn(g, P);
    return c;
  }
  function tiles(key, n, fn) {
    T[key] = [];
    for (let i = 0; i < n; i++) {
      const r = new U.RNG(hashStr(key) + i * 977);
      T[key].push(make(16, 16, (g, P) => fn(g, P, r, i)));
    }
  }
  function speck(P, r, cols, n, x0 = 0, y0 = 0, x1 = 16, y1 = 16) {
    for (let i = 0; i < n; i++) P(r.int(x0, x1 - 1), r.int(y0, y1 - 1), 1, 1, r.pick(cols));
  }
  /* 투명 픽셀 중 불투명 픽셀과 맞닿은 곳에 외곽선 */
  function outline(c, col = OUTLINE) {
    const g = c.getContext('2d');
    const w = c.width, h = c.height;
    const id = g.getImageData(0, 0, w, h), d = id.data;
    const mark = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] !== 0) continue;
        const a = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] > 40;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) mark.push(x, y);
      }
    }
    g.fillStyle = col;
    for (let i = 0; i < mark.length; i += 2) g.fillRect(mark[i], mark[i + 1], 1, 1);
    return c;
  }
  /* 스프라이트: 1px 여백을 두고 그린 뒤 외곽선 */
  function sprite(key, w, h, fn, doOutline = true) {
    const c = make(w + 2, h + 2, (g, P0) => {
      const P = (x, y, ww, hh, col) => P0(x + 1, y + 1, ww, hh, col);
      fn(P, g);
    });
    if (doOutline) outline(c);
    S[key] = c;
    return c;
  }

  /* ───────── 지상 타일 ───────── */
  function buildWorldTiles() {
    tiles('sand', 4, (g, P, r, i) => {
      P(0, 0, 16, 16, '#d8b37a');
      speck(P, r, ['#cda66c', '#e3c38b', '#c89e62'], 22);
      if (i % 2 === 0) {
        const y = r.int(3, 12), x0 = r.int(0, 4), x1 = r.int(9, 16);
        for (let x = x0; x < x1; x++) P(x, y + (x % 6 === 0 ? 1 : 0), 1, 1, '#c8a067');
      }
      if (r.chance(0.6)) { const x = r.int(2, 12), y = r.int(2, 12); P(x, y, 2, 1, '#b58b58'); P(x, y + 1, 2, 1, '#9c7445'); }
    });
    tiles('dirt', 3, (g, P, r) => {
      P(0, 0, 16, 16, '#a97d50');
      speck(P, r, ['#9a6f44', '#b78b5c', '#8f653b'], 28);
      const x = r.int(2, 10), y = r.int(2, 12);
      P(x, y, 3, 1, '#8a6038'); P(x + 2, y + 1, 2, 1, '#8a6038');
    });
    tiles('grass', 3, (g, P, r) => {
      P(0, 0, 16, 16, '#b9a25d');
      speck(P, r, ['#ab9652', '#c7b26e'], 18);
      for (let k = 0; k < 5; k++) {
        const x = r.int(1, 13), y = r.int(3, 14);
        P(x, y - 2, 1, 3, '#8b8a3e'); P(x + 1, y - 1, 1, 2, '#9fa04a'); P(x - 1, y - 1, 1, 2, '#7e7b36');
      }
    });
    tiles('rocky', 3, (g, P, r) => {
      P(0, 0, 16, 16, '#a18b6d');
      speck(P, r, ['#958064', '#b09a7b'], 22);
      for (let k = 0; k < 4; k++) {
        const x = r.int(0, 13), y = r.int(0, 13), w = r.int(2, 3);
        P(x, y, w, 2, '#86725a'); P(x, y, 1, 1, '#bba585'); P(x, y + 2, w, 1, '#6f5d48');
      }
    });
    const mtnBases = ['#8d5b3c', '#855538', '#93613f'];
    tiles('mtn', 3, (g, P, r, i) => {
      P(0, 0, 16, 16, mtnBases[i]);
      speck(P, r, ['#a8714b', '#9e6a45'], 18);
      speck(P, r, ['#6e4529', '#744a2d'], 14);
      const x = r.int(1, 9), y = r.int(2, 12);
      P(x, y, 5, 1, '#a6704a'); P(x + 1, y + 1, 4, 1, '#6c4428');
    });
    tiles('mtnFace', 3, (g, P, r, i) => {
      P(0, 0, 16, 6, mtnBases[i]);
      speck(P, r, ['#a8714b', '#6e4529'], 10, 0, 0, 16, 5);
      P(0, 5, 16, 1, '#a06a45');
      P(0, 6, 16, 10, '#6a422a');
      P(0, 9, 16, 1, '#5b3622'); P(0, 13, 16, 1, '#5b3622');
      for (let k = 0; k < 3; k++) { const x = r.int(1, 14); P(x, 6 + r.int(0, 3), 1, r.int(3, 7), '#4f2f1d'); }
      speck(P, r, ['#764a30', '#5f3a24'], 10, 0, 6, 16, 15);
      P(0, 15, 16, 1, '#3e2616');
    });
    // 물: 3프레임 애니메이션
    T.water = [];
    for (let f = 0; f < 3; f++) {
      const r = new U.RNG(4242);
      T.water.push(make(16, 16, (g, P) => {
        P(0, 0, 16, 16, '#3b7fbf');
        speck(P, r, ['#3473b0', '#4389c8'], 20);
        for (let k = 0; k < 4; k++) {
          const y = 2 + k * 4, x = (r.int(0, 15) + f * 2) % 16;
          P(x, y, 3, 1, '#7ab8e8'); P((x + 3) % 16, y, 1, 1, '#5d9ed6');
          P((x + 8) % 16, y + 2, 2, 1, '#5d9ed6');
        }
      }));
    }
    tiles('town', 3, (g, P, r) => {
      P(0, 0, 16, 16, '#b8895b');
      speck(P, r, ['#a97b4f', '#c69868', '#9f7247'], 22);
    });
    tiles('road', 3, (g, P, r) => {
      P(0, 0, 16, 16, '#c8a06d');
      speck(P, r, ['#b98f5e', '#d5ae7c', '#ad8454'], 20);
      if (r.chance(0.5)) P(r.int(2, 12), r.int(2, 12), 2, 2, '#9f784a');
    });
  }

  /* ───────── 광산 타일 ───────── */
  function buildMineTiles() {
    tiles('mfloor', 4, (g, P, r) => {
      P(0, 0, 16, 16, '#3a2b20');
      speck(P, r, ['#46352a', '#30231a', '#524032'], 26);
      if (r.chance(0.5)) { const x = r.int(2, 12), y = r.int(2, 12); P(x, y, 2, 1, '#5d4938'); P(x, y + 1, 2, 1, '#261c14'); }
    });
    function wall(key, top, face, cols, extra) {
      for (const variant of ['', 'F']) {
        tiles(key + variant, 2, (g, P, r) => {
          P(0, 0, 16, 16, top);
          speck(P, r, cols, 30);
          P(0, 0, 16, 1, 'rgba(255,255,255,0.08)');
          if (variant === 'F') {
            P(0, 10, 16, 6, face);
            P(0, 10, 16, 1, 'rgba(255,255,255,0.10)');
            for (let k = 0; k < 4; k++) P(r.int(0, 15), 11, 1, r.int(2, 4), 'rgba(0,0,0,0.25)');
            P(0, 15, 16, 1, 'rgba(0,0,0,0.45)');
          }
          if (extra) extra(P, r, variant === 'F');
        });
      }
    }
    wall('wdirt', '#7b5636', '#563a22', ['#6d4b2e', '#8a643f', '#5e4027']);
    wall('wrock', '#6f6a66', '#4b4744', ['#625e5a', '#7d7874', '#58534f']);
    wall('whard', '#44506a', '#2c3346', ['#3a4560', '#55627e', '#323b52'], (P, r) => {
      for (let k = 0; k < 3; k++) { const x = r.int(1, 13), y = r.int(1, 8); P(x, y, 1, 1, '#9fb3d8'); P(x + 1, y + 1, 1, 1, '#6f82a8'); }
      const x = r.int(2, 10); P(x, 3, 1, 4, '#262d3e'); P(x + 1, 6, 1, 3, '#262d3e');
    });
    wall('wbed', '#1f1b1b', '#141111', ['#262121', '#181414']);
    const goldFleck = (n, big) => (P, r, face) => {
      const ymax = face ? 9 : 14;
      for (let k = 0; k < n; k++) {
        const x = r.int(1, 13), y = r.int(1, ymax);
        P(x, y, 1, 1, '#ffd54a'); P(x + 1, y, 1, 1, '#e0a020');
        if (big && k % 2 === 0) { P(x, y + 1, 2, 1, '#c88a18'); P(x - 1, y, 1, 1, '#fff2a0'); }
      }
    };
    wall('wgold', '#6f6a66', '#4b4744', ['#625e5a', '#7d7874'], goldFleck(6, false));
    wall('wrich', '#6f6658', '#4b4436', ['#625a4c', '#7d7464'], (P, r, face) => {
      const ymax = face ? 7 : 12;
      for (let k = 0; k < 3; k++) {
        const x = r.int(1, 10), y = r.int(1, ymax);
        P(x, y, 3, 2, '#e8b030'); P(x + 1, y, 2, 1, '#ffe27a'); P(x, y + 2, 3, 1, '#a8741a');
      }
      goldFleck(4, true)(P, r, face);
    });
    tiles('mexit', 1, (g, P) => {
      P(0, 0, 16, 16, '#5a4a36');
      P(0, 0, 16, 16, 'rgba(255,230,160,0.25)');
      P(4, 0, 1, 16, '#9a6a36'); P(11, 0, 1, 16, '#9a6a36');
      for (let y = 1; y < 16; y += 3) P(4, y, 8, 1, '#c08a4a');
    });
    tiles('mdown', 1, (g, P) => {
      P(0, 0, 16, 16, '#3a2b20');
      P(2, 3, 12, 11, '#0b0806'); P(3, 2, 10, 1, '#0b0806'); P(3, 14, 10, 1, '#0b0806');
      P(5, 3, 1, 10, '#7a5430'); P(10, 3, 1, 10, '#7a5430');
      P(5, 4, 6, 1, '#9a6a3a'); P(5, 7, 6, 1, '#80582f'); P(5, 10, 6, 1, '#5e4022');
      P(2, 3, 12, 1, 'rgba(255,255,255,0.12)');
    });
    tiles('mpuddle', 2, (g, P, r) => {
      P(0, 0, 16, 16, '#3a2b20');
      speck(P, r, ['#46352a', '#30231a'], 12);
      P(3, 4, 10, 8, '#2b5a80'); P(2, 6, 12, 4, '#2b5a80'); P(4, 3, 7, 1, '#2b5a80');
      P(5, 5, 4, 1, '#5d93bd'); P(9, 8, 2, 1, '#4a7fa8');
    });
    tiles('mtimber', 1, (g, P) => {
      P(0, 0, 16, 16, '#3a2b20');
      P(1, 1, 3, 15, '#8a5a2b'); P(12, 1, 3, 15, '#8a5a2b');
      P(0, 0, 16, 3, '#9c6a35'); P(0, 3, 16, 1, '#5e3b1a');
      P(2, 4, 1, 12, '#a8763f'); P(13, 4, 1, 12, '#a8763f');
      P(1, 15, 3, 1, '#4e3016'); P(12, 15, 3, 1, '#4e3016');
    });
    tiles('mrubble', 2, (g, P, r) => {
      P(0, 0, 16, 16, '#3a2b20');
      for (let k = 0; k < 7; k++) {
        const x = r.int(0, 12), y = r.int(1, 12), w = r.int(3, 5);
        P(x, y, w, 3, '#6f655c'); P(x, y, w, 1, '#8c8278'); P(x, y + 3, w, 1, '#2a201a');
      }
    });
    tiles('mheart', 1, (g, P) => {
      P(0, 0, 16, 16, '#2f2622');
      P(4, 3, 8, 10, '#d99a1e'); P(5, 2, 6, 12, '#d99a1e'); P(3, 5, 10, 6, '#d99a1e');
      P(5, 3, 5, 3, '#ffe37a'); P(6, 4, 2, 1, '#fff8d0'); P(8, 9, 4, 3, '#b07012');
      P(4, 11, 3, 1, '#9a600e');
    });
  }

  /* ───────── 사물 스프라이트 ───────── */
  function buildObjects() {
    sprite('cactus', 14, 24, (P) => {
      const g1 = '#4f8a3a', g2 = '#3c6e2c', hl = '#73ad52';
      P(5, 1, 4, 23, g1); P(6, 0, 2, 1, g1); P(8, 2, 1, 21, g2); P(5, 2, 1, 20, hl);
      P(1, 9, 4, 3, g1); P(1, 4, 3, 6, g1); P(1, 4, 1, 6, hl); P(3, 5, 1, 5, g2);
      P(9, 12, 4, 3, g1); P(10, 7, 3, 6, g1); P(10, 7, 1, 6, hl); P(12, 8, 1, 5, g2);
      for (let y = 3; y < 22; y += 4) P(6, y, 1, 1, '#d6e7a6');
    });
    sprite('cactus2', 10, 12, (P) => {
      P(2, 3, 6, 9, '#5a9440'); P(3, 2, 4, 1, '#5a9440'); P(2, 4, 1, 7, '#79b056'); P(7, 4, 1, 7, '#3f702e');
      P(0, 5, 2, 3, '#5a9440'); P(8, 6, 2, 3, '#5a9440'); P(4, 0, 2, 2, '#e06a8a');
    });
    sprite('boulder', 16, 12, (P) => {
      P(2, 2, 12, 9, '#8a7864'); P(1, 4, 14, 6, '#8a7864'); P(4, 1, 8, 1, '#8a7864');
      P(3, 2, 6, 2, '#a99680'); P(4, 1, 3, 1, '#b8a68f'); P(2, 9, 12, 2, '#6a5a48'); P(10, 4, 3, 4, '#7a6956');
    });
    sprite('shrub', 14, 10, (P) => {
      P(2, 3, 10, 6, '#8d8f50'); P(1, 5, 12, 4, '#8d8f50'); P(4, 1, 6, 2, '#8d8f50');
      P(3, 2, 3, 2, '#a7a964'); P(8, 4, 3, 2, '#a7a964'); P(2, 7, 10, 2, '#6c6e3a'); P(6, 5, 1, 1, '#5a5c30');
    });
    sprite('deadtree', 16, 24, (P) => {
      const b = '#6e543c', d = '#4e3a28';
      P(7, 8, 3, 16, b); P(9, 9, 1, 15, d);
      P(4, 4, 1, 6, b); P(5, 9, 2, 1, b); P(3, 2, 1, 3, b);
      P(10, 6, 1, 4, b); P(11, 3, 1, 4, b); P(12, 2, 1, 2, b); P(10, 10, 3, 1, b);
      P(6, 2, 1, 6, b); P(7, 0, 1, 3, b);
    });
    sprite('skull', 12, 7, (P) => {
      P(3, 1, 6, 5, '#ede6d2'); P(4, 6, 4, 1, '#ede6d2'); P(0, 0, 3, 1, '#ede6d2'); P(9, 0, 3, 1, '#ede6d2');
      P(0, 1, 1, 1, '#ede6d2'); P(11, 1, 1, 1, '#ede6d2');
      P(4, 3, 1, 1, '#3a2a1a'); P(7, 3, 1, 1, '#3a2a1a'); P(3, 5, 6, 1, '#cfc6ae');
    });
    sprite('tree', 22, 26, (P) => {
      P(9, 14, 4, 12, '#6a4a2c'); P(12, 15, 1, 11, '#4e3520'); P(6, 16, 3, 2, '#6a4a2c'); P(13, 13, 3, 2, '#6a4a2c');
      P(3, 3, 16, 10, '#5d803a'); P(1, 6, 20, 6, '#5d803a'); P(5, 1, 12, 3, '#5d803a'); P(4, 12, 14, 2, '#4d6c30');
      P(5, 3, 6, 3, '#7aa04c'); P(13, 6, 4, 2, '#7aa04c'); P(2, 9, 4, 2, '#4d6c30'); P(15, 10, 4, 2, '#4d6c30');
    });
    const tent = (key, canvasCol, shade) => sprite(key, 22, 16, (P) => {
      for (let y = 0; y < 15; y++) { const w = Math.round(2 + y * 1.3); P(11 - w / 2 | 0, y + 1, w, 1, y < 2 ? shade : canvasCol); }
      P(1, 14, 20, 2, shade);
      for (let y = 6; y < 16; y++) { const w = Math.round((y - 5) * 0.9); P(11 - (w >> 1), y, w, 1, '#24180e'); }
      P(10, 0, 2, 3, '#6a4a2c');
    });
    tent('tent', '#d8ccab', '#b0a283');
    tent('dtent', '#7a6a58', '#5a4c3e');
    sprite('fire', 12, 8, (P) => {
      P(1, 5, 10, 2, '#6a4a2c'); P(3, 4, 6, 1, '#4e3520'); P(0, 6, 2, 2, '#8a8a8a'); P(10, 6, 2, 2, '#8a8a8a');
    });
    sprite('chest', 14, 11, (P) => {
      P(0, 3, 14, 8, '#8b5a2b'); P(1, 0, 12, 4, '#9c6a35'); P(0, 4, 14, 1, '#5e3b1a');
      P(2, 0, 2, 11, '#c9a23a'); P(10, 0, 2, 11, '#c9a23a'); P(6, 4, 2, 3, '#e8c95a'); P(0, 10, 14, 1, '#4e3016');
    });
    sprite('chestOpen', 14, 11, (P) => {
      P(0, 4, 14, 7, '#8b5a2b'); P(1, 0, 12, 3, '#5e3b1a'); P(1, 3, 12, 2, '#24160c');
      P(2, 4, 2, 7, '#c9a23a'); P(10, 4, 2, 7, '#c9a23a'); P(0, 10, 14, 1, '#4e3016');
    });
    sprite('fchest', 14, 11, (P) => {
      P(0, 3, 14, 8, '#5a2e3a'); P(1, 0, 12, 4, '#6e3a48'); P(0, 4, 14, 1, '#3a1a22');
      P(2, 0, 2, 11, '#f0c040'); P(10, 0, 2, 11, '#f0c040'); P(6, 4, 2, 3, '#fff0a0'); P(0, 10, 14, 1, '#2a1018');
    });
    sprite('well', 16, 22, (P) => {
      P(1, 0, 14, 3, '#7a3a2a'); P(0, 2, 16, 2, '#5e2a1e'); P(2, 4, 1, 10, '#6a4a2c'); P(13, 4, 1, 10, '#6a4a2c');
      P(3, 6, 10, 1, '#6a4a2c'); P(7, 7, 1, 5, '#b0a080'); P(6, 11, 3, 2, '#7a5a3a');
      P(1, 13, 14, 9, '#8f8a80'); P(1, 13, 14, 2, '#a8a298'); P(3, 14, 10, 2, '#1d2a3a');
      for (let x = 1; x < 15; x += 4) P(x, 17, 3, 1, '#6f6a60');
      P(3, 20, 4, 1, '#6f6a60'); P(9, 20, 4, 1, '#6f6a60');
    });
    sprite('barrel', 10, 13, (P) => {
      P(1, 0, 8, 13, '#8a5a2e'); P(0, 2, 10, 9, '#8a5a2e'); P(2, 0, 2, 13, '#a06c3a');
      P(0, 3, 10, 1, '#4a4a4a'); P(0, 9, 10, 1, '#4a4a4a'); P(1, 0, 8, 1, '#5e3b1a');
    });
    sprite('crate', 12, 11, (P) => {
      P(0, 0, 12, 11, '#a07a46'); P(0, 0, 12, 1, '#c09a60'); P(0, 10, 12, 1, '#6e5030');
      P(0, 0, 1, 11, '#6e5030'); P(11, 0, 1, 11, '#6e5030');
      for (let i = 0; i < 10; i++) P(1 + i, 1 + i, 1, 1, '#7e5c34');
    });
    sprite('sign', 18, 18, (P) => {
      P(8, 8, 2, 10, '#6a4a2c'); P(0, 0, 18, 9, '#a87a48'); P(0, 0, 18, 1, '#c8985e'); P(0, 8, 18, 1, '#6e4e2c');
      P(1, 1, 1, 7, '#8a6038'); P(16, 1, 1, 7, '#8a6038');
    });
    sprite('post', 16, 8, (P) => {
      P(1, 1, 2, 7, '#6a4a2c'); P(13, 1, 2, 7, '#6a4a2c'); P(0, 0, 16, 2, '#8a6038'); P(0, 2, 16, 1, '#4e3520');
    });
    sprite('fence', 16, 9, (P) => {
      P(0, 2, 16, 2, '#8a6a44'); P(0, 6, 16, 2, '#8a6a44'); P(2, 0, 2, 9, '#6a4a2c'); P(12, 0, 2, 9, '#6a4a2c');
    });
    // 광산 입구 (산 타일 위에 겹쳐 그림)
    const entrance = (key, glow) => sprite(key, 16, 16, (P) => {
      P(3, 4, 10, 12, '#110b07'); P(4, 3, 8, 1, '#110b07');
      P(1, 2, 3, 14, '#7a5230'); P(12, 2, 3, 14, '#7a5230'); P(0, 1, 16, 3, '#9a6a3a');
      P(2, 4, 1, 12, '#9a6a3a'); P(13, 4, 1, 12, '#5a3a1e'); P(0, 3, 16, 1, '#5a3a1e');
      if (glow) { P(5, 8, 6, 8, 'rgba(255,200,60,0.35)'); P(6, 11, 4, 5, 'rgba(255,220,100,0.5)'); P(6, 0, 4, 1, '#ffd34d'); }
      P(4, 13, 8, 1, '#5a5a5a'); P(4, 15, 8, 1, '#5a5a5a');
    }, false);
    entrance('mine', false);
    entrance('lostmine', true);
  }

  /* ───────── 건물 ───────── */
  const BUILD_STYLE = {
    store: { wall: '#b98a55', front: '#a87b4a', sign: '#ecdcb0', roof: '#7a4a2a' },
    assay: { wall: '#8f7a66', front: '#7a6656', sign: '#ecd27a', roof: '#5a4a3a' },
    bank: { wall: '#a59c90', front: '#8e867c', sign: '#e6dfcc', roof: '#4a4a52', stone: true },
    saloon: { wall: '#9a5a3a', front: '#8a4a2e', sign: '#f2d888', roof: '#5a2a1a', swing: true },
    hotel: { wall: '#6f8a7a', front: '#5e7a6a', sign: '#ece6cc', roof: '#3a4a42', upper: true },
    doctor: { wall: '#ddd2bb', front: '#cbbfa6', sign: '#ffffff', roof: '#5e6e80', cross: true },
    stable: { wall: '#8a3a2a', front: '#7a3022', sign: '#ecdcb0', roof: '#4a2a1a', barn: true },
    sheriff: { wall: '#7a6a4a', front: '#6a5a3a', sign: '#ecdcb0', roof: '#3a3020', star: true },
  };
  function buildBuilding(id) {
    const st = BUILD_STYLE[id];
    const W = 80, H = 56;
    return make(W, H, (g, P) => {
      const dark = 'rgba(0,0,0,0.22)';
      // 본체 벽
      P(2, 18, 76, 38, st.wall);
      if (st.stone) {
        for (let y = 18; y < 52; y += 4) for (let x = 2 + ((y / 4) % 2) * 4; x < 78; x += 8) P(x, y, 1, 4, dark);
        for (let y = 21; y < 52; y += 4) P(2, y, 76, 1, dark);
      } else {
        for (let x = 5; x < 78; x += 4) P(x, 18, 1, 34, dark);
      }
      // 가짜 정면 상단 (서부풍)
      P(6, 3, 68, 16, st.front);
      P(4, 1, 72, 3, 'rgba(0,0,0,0.35)'); P(4, 0, 72, 1, 'rgba(255,255,255,0.15)');
      P(10, 5, 60, 11, st.sign); P(10, 5, 60, 1, 'rgba(255,255,255,0.4)'); P(10, 15, 60, 1, 'rgba(0,0,0,0.35)');
      P(9, 5, 1, 11, 'rgba(0,0,0,0.4)'); P(70, 5, 1, 11, 'rgba(0,0,0,0.4)');
      // 처마
      P(0, 24, 80, 4, st.roof); P(0, 27, 80, 1, 'rgba(0,0,0,0.4)');
      for (let x = 2; x < 80; x += 6) P(x, 24, 1, 3, 'rgba(255,255,255,0.12)');
      P(4, 28, 2, 24, '#5e4026'); P(74, 28, 2, 24, '#5e4026');
      // 창문
      const win = (x, y, w, hh) => {
        P(x - 1, y - 1, w + 2, hh + 2, '#4a3220');
        P(x, y, w, hh, '#27384a'); P(x, y, w, 2, '#3d5670');
        P(x + (w >> 1), y, 1, hh, '#4a3220'); P(x, y + (hh >> 1), w, 1, '#4a3220');
      };
      if (!st.barn) { win(12, 33, 12, 11); win(56, 33, 12, 11); }
      if (st.upper) { win(16, 18, 8, 5); win(36, 18, 8, 5); win(56, 18, 8, 5); }
      // 문
      if (st.barn) {
        P(26, 30, 28, 22, '#5a2218'); P(26, 30, 28, 2, '#3a160e');
        for (let i = 0; i < 22; i++) { P(27 + Math.floor(i * 26 / 22), 31 + i, 2, 1, '#c8a872'); P(52 - Math.floor(i * 26 / 22), 31 + i, 2, 1, '#c8a872'); }
        P(26, 30, 1, 22, '#c8a872'); P(53, 30, 1, 22, '#c8a872');
        P(10, 44, 10, 8, '#d8b848'); P(60, 44, 10, 8, '#d8b848'); P(10, 44, 10, 2, '#e8cc6a');
      } else {
        P(33, 33, 14, 19, '#24170e'); P(32, 32, 16, 1, '#5a3a20'); P(32, 32, 1, 20, '#5a3a20'); P(47, 32, 1, 20, '#5a3a20');
        if (st.swing) { P(33, 38, 6, 9, '#9a6a3a'); P(41, 38, 6, 9, '#9a6a3a'); P(33, 38, 6, 1, '#c08a4a'); P(41, 38, 6, 1, '#c08a4a'); }
        else { P(34, 34, 12, 18, '#6a4428'); P(34, 34, 12, 1, '#8a5a34'); P(43, 43, 2, 2, '#d8b848'); }
      }
      // 보도
      P(0, 51, 80, 5, '#8a6a44'); P(0, 51, 80, 1, '#a8885e');
      for (let x = 3; x < 80; x += 7) P(x, 52, 1, 4, '#6a4e30');
      // 장식
      if (st.cross) { P(30, 19, 20, 4, '#3f8a5a'); P(38, 17, 4, 8, '#3f8a5a'); P(31, 20, 18, 2, '#5cb07a'); P(39, 18, 2, 6, '#5cb07a'); }
      if (st.star) {
        const cx = 40, cy = 21;
        P(cx - 1, cy - 4, 2, 8, '#e8c040'); P(cx - 4, cy - 1, 8, 2, '#e8c040'); P(cx - 3, cy - 3, 6, 6, '#e8c040'); P(cx - 1, cy - 1, 2, 2, '#fff2a0');
      }
      if (id === 'store') { P(10, 44, 9, 7, '#a07a46'); P(10, 44, 9, 1, '#c09a60'); P(62, 45, 7, 6, '#8a5a2e'); }
      if (id === 'assay') { P(36, 18, 8, 1, '#3a2a1a'); P(39, 18, 2, 5, '#3a2a1a'); P(34, 21, 4, 2, '#e8c040'); P(42, 21, 4, 2, '#e8c040'); }
      if (id === 'bank') { P(14, 28, 4, 24, '#c8c0b2'); P(62, 28, 4, 24, '#c8c0b2'); }
      // 그림자
      P(0, 55, 80, 1, 'rgba(0,0,0,0.35)');
    });
  }

  /* ───────── 인물 ───────── */
  const PAL = {
    player: { hat: '#6b4423', band: '#3b2414', skin: '#e2aa7a', shirt: '#b84a3a', vest: '#4a3020', pants: '#3f5a7a', boots: '#3a2418', scarf: '#e0c46a', beard: '#8a6a4a', hair: '#5a3a22' },
    bandit: { hat: '#1f1a1a', band: '#7a7a7a', skin: '#c98f63', shirt: '#5e5a56', vest: '#2a2222', pants: '#4a3a2e', boots: '#1f1612', mask: '#a8322a', hair: '#2a1a10' },
    boss: { hat: '#121010', band: '#d0d0d0', skin: '#b98058', shirt: '#7a1e1e', vest: '#2a1c14', pants: '#2e2620', boots: '#141010', mask: '#d8402e', beard: '#2a1a10', hair: '#2a1a10' },
    miner: { hat: '#8a7a5a', band: '#5a4a3a', skin: '#d8a070', shirt: '#6a7a8a', vest: '#5a4030', pants: '#5a4a3a', boots: '#2a1a10', scarf: '#a04a3a', beard: '#c8c0b0', hair: '#c8c0b0' },
  };
  function person(P, pal, dir, frame) {
    const up1 = frame === 1 ? 1 : 0, up2 = frame === 2 ? 1 : 0;
    if (dir === 0 || dir === 1) {
      // 다리와 부츠
      P(5, 14, 3, 4 - up1, pal.pants); P(8, 14, 3, 4 - up2, pal.pants);
      P(5, 18 - up1, 3, 2, pal.boots); P(8, 18 - up2, 3, 2, pal.boots);
      // 몸통
      P(4, 9, 8, 5, pal.shirt);
      P(4, 9, 2, 5, pal.vest); P(10, 9, 2, 5, pal.vest);
      P(4, 13, 8, 1, '#2a1a10');
      if (dir === 0) P(7, 13, 2, 1, '#d8b44a');
      // 팔
      P(2, 9 + up2, 2, 4, pal.shirt); P(12, 9 + up1, 2, 4, pal.shirt);
      P(2, 13 + up2, 2, 1, pal.skin); P(12, 13 + up1, 2, 1, pal.skin);
      // 머리
      if (dir === 0) {
        P(5, 4, 6, 4, pal.skin);
        P(6, 5, 1, 1, '#24160c'); P(9, 5, 1, 1, '#24160c');
        if (pal.mask) P(5, 6, 6, 3, pal.mask);
        else if (pal.beard) { P(5, 7, 6, 2, pal.beard); P(6, 6, 4, 1, pal.beard); }
        P(6, 8, 4, 1, pal.mask || pal.scarf || pal.shirt);
      } else {
        P(5, 4, 6, 4, pal.hair); P(5, 8, 6, 1, pal.mask || pal.scarf || pal.shirt);
      }
      // 모자
      P(2, 3, 12, 1, pal.hat); P(1, 3, 1, 1, pal.hat); P(14, 3, 1, 1, pal.hat);
      P(4, 0, 8, 3, pal.hat); P(4, 2, 8, 1, pal.band); P(6, 0, 4, 1, 'rgba(0,0,0,0.25)');
    } else {
      // 옆모습 (오른쪽 보기)
      const a = frame === 1 ? -2 : frame === 2 ? 2 : 0;
      P(6 - (a > 0 ? 0 : -a / 2), 14, 3, 4, pal.pants);
      P(7 + a / 2, 14, 3, 4, pal.pants);
      P(5 - (a < 0 ? a / 2 : 0), 18, 4, 2, pal.boots);
      P(7 + a / 2, 18, 4, 2, pal.boots);
      P(5, 9, 6, 5, pal.shirt); P(5, 9, 2, 5, pal.vest);
      P(5, 13, 6, 1, '#2a1a10');
      const hx = frame === 1 ? 9 : frame === 2 ? 5 : 7;
      P(7, 9, 2, 3, pal.shirt); P(hx, 12, 2, 1, pal.shirt); P(hx, 13, 2, 1, pal.skin);
      P(6, 4, 5, 4, pal.skin); P(11, 5, 1, 2, pal.skin);
      P(5, 4, 2, 3, pal.hair); P(9, 5, 1, 1, '#24160c');
      if (pal.mask) P(8, 6, 4, 3, pal.mask);
      else if (pal.beard) P(7, 7, 4, 2, pal.beard);
      P(6, 8, 4, 1, pal.mask || pal.scarf || pal.shirt);
      P(2, 3, 12, 1, pal.hat); P(4, 0, 7, 3, pal.hat); P(4, 2, 7, 1, pal.band);
    }
  }
  function buildPeople() {
    for (const name in PAL) {
      for (let dir = 0; dir < 3; dir++) {
        for (let f = 0; f < 3; f++) sprite(`${name}_${dir}_${f}`, 16, 20, (P) => person(P, PAL[name], dir, f));
      }
    }
  }

  /* ───────── 동물과 괴물 ───────── */
  function buildCreatures() {
    for (let f = 0; f < 3; f++) {
      sprite('horse_' + f, 26, 20, (P) => {
        const b = '#7a4b2a', d = '#5c3620', m = '#2b1a10';
        const fl = f === 1 ? 1 : f === 2 ? -1 : 0;
        P(7 - fl, 12, 2, 6, d); P(17 + fl, 12, 2, 6, d);
        P(10 + fl, 12, 2, 6, b); P(19 - fl, 12, 2, 6, b);
        P(7 - fl, 18, 2, 2, m); P(17 + fl, 18, 2, 2, m); P(10 + fl, 18, 2, 2, m); P(19 - fl, 18, 2, 2, m);
        P(6, 7, 15, 6, b); P(7, 6, 13, 1, b); P(6, 12, 15, 1, d); P(7, 7, 12, 1, '#8f5c36');
        P(18, 3, 4, 6, b); P(20, 1, 5, 4, b); P(23, 4, 2, 2, '#4a2a16'); P(21, 0, 1, 1, b); P(22, 2, 1, 1, '#111');
        P(17, 2, 2, 6, m); P(19, 1, 2, 2, m);
        P(3, 7, 3, 2, m); P(2, 9, 2, 4, m); P(3, 12, 1, 2, m);
        P(10, 5, 6, 3, '#3a2414'); P(10, 8, 6, 2, '#a83a2a');
      });
      sprite('mule_' + f, 22, 17, (P) => {
        const b = '#8a7a6a', d = '#6a5c50';
        const fl = f === 1 ? 1 : f === 2 ? -1 : 0;
        P(5 - fl, 10, 2, 5, d); P(14 + fl, 10, 2, 5, d); P(8 + fl, 10, 2, 5, b); P(16 - fl, 10, 2, 5, b);
        P(5 - fl, 15, 2, 2, '#2a2018'); P(14 + fl, 15, 2, 2, '#2a2018'); P(8 + fl, 15, 2, 2, '#2a2018'); P(16 - fl, 15, 2, 2, '#2a2018');
        P(4, 6, 14, 5, b); P(4, 10, 14, 1, d);
        P(16, 3, 3, 5, b); P(17, 2, 4, 3, b); P(20, 4, 1, 1, '#4a3e34'); P(17, 0, 1, 3, b); P(19, 0, 1, 2, b); P(19, 3, 1, 1, '#111');
        P(2, 7, 2, 4, '#4a3e34');
        P(6, 2, 4, 5, '#a0763e'); P(11, 2, 4, 5, '#a0763e'); P(6, 2, 4, 1, '#c09a60'); P(11, 2, 4, 1, '#c09a60'); P(5, 5, 11, 1, '#5e4022');
      });
      sprite('coyote_' + f, 20, 13, (P) => {
        const b = '#a48a66', l = '#cbb48e', d = '#7e6a4e';
        const fl = f === 1 ? 1 : f === 2 ? -1 : 0;
        P(5 - fl, 9, 2, 4, d); P(12 + fl, 9, 2, 4, d); P(7 + fl, 9, 2, 4, b); P(14 - fl, 9, 2, 4, b);
        P(4, 4, 12, 5, b); P(5, 8, 10, 1, l);
        P(14, 2, 4, 5, b); P(18, 4, 2, 2, b); P(19, 4, 1, 1, '#2a1a10'); P(15, 0, 1, 2, b); P(17, 0, 1, 2, b); P(16, 3, 1, 1, '#1a1008');
        P(0, 3, 4, 3, d); P(0, 3, 1, 2, '#e8dcc4');
      });
      sprite('snake_' + f, 18, 9, (P) => {
        for (let i = 0; i < 14; i++) {
          const y = 4 + Math.round(Math.sin(i * 0.75 + f * 1.4) * 2);
          P(i, y, 2, 2, i % 3 === 0 ? '#5a6a2a' : '#7a8a3a');
          P(i, y + 1, 1, 1, '#c8c08a');
        }
        const hy = 4 + Math.round(Math.sin(14 * 0.75 + f * 1.4) * 2);
        P(13, hy - 1, 4, 3, '#6a7a32'); P(15, hy - 1, 1, 1, '#ffde50'); P(17, hy, 1, 1, '#d03030');
      });
      sprite('scorpion_' + f, 16, 11, (P) => {
        const b = '#9a6430', d = '#6e4420';
        P(5, 6, 6, 3, b); P(6, 5, 4, 1, b);
        P(4, 5, 1, 2, b); P(3, 3, 1, 2, b); P(3, 1, 2, 2, b); P(5, 0, 2, 1, b); P(7, 1, 1, 2, '#3a2010');
        P(11, 4 + (f === 1 ? -1 : 0), 3, 2, b); P(14, 3 + (f === 1 ? -1 : 0), 2, 2, d);
        P(11, 8 + (f === 2 ? 1 : 0), 3, 2, b); P(14, 8 + (f === 2 ? 1 : 0), 2, 2, d);
        for (let i = 0; i < 3; i++) { P(6 + i * 2, 9, 1, 2, d); P(6 + i * 2, 4, 1, 1, d); }
      });
      sprite('bat_' + f, 16, 10, (P) => {
        const b = '#3e2a44', w = '#57405e';
        P(7, 3, 2, 4, b); P(6, 2, 1, 2, b); P(9, 2, 1, 2, b); P(7, 4, 1, 1, '#ff5050'); P(8, 4, 1, 1, '#ff5050');
        if (f !== 1) { P(1, 1, 6, 2, w); P(9, 1, 6, 2, w); P(0, 0, 2, 2, w); P(14, 0, 2, 2, w); P(3, 3, 3, 1, w); P(10, 3, 3, 1, w); }
        else { P(1, 5, 6, 2, w); P(9, 5, 6, 2, w); P(0, 7, 2, 2, w); P(14, 7, 2, 2, w); P(3, 4, 4, 1, w); P(9, 4, 4, 1, w); }
      });
      sprite('spider_' + f, 16, 12, (P) => {
        const b = '#221c24', l = '#3a3040';
        P(5, 4, 6, 6, b); P(6, 3, 4, 1, b); P(6, 10, 4, 1, b); P(7, 6, 2, 2, '#c02828');
        P(6, 1, 1, 2, l); P(9, 1, 1, 2, l);
        const s = f === 1 ? 1 : 0;
        for (let i = 0; i < 4; i++) {
          const y = 3 + i * 2;
          P(1, y + (i % 2 ? s : -s), 4, 1, l); P(11, y + (i % 2 ? -s : s), 4, 1, l);
          P(0, y + 1 + (i % 2 ? s : -s), 1, 1, l); P(15, y + 1 + (i % 2 ? -s : s), 1, 1, l);
        }
      });
      sprite('ghost_' + f, 14, 17, (P) => {
        const w = 'rgba(226,238,244,0.9)';
        P(3, 0, 8, 1, w); P(1, 1, 12, 2, w); P(0, 3, 14, 11, w);
        for (let x = 0; x < 14; x += 2) P(x, 14, 2, 1 + ((x / 2 + f) % 2) * 2, w);
        P(3, 5, 3, 3, '#1a1424'); P(8, 5, 3, 3, '#1a1424'); P(6, 10, 2, 2, '#1a1424');
        P(2, 2, 3, 2, 'rgba(255,255,255,0.9)');
      }, false);
    }
    // 아이템/투사체
    sprite('ore', 8, 6, (P) => { P(1, 1, 6, 4, '#7a746e'); P(0, 2, 8, 3, '#7a746e'); P(2, 2, 1, 1, '#ffd54a'); P(5, 3, 2, 1, '#e0a020'); P(1, 1, 3, 1, '#948e88'); });
    sprite('nugget', 7, 6, (P) => { P(1, 1, 5, 4, '#e0a020'); P(0, 2, 7, 3, '#e0a020'); P(2, 1, 2, 1, '#fff2a0'); P(1, 4, 5, 1, '#a8741a'); });
    sprite('coin', 6, 6, (P) => { P(1, 0, 4, 6, '#e8c040'); P(0, 1, 6, 4, '#e8c040'); P(2, 1, 2, 4, '#b8901a'); P(1, 1, 1, 1, '#fff2a0'); });
    sprite('ammo', 7, 6, (P) => { for (let i = 0; i < 3; i++) { P(i * 2 + 1, 1, 1, 4, '#c89a40'); P(i * 2 + 1, 0, 1, 1, '#8a8a8a'); } });
    sprite('food', 8, 6, (P) => { P(1, 1, 6, 4, '#8a3a24'); P(0, 2, 8, 2, '#8a3a24'); P(2, 1, 3, 1, '#b05a3a'); });
    sprite('stick', 4, 8, (P) => { P(0, 1, 4, 7, '#c0302a'); P(0, 1, 4, 1, '#e05a4a'); P(1, 0, 1, 1, '#d8c8a0'); P(2, 0, 1, 1, '#ffde60'); });
    sprite('frag', 8, 8, (P) => { P(0, 1, 8, 6, '#e8d6a8'); P(1, 0, 6, 1, '#e8d6a8'); P(1, 2, 3, 1, '#8a5a2b'); P(4, 4, 3, 1, '#8a5a2b'); P(5, 2, 1, 1, '#c0302a'); });
  }

  function init() {
    buildWorldTiles();
    buildMineTiles();
    buildObjects();
    buildPeople();
    buildCreatures();
    for (const id in BUILD_STYLE) S['b_' + id] = buildBuilding(id);
  }

  /* 타일 좌표 해시로 변형 선택 */
  function pickTile(key, x, y) {
    const arr = T[key];
    if (!arr) return null;
    return arr[(U.hash2(x, y, 99) * arr.length) | 0];
  }
  /* 발 위치(wx, wy) 기준으로 스프라이트 그리기 (월드 좌표계 = 타일 단위) */
  function draw(ctx, key, wx, wy, flip = false, scale = 1, alpha = 1) {
    const c = S[key];
    if (!c) return;
    const w = (c.width / 16) * scale, h = (c.height / 16) * scale;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (flip) {
      ctx.save();
      ctx.translate(wx, 0); ctx.scale(-1, 1);
      ctx.drawImage(c, -w / 2, wy - h, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(c, wx - w / 2, wy - h, w, h);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  return { init, T, S, pickTile, draw, PAL, BUILD_STYLE };
})();
