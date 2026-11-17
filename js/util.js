'use strict';
/* 공용 유틸리티: 난수, 노이즈, 수학, 압축, DOM 헬퍼 */
const U = (() => {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) { this.f = mulberry32(seed >>> 0); }
    next() { return this.f(); }
    range(a, b) { return a + (b - a) * this.f(); }
    int(a, b) { return a + Math.floor((b - a + 1) * this.f()); }
    chance(p) { return this.f() < p; }
    pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.f() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    }
  }

  function hash2(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul((s | 0) + 1013, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const smooth = (t) => t * t * (3 - 2 * t);
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s);
    const c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    const u = smooth(xf), v = smooth(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct = 4) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += vnoise(x * freq, y * freq, s + i * 101) * amp;
      norm += amp; amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  }
  /* 값 배열에서 상위 p 비율의 경계값 */
  function percentile(arr, p) {
    const c = Float32Array.from(arr).sort();
    return c[Math.min(c.length - 1, Math.max(0, Math.floor(c.length * p)))];
  }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  /* 런 길이 압축 (세이브 용량 절약) */
  function rleEncode(arr) {
    const out = [];
    let i = 0;
    while (i < arr.length) {
      const v = arr[i];
      let n = 1;
      while (i + n < arr.length && arr[i + n] === v) n++;
      out.push(v.toString(36) + (n > 1 ? '.' + n.toString(36) : ''));
      i += n;
    }
    return out.join(',');
  }
  function rleDecode(str, len) {
    const arr = new Uint8Array(len);
    if (!str) return arr;
    let i = 0;
    for (const part of str.split(',')) {
      const [v, n] = part.split('.');
      const val = parseInt(v, 36), cnt = n ? parseInt(n, 36) : 1;
      for (let k = 0; k < cnt && i < len; k++) arr[i++] = val;
    }
    return arr;
  }

  function fmtMoney(n) { return '$' + Math.floor(n).toLocaleString('en-US'); }
  function fmtTime(min) {
    const h = Math.floor(min / 60) % 24, m = Math.floor(min % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function fmtKg(n) { return (Math.round(n * 10) / 10).toFixed(1) + 'kg'; }

  /* 작은 DOM 빌더 */
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style') el.style.cssText = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }

  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };

  return { RNG, hash2, vnoise, fbm, percentile, clamp, lerp, dist, rleEncode, rleDecode, fmtMoney, fmtTime, fmtKg, h, store };
})();
