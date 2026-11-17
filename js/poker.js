'use strict';
/* 살롱 포커: 5장 드로우, 일대일, 고정 베팅 */
const Poker = (() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RN = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const NAMES = ['하이 카드', '원 페어', '투 페어', '트리플', '스트레이트', '플러시', '풀 하우스', '포카드', '스트레이트 플러시'];
  const OPPONENTS = [
    { id: 'hank', name: '도박꾼 행크', bluff: 0.2, tight: 0, line: '카드는 거짓말을 안 하지. 사람이 하지.' },
    { id: 'lily', name: '미스 릴리', bluff: 0.08, tight: 0.35, line: '서두르지 마세요, 광부 양반.' },
    { id: 'silas', name: '늙은 사일러스', bluff: 0.3, tight: -0.3, line: '허허, 오늘은 운이 좋을 것 같구먼!' },
  ];
  const STAKES = [
    { id: 'low', name: '소액 판', ante: 2, small: 5, big: 10 },
    { id: 'high', name: '큰 판', ante: 10, small: 20, big: 40 },
  ];

  function newDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function evaluate(cards) {
    const rs = cards.map((c) => c.r).sort((a, b) => b - a);
    const counts = {};
    rs.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    const groups = Object.entries(counts).map(([r, c]) => [+r, c]).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every((c) => c.s === cards[0].s);
    const uniq = [...new Set(rs)];
    let straight = false, high = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) { straight = true; high = uniq[0]; }
      else if (uniq.join(',') === '14,5,4,3,2') { straight = true; high = 5; }
    }
    let cat;
    if (straight && flush) cat = 8;
    else if (groups[0][1] === 4) cat = 7;
    else if (groups[0][1] === 3 && groups[1][1] === 2) cat = 6;
    else if (flush) cat = 5;
    else if (straight) cat = 4;
    else if (groups[0][1] === 3) cat = 3;
    else if (groups[0][1] === 2 && groups[1][1] === 2) cat = 2;
    else if (groups[0][1] === 2) cat = 1;
    else cat = 0;
    const tb = straight ? [high] : groups.map((g) => g[0]);
    const name = cat === 8 && high === 14 ? '로열 플러시' : NAMES[cat];
    return { cat, tb, name };
  }
  function compare(a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    for (let i = 0; i < Math.max(a.tb.length, b.tb.length); i++) {
      const d = (a.tb[i] || 0) - (b.tb[i] || 0);
      if (d) return d;
    }
    return 0;
  }
  function strength(hand) { const e = evaluate(hand); return e.cat + ((e.tb[0] - 2) / 12) * 0.9; }
  function aiDiscard(hand) {
    const ev = evaluate(hand);
    if (ev.cat >= 4) return [];
    if (ev.cat >= 1) {
      const counts = {};
      hand.forEach((c) => { counts[c.r] = (counts[c.r] || 0) + 1; });
      return hand.map((c, i) => (counts[c.r] >= 2 ? -1 : i)).filter((i) => i >= 0);
    }
    const suitCount = [0, 0, 0, 0];
    hand.forEach((c) => suitCount[c.s]++);
    const fs = suitCount.findIndex((n) => n === 4);
    if (fs >= 0) return hand.map((c, i) => (c.s !== fs ? i : -1)).filter((i) => i >= 0);
    const order = hand.map((c, i) => [c.r, i]).sort((a, b) => b[0] - a[0]);
    return order.slice(2).map((o) => o[1]);
  }

  /* ───────── 화면 ───────── */
  let st = null;
  function cardEl(c, opts = {}) {
    const red = c && (c.s === 1 || c.s === 2);
    if (!c || opts.back) return U.h('div', { class: 'card back', 'aria-label': '뒷면 카드' });
    const label = (RN[c.r] || String(c.r));
    return U.h(opts.onclick ? 'button' : 'div', {
      class: 'card' + (red ? ' red' : '') + (opts.sel ? ' sel' : '') + (opts.win ? ' win' : ''),
      onclick: opts.onclick, type: opts.onclick ? 'button' : null,
      'aria-label': label + SUITS[c.s] + (opts.sel ? ' (교체 선택)' : ''),
    }, U.h('span', { class: 'cr' }, label), U.h('span', { class: 'cs' }, SUITS[c.s]));
  }

  function open(container) {
    st = { root: container, phase: 'pick', opp: OPPONENTS[0], stake: STAKES[0], log: [] };
    render();
  }
  function bankroll(opp) {
    const P = G.saloon;
    if (P.day !== G.day) { P.day = G.day; P.bank = {}; }
    if (P.bank[opp.id] == null) P.bank[opp.id] = 250 + Math.floor(Math.random() * 250);
    return P.bank[opp.id];
  }
  function setBank(opp, v) { G.saloon.bank[opp.id] = v; }

  function startHand() {
    const p = G.player, s = st.stake;
    if (p.money < s.ante + s.big) { Game.toast(`최소 ${U.fmtMoney(s.ante + s.big)}은 있어야 앉을 수 있다.`, 'bad'); return; }
    if (bankroll(st.opp) < s.ante + s.big) { Game.toast(`${st.opp.name}은(는) 오늘 빈털터리다.`, 'bad'); return; }
    p.money -= s.ante; setBank(st.opp, bankroll(st.opp) - s.ante);
    st.deck = newDeck();
    st.me = st.deck.splice(0, 5); st.ai = st.deck.splice(0, 5);
    st.sel = new Set(); st.pot = s.ante * 2; st.myIn = s.ante; st.aiIn = s.ante;
    st.phase = 'draw'; st.log = ['참가비를 냈다. 바꿀 카드를 고르자 (최대 3장).'];
    Sfx.play('card');
    render();
  }
  function doDraw() {
    const idx = [...st.sel].sort((a, b) => a - b);
    for (const i of idx) st.me[i] = st.deck.pop();
    const aidx = aiDiscard(st.ai);
    for (const i of aidx) st.ai[i] = st.deck.pop();
    st.log = [idx.length ? `카드 ${idx.length}장을 바꿨다.` : '그대로 간다.', aidx.length ? `${st.opp.name}: ${aidx.length}장 교체.` : `${st.opp.name}: 바꾸지 않는다.`];
    st.sel.clear();
    st.phase = 'bet';
    Sfx.play('card');
    render();
  }
  function put(who, amt) {
    if (who === 'me') { G.player.money -= amt; st.myIn += amt; }
    else { setBank(st.opp, bankroll(st.opp) - amt); st.aiIn += amt; }
    st.pot += amt;
  }
  function aiStrength() { return strength(st.ai) - st.opp.tight + (Math.random() - 0.5) * 0.6; }
  function playerCheck() {
    const s = aiStrength();
    if (s >= 2 || Math.random() < st.opp.bluff) {
      const amt = s >= 3 ? st.stake.big : st.stake.small;
      put('ai', amt);
      st.toCall = amt;
      st.log.push(`체크. ${st.opp.name}이(가) ${U.fmtMoney(amt)} 베팅했다.`);
      st.phase = 'respond';
    } else {
      st.log.push(`체크. ${st.opp.name}도 체크.`);
      return showdown();
    }
    render();
  }
  function playerBet(amt) {
    if (G.player.money < amt) { Game.toast('돈이 부족하다.', 'bad'); return; }
    put('me', amt);
    const s = aiStrength();
    const need = amt >= st.stake.big ? 1.6 : 1.05;
    if (s >= 3.2 && Math.random() < 0.6 && bankroll(st.opp) >= amt + st.stake.small) {
      put('ai', amt + st.stake.small);
      st.toCall = st.stake.small;
      st.log.push(`${U.fmtMoney(amt)} 베팅. ${st.opp.name}이(가) ${U.fmtMoney(st.stake.small)} 더 올렸다!`);
      st.phase = 'respond';
      render();
    } else if (s >= need || Math.random() < 0.15) {
      put('ai', Math.min(amt, bankroll(st.opp)));
      st.log.push(`${U.fmtMoney(amt)} 베팅. ${st.opp.name}이(가) 받았다.`);
      showdown();
    } else {
      st.log.push(`${U.fmtMoney(amt)} 베팅. ${st.opp.name}이(가) 카드를 접었다.`);
      win('me', true);
    }
  }
  function playerCall() {
    const amt = Math.min(st.toCall, G.player.money);
    put('me', amt);
    st.log.push(`${U.fmtMoney(amt)} 콜.`);
    showdown();
  }
  function playerFold() {
    st.log.push('카드를 접었다.');
    win('ai', true);
  }
  function showdown() {
    const a = evaluate(st.me), b = evaluate(st.ai);
    st.evMe = a; st.evAi = b;
    const c = compare(a, b);
    st.log.push(`쇼다운! 나: ${a.name} / ${st.opp.name}: ${b.name}`);
    if (c > 0) win('me', false); else if (c < 0) win('ai', false); else win('split', false);
  }
  function win(who, byFold) {
    st.reveal = !byFold;
    st.phase = 'done';
    if (who === 'me') {
      G.player.money += st.pot; G.stats.pokerNet += st.pot - st.myIn;
      st.result = { text: `팟 ${U.fmtMoney(st.pot)}을 가져왔다!`, cls: 'good' };
      Sfx.play('coin');
    } else if (who === 'ai') {
      setBank(st.opp, bankroll(st.opp) + st.pot); G.stats.pokerNet -= st.myIn;
      st.result = { text: `${st.opp.name}이(가) 팟 ${U.fmtMoney(st.pot)}을 가져갔다.`, cls: 'bad' };
      Sfx.play('deny');
    } else {
      const half = Math.floor(st.pot / 2);
      G.player.money += half; setBank(st.opp, bankroll(st.opp) + st.pot - half);
      st.result = { text: '무승부. 팟을 나눴다.', cls: '' };
    }
    UI.refreshHud(true);
    render();
  }

  function render() {
    const { h } = U;
    const p = G.player, root = st.root;
    root.innerHTML = '';
    if (st.phase === 'pick') {
      root.append(
        h('p', { class: 'lead' }, '구석 테이블에서 카드 패가 오간다. 5장 드로우 포커, 한 번 교체 후 한 번 베팅한다.'),
        h('div', { class: 'label' }, '상대'),
        h('div', { class: 'chips' }, OPPONENTS.map((o) => h('button', {
          class: 'chip' + (st.opp === o ? ' on' : ''), type: 'button',
          onclick: () => { st.opp = o; Sfx.play('click'); render(); },
        }, o.name, h('small', null, U.fmtMoney(bankroll(o)))))),
        h('div', { class: 'label' }, '판돈'),
        h('div', { class: 'chips' }, STAKES.map((s) => h('button', {
          class: 'chip' + (st.stake === s ? ' on' : ''), type: 'button',
          onclick: () => { st.stake = s; Sfx.play('click'); render(); },
        }, s.name, h('small', null, `참가비 ${U.fmtMoney(s.ante)} · 베팅 ${U.fmtMoney(s.small)}/${U.fmtMoney(s.big)}`)))),
        h('p', { class: 'quote' }, `“${st.opp.line}”`),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', onclick: startHand }, `앉기 (참가비 ${U.fmtMoney(st.stake.ante)})`),
          h('button', { class: 'btn', type: 'button', onclick: () => UI.openBuilding('saloon') }, '바로 돌아가기')),
        h('p', { class: 'hint' }, `소지금 ${U.fmtMoney(p.money)} · 포커 누적 손익 ${G.stats.pokerNet >= 0 ? '+' : '-'}${U.fmtMoney(Math.abs(G.stats.pokerNet))}`),
      );
      return;
    }
    const showAi = st.phase === 'done' && st.reveal;
    root.append(
      h('div', { class: 'poker-head' },
        h('span', null, st.opp.name, h('small', null, ' ' + U.fmtMoney(bankroll(st.opp)))),
        h('span', { class: 'pot' }, '팟 ' + U.fmtMoney(st.pot))),
      h('div', { class: 'hand' }, st.ai.map((c) => cardEl(c, { back: !showAi }))),
      showAi ? h('div', { class: 'hand-name' }, '상대 패: ' + st.evAi.name) : '',
      h('div', { class: 'poker-log' }, st.log.slice(-3).map((l) => h('div', null, l))),
      h('div', { class: 'hand mine' }, st.me.map((c, i) => cardEl(c, {
        sel: st.sel && st.sel.has(i),
        onclick: st.phase === 'draw' ? () => {
          if (st.sel.has(i)) st.sel.delete(i); else if (st.sel.size < 3) st.sel.add(i);
          Sfx.play('card'); render();
        } : null,
      }))),
      h('div', { class: 'hand-name' }, '내 패: ' + evaluate(st.me).name),
    );
    const row = h('div', { class: 'row' });
    if (st.phase === 'draw') {
      row.append(h('button', { class: 'btn primary', type: 'button', onclick: doDraw }, st.sel.size ? `${st.sel.size}장 교체` : '그대로 간다'));
    } else if (st.phase === 'bet') {
      row.append(
        h('button', { class: 'btn', type: 'button', onclick: playerCheck }, '체크'),
        h('button', { class: 'btn primary', type: 'button', onclick: () => playerBet(st.stake.small), disabled: p.money < st.stake.small }, `베팅 ${U.fmtMoney(st.stake.small)}`),
        h('button', { class: 'btn primary', type: 'button', onclick: () => playerBet(st.stake.big), disabled: p.money < st.stake.big }, `베팅 ${U.fmtMoney(st.stake.big)}`),
        h('button', { class: 'btn danger', type: 'button', onclick: playerFold }, '폴드'));
    } else if (st.phase === 'respond') {
      row.append(
        h('button', { class: 'btn primary', type: 'button', onclick: playerCall }, `콜 ${U.fmtMoney(Math.min(st.toCall, p.money))}`),
        h('button', { class: 'btn danger', type: 'button', onclick: playerFold }, '폴드'));
    } else if (st.phase === 'done') {
      root.append(h('div', { class: 'result ' + st.result.cls }, st.result.text));
      row.append(
        h('button', { class: 'btn primary', type: 'button', onclick: startHand }, '한 판 더'),
        h('button', { class: 'btn', type: 'button', onclick: () => { st.phase = 'pick'; render(); } }, '테이블 바꾸기'),
        h('button', { class: 'btn', type: 'button', onclick: () => UI.openBuilding('saloon') }, '일어나기'));
    }
    root.append(row, h('p', { class: 'hint' }, `소지금 ${U.fmtMoney(p.money)}`));
  }
  function busy() { return st && st.phase !== 'pick' && st.phase !== 'done'; }

  return { open, evaluate, compare, busy };
})();
