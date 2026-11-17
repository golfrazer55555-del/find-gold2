'use strict';
/* 효과음과 배경음: 외부 파일 없이 WebAudio로 합성 */
const Sfx = (() => {
  let ctx = null, master = null, musicBus = null, noiseBuf = null;
  let sfxOn = true, musicOn = true;
  let musicMode = 'none', musicTimer = null, nextNoteTime = 0, step = 0;

  function init() {
    if (ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function resume() {
    init();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type = 'square', vol = 0.2, slide = 0, delay = 0, bus = null) {
    if (!ctx || (!bus && !sfxOn)) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus || master);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, vol = 0.3, freq = 1000, q = 1, type = 'bandpass', delay = 0) {
    if (!ctx || !sfxOn) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  const S = {
    dig(hard) { burst(0.07, 0.22, hard ? 2600 : 900, 2); tone(hard ? 420 : 190, 0.05, 'square', 0.05); },
    break() { burst(0.2, 0.3, 600, 1); },
    gold() { tone(988, 0.12, 'triangle', 0.2); tone(1319, 0.16, 'triangle', 0.16, 0, 0.07); tone(1976, 0.28, 'triangle', 0.1, 0, 0.14); },
    coin() { tone(1046, 0.07, 'square', 0.09); tone(1568, 0.14, 'square', 0.08, 0, 0.06); },
    shoot() { burst(0.16, 0.45, 1900, 0.7, 'lowpass'); tone(150, 0.12, 'sine', 0.3, -100); },
    enemyShoot() { burst(0.14, 0.25, 1300, 0.7, 'lowpass'); },
    hit() { tone(240, 0.09, 'square', 0.12, -140); },
    hurt() { tone(330, 0.22, 'sawtooth', 0.16, -220); },
    boom() { burst(1.0, 0.8, 420, 0.5, 'lowpass'); tone(70, 0.7, 'sine', 0.5, -40); },
    rumble() { burst(1.5, 0.45, 160, 0.8, 'lowpass'); },
    click() { tone(700, 0.035, 'square', 0.06); },
    deny() { tone(170, 0.14, 'square', 0.1); tone(130, 0.14, 'square', 0.08, 0, 0.1); },
    bat() { tone(2600, 0.05, 'sine', 0.04, 700); },
    ghost() { tone(240, 0.9, 'sine', 0.07, 60); tone(247, 0.9, 'sine', 0.05, 50); },
    water() { burst(0.45, 0.14, 650, 1.2); },
    pan() { burst(0.25, 0.12, 3200, 1, 'highpass'); },
    door() { tone(210, 0.07, 'square', 0.07); tone(160, 0.09, 'square', 0.06, 0, 0.06); },
    card() { burst(0.05, 0.18, 4200, 1, 'highpass'); },
    fuse() { burst(0.04, 0.05, 5200, 1, 'highpass'); },
    drip() { tone(1600 + Math.random() * 500, 0.08, 'sine', 0.035, -900); },
    eat() { burst(0.09, 0.12, 800, 2); burst(0.09, 0.12, 700, 2, 'bandpass', 0.12); },
    heal() { tone(523, 0.1, 'triangle', 0.12); tone(784, 0.18, 'triangle', 0.1, 0, 0.08); },
    win() { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.15, 0, i * 0.12)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, 0, i * 0.18)); },
  };

  /* 배경음: 사막(기타 아르페지오) / 광산(드론 + 물방울) */
  const A_MIN = [
    [220, 261.6, 329.6], [196, 246.9, 293.7], [174.6, 220, 261.6], [164.8, 207.7, 246.9],
  ];
  const PATTERN = [0, 1, 2, 1, 0, 2, 1, 2];
  function scheduleMusic() {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.25) {
      const t0 = nextNoteTime - ctx.currentTime;
      if (musicMode === 'desert') {
        const bar = Math.floor(step / 16) % 4;
        const chord = A_MIN[bar];
        const i = step % 8;
        const note = chord[PATTERN[i]] * (step % 16 >= 8 && i % 4 === 3 ? 2 : 1);
        if (musicOn) {
          tone(note * 2, 0.5, 'triangle', 0.32, 0, Math.max(0, t0), musicBus);
          if (step % 8 === 0) tone(chord[0] / 2, 1.4, 'triangle', 0.4, 0, Math.max(0, t0), musicBus);
        }
        nextNoteTime += 0.3;
      } else if (musicMode === 'mine') {
        if (musicOn) {
          if (step % 16 === 0) tone(55, 4.5, 'sine', 0.5, 0, Math.max(0, t0), musicBus);
          if (step % 16 === 8) tone(58.3, 4.5, 'sine', 0.35, 0, Math.max(0, t0), musicBus);
          if (Math.random() < 0.12) tone(1500 + Math.random() * 700, 0.08, 'sine', 0.25, -900, Math.max(0, t0), musicBus);
        }
        nextNoteTime += 0.3;
      } else {
        nextNoteTime += 0.3;
      }
      step++;
    }
  }
  function setMusicMode(mode) {
    if (mode === musicMode) return;
    musicMode = mode;
    if (!ctx) return;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    if (!musicTimer) musicTimer = setInterval(scheduleMusic, 90);
  }

  function play(name, ...args) {
    if (!ctx || !sfxOn || !S[name]) return;
    try { S[name](...args); } catch (e) { /* 무시 */ }
  }

  return {
    resume, play, setMusicMode,
    get sfxOn() { return sfxOn; }, set sfxOn(v) { sfxOn = !!v; },
    get musicOn() { return musicOn; }, set musicOn(v) { musicOn = !!v; },
  };
})();
