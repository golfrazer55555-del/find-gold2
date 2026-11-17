'use strict';
/* HUD, 메시지, 모달 창, 건물 메뉴, 가방, 지도, 타이틀 */
const SHOP = [
  { id: 'food', name: '식량', desc: '육포와 콩 통조림. 허기 +45, 배고프면 저절로 먹는다.', price: 3, give: (p) => { p.inv.food++; }, owned: (p) => p.inv.food, bulk: true },
  { id: 'oil', name: '등불 기름', desc: '+50 (최대 100). 광산 안에서만 닳는다.', price: 5, give: (p) => { p.inv.oil = Math.min(100, p.inv.oil + 50); }, owned: (p) => Math.round(p.inv.oil) + '/100', can: (p) => p.inv.oil < 100 },
  { id: 'dynamite', name: '다이너마이트', desc: '단단한 암반까지 날린다. 주변 금맥은 광석으로 떨어진다.', price: 10, give: (p) => { p.inv.dynamite++; }, owned: (p) => p.inv.dynamite, bulk: true },
  { id: 'timber', name: '버팀목', desc: '세운 자리 주변 3칸에서는 낙반이 일어나지 않는다.', price: 4, give: (p) => { p.inv.timber++; }, owned: (p) => p.inv.timber, bulk: true },
  { id: 'ammo', name: '총알 6발', desc: '리볼버 탄약.', price: 4, give: (p) => { p.inv.ammo += 6; }, owned: (p) => p.inv.ammo, bulk: true },
  { id: 'bandage', name: '붕대', desc: '체력 +35.', price: 5, give: (p) => { p.inv.bandage++; }, owned: (p) => p.inv.bandage, bulk: true },
  { id: 'antidote', name: '해독제', desc: '뱀과 전갈의 독을 바로 없앤다.', price: 7, give: (p) => { p.inv.antidote++; }, owned: (p) => p.inv.antidote },
  { id: 'pan', name: '사금 접시', desc: '강이나 연못에서 사금을 일 수 있다.', price: 12, once: (p) => p.inv.pan, give: (p) => { p.inv.pan = true; } },
  { id: 'canteen', name: '큰 물통', desc: '물을 6번에서 12번까지 담는다.', price: 25, once: (p) => p.inv.waterMax >= 12, give: (p) => { p.inv.waterMax = 12; p.inv.water = 12; } },
  { id: 'bedroll', name: '침낭', desc: '밤에 마을 밖에서 야영하며 쉬고 저장할 수 있다.', price: 15, once: (p) => p.inv.bedroll, give: (p) => { p.inv.bedroll = true; } },
  { id: 'lantern', name: '반사경 등불', desc: '광산 시야가 넓어지고 기름이 덜 든다.', price: 45, once: (p) => p.inv.lantern >= 2, give: (p) => { p.inv.lantern = 2; } },
  { id: 'pick', name: '강철 곡괭이', desc: '채굴 속도가 1.7배 빨라진다.', price: 80, once: (p) => p.inv.pick >= 2, give: (p) => { p.inv.pick = 2; } },
];

const TIPS = [
  '버팀목 근처에선 천장이 무너지지 않아. 깊이 들어갈수록 꼭 세워 두게.',
  '푸르스름한 암반은 곡괭이로는 안 돼. 다이너마이트를 쓰게.',
  '유령은 등불 빛을 싫어하지. 기름이 떨어지면 그때부터 끝장이야.',
  '말을 타면 사막을 훨씬 빨리 건너지. 노새는 짐을 산더미처럼 지고.',
  '은행에 맡긴 돈은 쓰러져도 안전해. 하루에 1%씩 이자도 붙고.',
  '강가에서 사금 접시로 사금을 일 수 있다네. 쏠쏠하지.',
  '밤에는 코요테 무리가 돌아다녀. 해 지기 전에 돌아오게.',
  '금 시세는 매일 바뀌어. 싸게 팔지 말고 기다리는 것도 방법이지.',
  '광산 지하 웅덩이 물도 마실 만해. 물통을 채우게.',
  '반사경 등불이면 광산 안이 훨씬 넓게 보인다더군.',
];

const UI = (() => {
  const $ = (id) => document.getElementById(id);
  const { h } = U;
  let kind = null, onClose = null, closable = true;
  const cache = {};
  let el = {};

  function init() {
    el = {
      hud: $('hud'), toasts: $('toasts'), prompt: $('prompt'), banner: $('banner'),
      modal: $('modal'), mTitle: $('modal-title'), mBody: $('modal-body'), mClose: $('modal-close'),
      title: $('title-screen'), fade: $('fade'), aLabel: $('a-label'),
      money: $('h-money'), ore: $('h-ore'), clock: $('h-clock'), loc: $('h-loc'), gear: $('h-gear'), chips: $('h-chips'),
      timberBtn: $('btn-timber'), rideBtn: $('btn-ride'), touch: $('touch'),
    };
    document.querySelectorAll('[data-ui]').forEach((b) => b.addEventListener('click', (e) => {
      e.preventDefault();
      Sfx.resume();
      if (!G || G.demo) return;
      const k = b.dataset.ui;
      if (kind === k) { close(); return; }
      if (kind && !closable) return;
      if (k === 'map') openMap(); else if (k === 'bag') openBag(); else if (k === 'menu') openMenu();
    }));
    el.mClose.addEventListener('click', () => { if (closable) close(); });
    el.modal.addEventListener('pointerdown', (e) => { if (e.target === el.modal && closable) close(); });
    // 모달 안에서 키 입력: Esc 닫기
    window.addEventListener('keydown', (e) => {
      if (kind === 'pan' && (e.code === 'Space' || e.code === 'KeyE' || e.code === 'Enter')) { e.preventDefault(); panAction(); }
    });
  }

  /* ───────── HUD ───────── */
  function setText(node, key, val) { if (cache[key] !== val) { cache[key] = val; node.textContent = val; } }
  function meter(name, ratio, text) {
    const m = document.querySelector(`.meter.${name}`);
    if (!m) return;
    const r = Math.round(U.clamp(ratio, 0, 1) * 100);
    if (cache['m' + name] !== r) { cache['m' + name] = r; m.querySelector('i').style.width = r + '%'; m.classList.toggle('low', r < 25); }
    setText(m.querySelector('b'), 't' + name, text);
  }
  function refreshHud(force) {
    if (!G || G.demo) return;
    if (force) for (const k in cache) delete cache[k];
    const p = G.player;
    meter('hp', p.hp / p.maxHp, String(Math.max(0, Math.ceil(p.hp))));
    meter('food', p.hunger / 100, String(p.inv.food));
    meter('water', p.thirst / 100, `${p.inv.water}/${p.inv.waterMax}`);
    meter('oil', p.inv.oil / 100, String(Math.round(p.inv.oil)));
    setText(el.money, 'money', U.fmtMoney(p.money));
    setText(el.ore, 'ore', `${U.fmtKg(p.ore)}/${Game.capacity()}kg`);
    setText(el.clock, 'clock', `${G.day}일 ${U.fmtTime(G.time)}${Game.isNightTime() ? ' ☾' : ''}`);
    let loc;
    if (G.scene === 'mine') {
      const name = G.mineId === Game.LOST_ID ? '전설의 광맥' : G.world.mines[G.mineId].name;
      loc = `${name} · 지하 ${G.levelNo}층`;
    } else loc = Game.inTown(p.x, p.y) ? '더스트우드' : '협곡';
    setText(el.loc, 'loc', loc);
    setText(el.gear, 'gear', `총알 ${p.inv.ammo} · 폭약 ${p.inv.dynamite} · 버팀목 ${p.inv.timber}`);
    const chips = [];
    if (p.poison > 0) chips.push('중독');
    if (p.mounted) chips.push('승마');
    if (p.heart) chips.push('황금 심장');
    setText(el.chips, 'chips', chips.join(' · '));
    el.chips.hidden = !chips.length;
    const c = G.context;
    const label = c ? c.label : '행동';
    setText(el.aLabel, 'alabel', label);
    const promptText = c && !p.dead ? (c.dig ? `[E 누르고 있기] ${c.label}` : `[E] ${c.label}`) : '';
    setText(el.prompt, 'prompt', promptText);
    el.prompt.hidden = !promptText || Input.touchMode || !!kind;
    document.body.classList.toggle('has-ctx', !!c);
    const inMine = G.scene === 'mine';
    if (cache.inMine !== inMine) { cache.inMine = inMine; el.timberBtn.hidden = !inMine; document.body.classList.toggle('in-mine', inMine); }
    const ride = !inMine && p.horse;
    if (cache.ride !== ride) { cache.ride = ride; el.rideBtn.hidden = !ride; }
    setText(el.rideBtn.querySelector('span'), 'ridel', p.mounted ? '내리기' : '타기');
  }

  function toast(text, kindName = 'info') {
    const t = h('div', { class: 'toast ' + kindName }, text);
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), 3800);
    setTimeout(() => t.remove(), 4400);
  }
  let bannerTimer = null;
  function banner(title, sub) {
    el.banner.innerHTML = '';
    el.banner.append(h('strong', null, title), sub ? h('span', null, sub) : '');
    el.banner.hidden = false;
    el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { el.banner.hidden = true; }, 2600);
  }
  function fade(cb) {
    el.fade.hidden = false;
    el.fade.classList.add('on');
    setTimeout(() => {
      cb();
      setTimeout(() => { el.fade.classList.remove('on'); setTimeout(() => { el.fade.hidden = true; }, 500); }, 250);
    }, 550);
  }

  /* ───────── 모달 ───────── */
  function open(k, title, build, opts = {}) {
    kind = k;
    closable = opts.closable !== false;
    onClose = opts.onClose || null;
    el.mTitle.textContent = title;
    el.mBody.innerHTML = '';
    el.mBody.scrollTop = 0;
    el.modal.className = 'modal ' + (opts.cls || '');
    el.mClose.hidden = !closable;
    build(el.mBody);
    el.modal.hidden = false;
    el.prompt.hidden = true;
    Input.clear();
  }
  function close() {
    if (!kind) return;
    const cb = onClose;
    kind = null; onClose = null;
    el.modal.hidden = true;
    el.mBody.innerHTML = '';
    Input.clear();
    if (cb) cb();
    const canvas = document.getElementById('game');
    if (canvas) canvas.focus({ preventScroll: true });
  }
  function note(title, html, btn = '확인') {
    open('note', title, (b) => {
      b.append(h('div', { class: 'note', html }), h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: close }, btn)));
    }, { cls: 'narrow' });
  }
  function confirm(title, text, yes, onYes) {
    open('confirm', title, (b) => {
      b.append(h('p', { class: 'lead' }, text), h('div', { class: 'row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => { close(); onYes(); } }, yes),
        h('button', { class: 'btn', type: 'button', onclick: close }, '취소')));
    }, { cls: 'narrow' });
  }

  function spend(cost) {
    const p = G.player;
    if (p.money < cost) { Sfx.play('deny'); toast(`돈이 모자란다. (${U.fmtMoney(cost)} 필요)`, 'bad'); return false; }
    p.money -= cost; Sfx.play('coin');
    return true;
  }
  const moneyLine = () => h('div', { class: 'purse' }, h('span', null, '소지금'), h('strong', null, U.fmtMoney(G.player.money)));
  const rerender = (id) => () => openBuilding(id);

  /* ───────── 건물 ───────── */
  function openBuilding(id) {
    const b = BUILDINGS.find((x) => x.id === id);
    const p = G.player;
    const build = {
      store: (body) => {
        body.append(h('p', { class: 'lead' }, '“필요한 건 다 있소. 외상은 안 되고.” 주인 메이블이 계산대를 두드린다.'), moneyLine());
        const list = h('div', { class: 'shop' });
        for (const it of SHOP) {
          const owned = it.once ? it.once(p) : false;
          const ok = !owned && (!it.can || it.can(p));
          const row = h('div', { class: 'shop-row' + (owned ? ' owned' : '') },
            h('div', { class: 'shop-info' }, h('strong', null, it.name), h('small', null, it.desc)),
            h('div', { class: 'shop-own' }, owned ? '보유' : it.owned ? `보유 ${it.owned(p)}` : ''),
            h('div', { class: 'shop-buy' },
              h('button', {
                class: 'btn small primary', type: 'button', disabled: !ok,
                onclick: () => { if (spend(it.price)) { it.give(p); rerender('store')(); } },
              }, owned ? '구매함' : U.fmtMoney(it.price)),
              it.bulk ? h('button', {
                class: 'btn small', type: 'button',
                onclick: () => { if (spend(it.price * 5)) { for (let i = 0; i < 5; i++) it.give(p); rerender('store')(); } },
              }, `×5 ${U.fmtMoney(it.price * 5)}`) : null));
          list.append(row);
        }
        body.append(list);
      },
      assay: (body) => {
        const price = G.goldPrice;
        const oreV = Math.floor(p.ore * price);
        const nugV = Math.floor(p.nuggets.reduce((a, b) => a + b, 0) * price / 20);
        const dustV = Math.floor(p.dust * 3 * price / 20);
        const total = oreV + nugV + dustV;
        const trend = price > 22 ? '높은 편' : price < 17 ? '낮은 편' : '보통';
        body.append(
          h('p', { class: 'lead' }, '확대경을 쓴 감정사가 저울 눈금을 맞춘다. “어디 한번 봅시다.”'),
          h('div', { class: 'price-tag' }, h('span', null, '오늘의 금 시세'), h('strong', null, `${U.fmtMoney(price)}/kg`), h('em', null, trend)),
          h('table', { class: 'ledger' },
            h('tr', null, h('td', null, '금광석'), h('td', null, U.fmtKg(p.ore)), h('td', null, U.fmtMoney(oreV))),
            h('tr', null, h('td', null, '금덩이'), h('td', null, `${p.nuggets.length}개`), h('td', null, U.fmtMoney(nugV))),
            h('tr', null, h('td', null, '사금'), h('td', null, `${p.dust}줌`), h('td', null, U.fmtMoney(dustV))),
            h('tr', { class: 'sum' }, h('td', null, '합계'), h('td', null, ''), h('td', null, U.fmtMoney(total)))),
          h('div', { class: 'row' }, h('button', {
            class: 'btn primary', type: 'button', disabled: total <= 0,
            onclick: () => {
              p.money += total; G.stats.earned += total; p.ore = 0; p.nuggets = []; p.dust = 0;
              Sfx.play('coin'); toast(`${U.fmtMoney(total)}을 받았다!`, 'good'); Game.save(); rerender('assay')();
            },
          }, total > 0 ? `모두 팔기 · ${U.fmtMoney(total)}` : '팔 것이 없다')),
        );
        if (p.heart) {
          body.append(h('div', { class: 'heart-box' },
            h('p', null, '감정사의 손이 떨린다. “이… 이건 전설 속의 황금 심장이잖소!”'),
            h('button', { class: 'btn gold', type: 'button', onclick: () => { close(); victory(); } }, '황금 심장 감정받기')));
        }
        body.append(h('p', { class: 'hint' }, '시세는 매일 자정에 바뀐다. 금덩이와 사금도 시세에 따라 값이 매겨진다.'));
      },
      bank: (body) => {
        const amounts = [10, 50, 100];
        const dep = (a) => { const v = Math.min(a, p.money); if (v <= 0) return; p.money -= v; p.bank += v; Sfx.play('coin'); Game.save(); rerender('bank')(); };
        const wd = (a) => { const v = Math.min(a, Math.floor(p.bank)); if (v <= 0) return; p.bank -= v; p.money += v; Sfx.play('coin'); Game.save(); rerender('bank')(); };
        body.append(
          h('p', { class: 'lead' }, '철창 너머의 은행원이 장부를 펼친다. 맡긴 돈은 쓰러져도 잃지 않고, 하루 1% 이자가 붙는다.'),
          h('div', { class: 'two' },
            h('div', { class: 'stat' }, h('span', null, '소지금'), h('strong', null, U.fmtMoney(p.money))),
            h('div', { class: 'stat' }, h('span', null, '예금'), h('strong', null, U.fmtMoney(p.bank)))),
          h('div', { class: 'label' }, '입금'),
          h('div', { class: 'row' }, amounts.map((a) => h('button', { class: 'btn small', type: 'button', disabled: p.money < 1, onclick: () => dep(a) }, U.fmtMoney(a))),
            h('button', { class: 'btn small primary', type: 'button', disabled: p.money < 1, onclick: () => dep(p.money) }, '전액')),
          h('div', { class: 'label' }, '출금'),
          h('div', { class: 'row' }, amounts.map((a) => h('button', { class: 'btn small', type: 'button', disabled: p.bank < 1, onclick: () => wd(a) }, U.fmtMoney(a))),
            h('button', { class: 'btn small primary', type: 'button', disabled: p.bank < 1, onclick: () => wd(p.bank) }, '전액')),
        );
      },
      saloon: (body) => {
        body.append(
          h('p', { class: 'lead' }, '피아노 소리와 담배 연기. 바텐더 오티스가 잔을 닦으며 고개를 든다.'), moneyLine(),
          h('div', { class: 'menu-list' },
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (spend(2)) { p.thirst = Math.min(100, p.thirst + 10); rumor(body); } } },
              h('strong', null, '위스키 한 잔 · $2'), h('small', null, '오티스에게 요즘 도는 소문을 듣는다.')),
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (spend(5)) { p.hunger = 100; p.thirst = 100; toast('스튜와 빵으로 배를 채웠다.', 'good'); rerender('saloon')(); } } },
              h('strong', null, '따뜻한 식사 · $5'), h('small', null, '허기와 갈증을 모두 채운다.')),
            h('button', { class: 'menu-item', type: 'button', onclick: () => { el.mTitle.textContent = '포커 테이블'; Poker.open(body); } },
              h('strong', null, '포커 테이블'), h('small', null, '5장 드로우 포커로 한몫 잡거나 잃거나.'))),
          h('div', { id: 'rumor-box' }),
        );
      },
      hotel: (body) => {
        body.append(
          h('p', { class: 'lead' }, '삐걱이는 계단 위로 방 여섯 개. “하룻밤에 $8, 아침 커피 포함.”'), moneyLine(),
          h('div', { class: 'menu-list' },
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (spend(8)) sleep(); } },
              h('strong', null, '하룻밤 묵기 · $8'), h('small', null, '아침 7시까지 자고 체력을 모두 회복한다. 게임이 저장된다.')),
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (Game.save()) toast('저장했다.', 'good'); else toast('저장하지 못했다. 브라우저 저장소가 막혀 있을 수 있다.', 'bad'); } },
              h('strong', null, '숙박부에 이름 적기'), h('small', null, '지금 상태를 저장한다. (무료)'))),
        );
      },
      doctor: (body) => {
        const miss = Math.ceil(p.maxHp - p.hp);
        const cost = miss > 0 ? Math.max(3, Math.ceil(miss / 2)) : 0;
        body.append(
          h('p', { class: 'lead' }, '닥 하워드가 안경 너머로 당신을 훑어본다. “또 어디를 다쳐 왔나?”'), moneyLine(),
          h('div', { class: 'menu-list' },
            h('button', { class: 'menu-item', type: 'button', disabled: miss <= 0, onclick: () => { if (spend(cost)) { p.hp = p.maxHp; Sfx.play('heal'); toast('상처를 꿰맸다. 체력이 모두 회복됐다.', 'good'); rerender('doctor')(); } } },
              h('strong', null, miss > 0 ? `치료 받기 · ${U.fmtMoney(cost)}` : '치료 받기'), h('small', null, miss > 0 ? `체력 ${Math.ceil(p.hp)} → ${p.maxHp}` : '다친 곳이 없다.')),
            h('button', { class: 'menu-item', type: 'button', disabled: p.poison <= 0, onclick: () => { if (spend(5)) { p.poison = 0; Sfx.play('heal'); toast('해독 처치를 받았다.', 'good'); rerender('doctor')(); } } },
              h('strong', null, '해독 처치 · $5'), h('small', null, p.poison > 0 ? '몸에 독이 돌고 있다.' : '중독되지 않았다.')),
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (spend(5)) { p.inv.bandage++; rerender('doctor')(); } } },
              h('strong', null, '붕대 사기 · $5'), h('small', null, `체력 +35 · 보유 ${p.inv.bandage}`)),
            h('button', { class: 'menu-item', type: 'button', onclick: () => { if (spend(7)) { p.inv.antidote++; rerender('doctor')(); } } },
              h('strong', null, '해독제 사기 · $7'), h('small', null, `보유 ${p.inv.antidote}`))),
        );
      },
      stable: (body) => {
        body.append(
          h('p', { class: 'lead' }, '건초 냄새가 진동한다. 마구간지기 루이스가 말 갈기를 빗기고 있다.'), moneyLine(),
          h('div', { class: 'menu-list' },
            h('button', { class: 'menu-item', type: 'button', disabled: p.horse, onclick: () => { if (spend(150)) { p.horse = true; p.mounted = true; toast('갈색 말 “선더”가 생겼다! R 키나 [타기] 버튼으로 타고 내린다.', 'good'); rerender('stable')(); } } },
              h('strong', null, p.horse ? '말 · 보유 중' : '말 · $150'), h('small', null, '사막에서 이동 속도가 크게 빨라지고 짐 +12kg.')),
            h('button', { class: 'menu-item', type: 'button', disabled: p.mule, onclick: () => { if (spend(90)) { p.mule = true; toast('짐 노새 “버터컵”이 졸졸 따라온다. 짐 +40kg!', 'good'); rerender('stable')(); } } },
              h('strong', null, p.mule ? '노새 · 보유 중' : '노새 · $90'), h('small', null, '광석을 훨씬 많이 실을 수 있다. 짐 +40kg.'))),
          h('p', { class: 'hint' }, `현재 짐 한도 ${Game.capacity()}kg`),
        );
      },
      sheriff: (body) => {
        const q = G.quest;
        if (!G.flags.sheriffMet) {
          G.flags.sheriffMet = true;
          body.append(h('div', { class: 'note' }, '보안관 그레이디가 커피를 따른다. “전설의 광맥 얘기를 듣고 왔나? 삼십 년 전 늙은 에즈라가 협곡 어딘가에서 엄청난 금맥을 찾았지. 그는 지도를 세 조각으로 찢어 숨기고 죽었네. 하나는 어느 광산 밑바닥에, 하나는 산적 놈들이, 마지막 하나는… 유령이 지킨다더군. 살롱의 오티스한테 물어보게.”'));
        }
        const bounty = (q.banditKills - q.banditPaid) * 12;
        const list = h('div', { class: 'menu-list' });
        if (q.boss === 'none') {
          list.append(h('button', { class: 'menu-item', type: 'button', onclick: () => {
            q.boss = 'active';
            G.waypoint = { x: G.world.hideout.x + 0.5, y: G.world.hideout.y + 1.5, label: '산적 은신처' };
            toast('현상수배를 받아들였다. 은신처가 지도에 표시됐다.', 'good'); rerender('sheriff')();
          } }, h('strong', null, '현상수배: 붉은 스카프 맥 · $300'), h('small', null, '역마차 강도 두목. 지도 조각 하나를 갖고 있다는 소문이다.')));
        } else if (q.boss === 'active') {
          list.append(h('button', { class: 'menu-item', type: 'button', onclick: () => {
            G.waypoint = { x: G.world.hideout.x + 0.5, y: G.world.hideout.y + 1.5, label: '산적 은신처' };
            toast('은신처로 가는 길을 표시했다.', 'info'); close();
          } }, h('strong', null, '은신처 위치 다시 듣기'), h('small', null, '“그놈 부하도 여럿이야. 총알을 넉넉히 챙기게.”')));
        } else if (q.boss === 'killed') {
          list.append(h('button', { class: 'menu-item gold', type: 'button', onclick: () => {
            q.boss = 'done'; p.money += 300; Sfx.play('coin'); toast('현상금 $300을 받았다!', 'good'); Game.save(); rerender('sheriff')();
          } }, h('strong', null, '현상금 받기 · $300'), h('small', null, '“해냈군! 이 동네가 한결 조용해지겠어.”')));
        } else {
          list.append(h('div', { class: 'menu-item done' }, h('strong', null, '붉은 스카프 맥 · 해결'), h('small', null, '“자네 덕분에 역마차가 다시 다니네.”')));
        }
        list.append(h('button', { class: 'menu-item', type: 'button', disabled: bounty <= 0, onclick: () => {
          p.money += bounty; q.banditPaid = q.banditKills; Sfx.play('coin'); toast(`산적 현상금 ${U.fmtMoney(bounty)}을 받았다.`, 'good'); rerender('sheriff')();
        } }, h('strong', null, `산적 현상금 · 한 명당 $12`), h('small', null, bounty > 0 ? `받을 돈 ${U.fmtMoney(bounty)} (${q.banditKills - q.banditPaid}명)` : '아직 받을 현상금이 없다.')));
        body.append(list);
      },
    }[id];
    open('b_' + id, b.name, build);
  }

  function rumor(body) {
    const p = G.player, w = G.world;
    const A = w.mines[w.fragMines.A], C = w.mines[w.fragMines.C];
    let text;
    if (!p.frags.A && !G.rumored.includes(A.id)) {
      text = `“늙은 광부 하나가 그러더군. ${A.name} 맨 아래층에 뭔가를 묻어 뒀다고.” (지도에 표시됨)`;
      Game.markRumor(A.id);
    } else if (G.quest.boss === 'none') {
      text = '“보안관이 붉은 스카프 맥한테 큰 현상금을 걸었다던데. 그놈이 지도 조각을 갖고 있다는 얘기도 있고.”';
    } else if (!p.frags.C && !G.rumored.includes(C.id)) {
      text = `“${C.name}에는 밤마다 죽은 광부가 돌아다닌대. 그 깊은 곳에 마지막 조각이 있다나.” (지도에 표시됨)`;
      Game.markRumor(C.id);
    } else if (Math.random() < 0.35) {
      const rich = w.mines.filter((m) => !G.rumored.includes(m.id) && m.rich > 1.0);
      if (rich.length) {
        const m = rich[Math.floor(Math.random() * rich.length)];
        Game.markRumor(m.id);
        text = `“${m.name} 말이야, 금맥이 두툼하다더군. 지하 ${m.depth}층까지 있다지.” (지도에 표시됨)`;
      }
    }
    if (!text) text = '“' + TIPS[(G.rumorStep++) % TIPS.length] + '”';
    const box = body.querySelector('#rumor-box');
    if (box) { box.innerHTML = ''; box.append(h('div', { class: 'note rumor' }, text)); }
    const purse = body.querySelector('.purse strong');
    if (purse) purse.textContent = U.fmtMoney(p.money);
  }

  function sleep() {
    const p = G.player;
    close();
    fade(() => {
      const mins = ((7 * 60 - G.time) + 1440) % 1440 || 1440;
      Game.advanceTime(mins);
      p.hp = p.maxHp; p.hunger = Math.max(10, p.hunger - 15); p.thirst = Math.max(10, p.thirst - 15);
      Game.save();
      toast('푹 자고 일어났다. 체력이 모두 회복됐다. (저장됨)', 'good');
    });
  }

  /* ───────── 가방 ───────── */
  function goalText() {
    const p = G.player, w = G.world;
    if (p.heart) return '황금 심장을 더스트우드의 금 분석소로 가져가자!';
    if (G.lostRevealed) return '지도에 표시된 전설의 광맥으로 가서 맨 아래층의 황금 심장을 찾자. 다이너마이트를 꼭 챙길 것.';
    const A = w.mines[w.fragMines.A], C = w.mines[w.fragMines.C];
    const lines = [];
    lines.push(p.frags.A ? '첫 번째 조각: 획득' : G.rumored.includes(A.id) ? `첫 번째 조각: ${A.name} 최하층 (지하 ${A.depth}층)` : '첫 번째 조각: 살롱에서 소문을 들어 보자.');
    lines.push(p.frags.B ? '두 번째 조각: 획득' : G.quest.boss === 'none' ? '두 번째 조각: 보안관을 찾아가 보자.' : '두 번째 조각: 산적 두목 붉은 스카프 맥이 갖고 있다.');
    lines.push(p.frags.C ? '세 번째 조각: 획득' : G.rumored.includes(C.id) ? `세 번째 조각: ${C.name} 최하층 (유령 주의)` : '세 번째 조각: 아직 단서가 없다.');
    return lines;
  }
  function openBag() {
    const p = G.player;
    open('bag', '가방', (body) => {
      const item = (name, val, act, label) => h('div', { class: 'inv' },
        h('span', null, name), h('strong', null, String(val)),
        act ? h('button', { class: 'btn small', type: 'button', onclick: () => { act(); openBag(); } }, label) : null);
      const goal = goalText();
      body.append(
        h('div', { class: 'label' }, '목표'),
        h('div', { class: 'goal' }, Array.isArray(goal) ? goal.map((g) => h('div', null, g)) : goal),
        h('div', { class: 'frags' }, ['A', 'B', 'C'].map((k, i) => h('div', { class: 'frag' + (p.frags[k] ? ' on' : '') }, `조각 ${i + 1}`))),
        h('div', { class: 'label' }, '소지품'),
        h('div', { class: 'inv-grid' },
          item('식량', p.inv.food, () => Game.eat(false), '먹기'),
          item('물', `${p.inv.water}/${p.inv.waterMax}`, () => Game.drink(false), '마시기'),
          item('붕대', p.inv.bandage, Game.useBandage, '쓰기'),
          item('해독제', p.inv.antidote, Game.useAntidote, '쓰기'),
          item('총알', p.inv.ammo), item('다이너마이트', p.inv.dynamite), item('버팀목', p.inv.timber),
          item('등불 기름', Math.round(p.inv.oil) + '/100')),
        h('div', { class: 'label' }, '캐낸 금'),
        h('div', { class: 'inv-grid' },
          item('금광석', `${U.fmtKg(p.ore)} / ${Game.capacity()}kg`),
          item('금덩이', `${p.nuggets.length}개`),
          item('사금', `${p.dust}줌`),
          item('예금', U.fmtMoney(p.bank))),
        h('div', { class: 'label' }, '장비'),
        h('div', { class: 'tags' },
          h('span', { class: 'tag' }, p.inv.pick >= 2 ? '강철 곡괭이' : '낡은 곡괭이'),
          h('span', { class: 'tag' }, p.inv.lantern >= 2 ? '반사경 등불' : '등불'),
          h('span', { class: 'tag' }, '리볼버'),
          p.inv.pan ? h('span', { class: 'tag' }, '사금 접시') : null,
          p.inv.bedroll ? h('span', { class: 'tag' }, '침낭') : null,
          p.horse ? h('span', { class: 'tag' }, '말 선더') : null,
          p.mule ? h('span', { class: 'tag' }, '노새 버터컵') : null),
        h('div', { class: 'label' }, '기록'),
        h('p', { class: 'hint' }, `${G.day}일째 · 캐낸 광석 ${U.fmtKg(G.stats.oreMined)} · 번 돈 ${U.fmtMoney(G.stats.earned)} · 물리친 적 ${G.stats.kills} · 가장 깊이 지하 ${G.stats.deepest}층`),
      );
    });
  }

  /* ───────── 지도 ───────── */
  const MAP_COL = {
    [GT.SAND]: [214, 181, 124], [GT.DIRT]: [176, 136, 86], [GT.GRASS]: [163, 154, 88], [GT.ROCKY]: [154, 132, 102],
    [GT.MOUNTAIN]: [107, 72, 48], [GT.WATER]: [61, 124, 192], [GT.TOWN]: [138, 90, 50], [GT.ROAD]: [201, 164, 110],
  };
  let mapImg = null;
  function openMap() {
    open('map', G.scene === 'mine' ? '광산 지도' : '협곡 지도', (body) => {
      const cvs = h('canvas', { class: 'mapc', 'aria-label': '지도' });
      const info = h('div', { class: 'map-info' }, G.scene === 'mine' ? '지나온 갱도만 표시된다.' : '표시를 누르면 그곳으로 가는 화살표가 생긴다.');
      body.append(cvs);
      body.append(info);
      if (G.scene === 'world') {
        body.append(h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onclick: () => { G.waypoint = { x: G.world.town.cx, y: G.world.town.cy, label: '더스트우드' }; close(); } }, '마을로 안내'),
          h('button', { class: 'btn small', type: 'button', onclick: () => { G.waypoint = null; drawMap(cvs); info.textContent = '안내를 껐다.'; } }, '안내 끄기')),
          h('div', { class: 'legend' },
            h('span', { class: 'lg mine' }, '광산'), h('span', { class: 'lg visited' }, '들어가 본 광산'), h('span', { class: 'lg rumor' }, '소문'),
            h('span', { class: 'lg camp' }, '야영지'), h('span', { class: 'lg you' }, '나')));
      }
      requestAnimationFrame(() => {
        drawMap(cvs);
        cvs.addEventListener('pointerdown', (e) => mapTap(e, cvs, info));
      });
    }, { cls: 'wide' });
  }
  function mapMarkers() {
    const w = G.world, list = [];
    list.push({ x: w.town.cx, y: w.town.cy, label: '더스트우드', type: 'town' });
    for (const m of w.mines) {
      const known = G.known.includes(m.id), rum = G.rumored.includes(m.id);
      if (!known && !rum) continue;
      list.push({ x: m.x + 0.5, y: m.y + 1.5, label: m.name + (G.visited.includes(m.id) ? ' (탐사함)' : '') + ` · 지하 ${m.depth}층`, type: rum && !G.visited.includes(m.id) ? 'rumor' : G.visited.includes(m.id) ? 'visited' : 'mine' });
    }
    for (const c of w.camps) if (G.explored[c.y * w.W + c.x]) list.push({ x: c.x + 0.5, y: c.y + 1.5, label: G.campsOpened.includes(c.id) ? '버려진 야영지 (뒤짐)' : '버려진 야영지', type: 'camp' });
    if (G.quest.boss === 'active' || G.quest.boss === 'killed') list.push({ x: w.hideout.x + 0.5, y: w.hideout.y + 1.5, label: '산적 은신처', type: 'hideout' });
    if (G.lostRevealed) list.push({ x: w.lost.x + 0.5, y: w.lost.y + 1.5, label: '전설의 광맥', type: 'lost' });
    return list;
  }
  function drawMap(cvs) {
    const box = cvs.parentElement.getBoundingClientRect();
    const size = Math.max(200, Math.min(box.width, window.innerHeight * 0.62, 640));
    const d = Math.min(window.devicePixelRatio || 1, 2);
    cvs.width = size * d; cvs.height = size * d;
    cvs.style.width = size + 'px'; cvs.style.height = size + 'px';
    const g = cvs.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (G.scene === 'mine') {
      const L = G.level;
      const img = g.createImageData(L.W, L.H);
      for (let i = 0; i < L.W * L.H; i++) {
        let c = [20, 14, 10];
        if (L.seen[i]) {
          const t = L.tiles[i];
          if (!MT_SOLID.has(t)) c = t === MT.DOWN ? [230, 120, 60] : t === MT.EXIT || t === MT.UP ? [250, 220, 140] : t === MT.PUDDLE ? [70, 120, 170] : [150, 120, 90];
          else if (t === MT.GOLD || t === MT.RICH) c = [230, 180, 50];
          else if (t === MT.CHEST || t === MT.FCHEST) c = [220, 80, 60];
          else c = [70, 56, 46];
        }
        img.data.set([...c, 255], i * 4);
      }
      const tmp = document.createElement('canvas'); tmp.width = L.W; tmp.height = L.H; tmp.getContext('2d').putImageData(img, 0, 0);
      g.drawImage(tmp, 0, 0, cvs.width, cvs.height);
      const s = cvs.width / L.W;
      g.fillStyle = '#ff5a4a';
      g.beginPath(); g.arc(G.player.x * s, G.player.y * s, Math.max(3 * d, s * 0.6), 0, Math.PI * 2); g.fill();
      cvs.dataset.scale = String(s);
      return;
    }
    const w = G.world;
    if (!mapImg || mapImg.width !== w.W) { mapImg = document.createElement('canvas'); mapImg.width = w.W; mapImg.height = w.H; }
    const mg = mapImg.getContext('2d');
    const img = mg.createImageData(w.W, w.H);
    for (let i = 0; i < w.W * w.H; i++) {
      let c;
      if (G.explored[i]) {
        c = MAP_COL[w.ground[i]];
        if (w.obj[i] === OT.BUILDING) c = [90, 56, 30];
      } else {
        const n = U.hash2(i % w.W, (i / w.W) | 0, 3) * 10;
        c = [46 + n, 36 + n, 26 + n];
      }
      img.data[i * 4] = c[0]; img.data[i * 4 + 1] = c[1]; img.data[i * 4 + 2] = c[2]; img.data[i * 4 + 3] = 255;
    }
    mg.putImageData(img, 0, 0);
    g.drawImage(mapImg, 0, 0, cvs.width, cvs.height);
    const s = cvs.width / w.W;
    cvs.dataset.scale = String(s);
    const R = Math.max(4 * d, s * 1.3);
    g.font = `${Math.round(11 * d)}px "Gowun Dodum",sans-serif`;
    g.textAlign = 'center';
    for (const m of mapMarkers()) {
      const x = m.x * s, y = m.y * s;
      g.lineWidth = 1.5 * d;
      if (m.type === 'town') {
        g.fillStyle = '#f1e2bf'; g.strokeStyle = '#2a180c';
        g.fillRect(x - R, y - R * 0.7, R * 2, R * 1.4); g.strokeRect(x - R, y - R * 0.7, R * 2, R * 1.4);
        g.fillStyle = '#f1e2bf'; g.fillText('더스트우드', x, y - R * 1.4);
      } else if (m.type === 'lost') {
        g.strokeStyle = '#ff3a2a'; g.lineWidth = 3 * d;
        g.beginPath(); g.moveTo(x - R, y - R); g.lineTo(x + R, y + R); g.moveTo(x + R, y - R); g.lineTo(x - R, y + R); g.stroke();
      } else if (m.type === 'hideout') {
        g.fillStyle = '#c0302a'; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.fillText('☠', x, y + 4 * d);
      } else if (m.type === 'camp') {
        g.fillStyle = '#e8dcc0'; g.beginPath(); g.moveTo(x, y - R); g.lineTo(x + R, y + R * 0.7); g.lineTo(x - R, y + R * 0.7); g.fill();
      } else {
        g.fillStyle = m.type === 'rumor' ? '#ffd34d' : m.type === 'visited' ? '#9a8a7a' : '#e8a040';
        g.strokeStyle = '#1a0e06';
        g.beginPath(); g.arc(x, y - R * 0.4, R * 0.8, 0, Math.PI * 2); g.fill(); g.stroke();
        if (m.type === 'rumor') { g.fillStyle = '#1a0e06'; g.fillText('?', x, y - R * 0.4 + 4 * d); }
      }
    }
    if (G.waypoint) {
      const x = G.waypoint.x * s, y = G.waypoint.y * s;
      g.strokeStyle = '#ffd34d'; g.lineWidth = 2 * d;
      g.beginPath(); g.arc(x, y, R * 1.6, 0, Math.PI * 2); g.stroke();
    }
    const p = G.player;
    g.save(); g.translate(p.x * s, p.y * s); g.rotate(Math.atan2(p.ay, p.ax));
    g.fillStyle = '#ff5a4a'; g.strokeStyle = '#fff'; g.lineWidth = 1.5 * d;
    g.beginPath(); g.moveTo(R * 1.4, 0); g.lineTo(-R, -R); g.lineTo(-R * 0.4, 0); g.lineTo(-R, R); g.closePath(); g.fill(); g.stroke();
    g.restore();
  }
  function mapTap(e, cvs, info) {
    if (G.scene !== 'world') return;
    const r = cvs.getBoundingClientRect();
    const s = (cvs.width / r.width);
    const scale = Number(cvs.dataset.scale);
    const wx = ((e.clientX - r.left) * s) / scale, wy = ((e.clientY - r.top) * s) / scale;
    let best = null, bd = 5;
    for (const m of mapMarkers()) { const d = Math.hypot(m.x - wx, m.y - wy); if (d < bd) { bd = d; best = m; } }
    if (best) G.waypoint = { x: best.x, y: best.y, label: best.label.split(' (')[0].split(' · ')[0] };
    else G.waypoint = { x: wx, y: wy, label: '지정한 곳' };
    Sfx.play('click');
    info.textContent = best ? `안내: ${best.label}` : '지정한 곳으로 안내한다.';
    drawMap(cvs);
  }

  /* ───────── 사금 채취 ───────── */
  let pan = null;
  function openPanning() {
    pan = { round: 0, rounds: 3, pos: 0, dir: 1, speed: 1.1, zone: 0.5, zw: 0.2, got: 0, raf: 0, last: 0, wait: 0 };
    open('pan', '사금 채취', (body) => {
      body.append(
        h('p', { class: 'lead' }, '접시에 모래를 담고 물속에서 살살 흔든다. 막대가 금빛 구간에 왔을 때 흔들기!'),
        h('div', { class: 'pan-bar' }, h('div', { class: 'pan-zone', id: 'pan-zone' }), h('div', { class: 'pan-mark', id: 'pan-mark' })),
        h('div', { class: 'pan-status', id: 'pan-status' }, '1 / 3번째'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary big', type: 'button', id: 'pan-btn', onclick: panAction }, '흔들기!')),
        h('p', { class: 'hint' }, 'PC에서는 Space 키로도 흔들 수 있다. 한 번에 30분이 지난다.'));
      newPanRound();
      pan.last = performance.now();
      const tick = (ts) => {
        if (kind !== 'pan') return;
        const dt = Math.min(0.05, (ts - pan.last) / 1000); pan.last = ts;
        if (pan.wait > 0) pan.wait -= dt;
        else {
          pan.pos += pan.dir * pan.speed * dt;
          if (pan.pos > 1) { pan.pos = 1; pan.dir = -1; } if (pan.pos < 0) { pan.pos = 0; pan.dir = 1; }
        }
        const m = document.getElementById('pan-mark');
        if (m) m.style.left = (pan.pos * 100) + '%';
        pan.raf = requestAnimationFrame(tick);
      };
      pan.raf = requestAnimationFrame(tick);
    }, {
      cls: 'narrow',
      onClose: () => { cancelAnimationFrame(pan && pan.raf); },
    });
  }
  function newPanRound() {
    pan.zw = 0.12 + Math.random() * 0.12;
    pan.zone = 0.15 + Math.random() * (0.7 - pan.zw);
    pan.speed = 0.9 + Math.random() * 0.8 + pan.round * 0.2;
    const z = document.getElementById('pan-zone');
    if (z) { z.style.left = (pan.zone * 100) + '%'; z.style.width = (pan.zw * 100) + '%'; }
  }
  function panAction() {
    if (kind !== 'pan' || !pan || pan.wait > 0) return;
    const st = document.getElementById('pan-status');
    const btn = document.getElementById('pan-btn');
    if (pan.round >= pan.rounds) { close(); return; }
    const center = pan.zone + pan.zw / 2;
    const inZone = pan.pos >= pan.zone && pan.pos <= pan.zone + pan.zw;
    let gain = 0;
    if (inZone) gain = Math.abs(pan.pos - center) < pan.zw * 0.18 ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0);
    pan.got += gain;
    pan.round++;
    Sfx.play(gain ? 'gold' : 'pan');
    Game.advanceTime(10);
    if (st) st.textContent = gain ? `사금 ${gain}줌을 건졌다! (${pan.round}/${pan.rounds})` : `모래뿐이다… (${pan.round}/${pan.rounds})`;
    pan.wait = 0.6;
    if (pan.round >= pan.rounds) {
      G.player.dust += pan.got;
      if (btn) btn.textContent = '그만하기';
      if (st) st.textContent += ` · 모두 ${pan.got}줌`;
      if (pan.got) toast(`사금 ${pan.got}줌을 모았다. 금 분석소에서 팔 수 있다.`, 'good');
    } else newPanRound();
  }

  /* ───────── 메뉴, 도움말, 타이틀 ───────── */
  function openMenu() {
    open('menu', '메뉴', (body) => {
      body.append(h('div', { class: 'menu-list' },
        h('button', { class: 'menu-item', type: 'button', onclick: close }, h('strong', null, '계속하기')),
        h('button', { class: 'menu-item', type: 'button', onclick: () => { const ok = Game.save(); toast(ok ? '저장했다.' : '저장하지 못했다. 브라우저 저장소가 막혀 있을 수 있다.', ok ? 'good' : 'bad'); close(); } }, h('strong', null, '저장하기'), h('small', null, '광산 안에서도 저장된다.')),
        h('button', { class: 'menu-item', type: 'button', onclick: openHelp }, h('strong', null, '도움말'), h('small', null, '조작법과 생존 요령')),
        h('button', { class: 'menu-item', type: 'button', onclick: () => { Sfx.sfxOn = !Sfx.sfxOn; openMenu(); } }, h('strong', null, `효과음 ${Sfx.sfxOn ? '켜짐' : '꺼짐'}`)),
        h('button', { class: 'menu-item', type: 'button', onclick: () => { Sfx.musicOn = !Sfx.musicOn; openMenu(); } }, h('strong', null, `음악 ${Sfx.musicOn ? '켜짐' : '꺼짐'}`)),
        h('button', { class: 'menu-item', type: 'button', onclick: () => { Game.save(); close(); Game.startDemo(); showTitle(); } }, h('strong', null, '타이틀로'), h('small', null, '저장하고 나간다.'))));
    }, { cls: 'narrow' });
  }
  function helpContent() {
    return h('div', { class: 'help' },
      h('div', { class: 'label' }, '목표'),
      h('p', null, '협곡의 광산에서 금을 캐 팔고, 장비를 갖추며 흩어진 지도 조각 세 개를 모으자. 지도가 완성되면 전설의 광맥이 드러난다. 그 바닥의 황금 심장을 마을 금 분석소에 가져가면 승리.'),
      h('div', { class: 'label' }, '조작'),
      h('table', { class: 'keys' },
        h('tr', null, h('th', null, ''), h('th', null, 'PC'), h('th', null, '모바일')),
        h('tr', null, h('td', null, '이동'), h('td', null, 'WASD / 방향키'), h('td', null, '화면 왼쪽을 끌기')),
        h('tr', null, h('td', null, '행동 · 채굴'), h('td', null, 'E / Space (채굴은 누르고 있기)'), h('td', null, '행동 버튼')),
        h('tr', null, h('td', null, '사격'), h('td', null, 'F 또는 마우스 클릭'), h('td', null, '사격 버튼 (자동 조준)')),
        h('tr', null, h('td', null, '다이너마이트'), h('td', null, 'Q 또는 마우스 오른쪽'), h('td', null, '폭약 버튼')),
        h('tr', null, h('td', null, '버팀목'), h('td', null, 'T'), h('td', null, '버팀목 버튼')),
        h('tr', null, h('td', null, '말 타기'), h('td', null, 'R'), h('td', null, '타기 버튼')),
        h('tr', null, h('td', null, '지도 · 가방'), h('td', null, 'M · I'), h('td', null, '오른쪽 위 버튼')),
        h('tr', null, h('td', null, '붕대 · 먹기 · 마시기'), h('td', null, 'H · 1 · 2'), h('td', null, '가방에서'))),
      h('div', { class: 'label' }, '생존 요령'),
      h('ul', null,
        h('li', null, '허기와 갈증이 바닥나면 체력이 줄어든다. 식량과 물은 부족할 때 저절로 먹고 마신다.'),
        h('li', null, '광산 안에서는 등불 기름이 닳는다. 기름이 떨어지면 거의 보이지 않고 유령이 덤빈다.'),
        h('li', null, '땅을 파면 가끔 천장이 흔들린다. 붉은 구역에서 바로 벗어나고, 버팀목을 세워 막자.'),
        h('li', null, '쓰러지면 들고 있던 금과 현금 절반을 잃는다. 번 돈은 은행에 맡기자.')));
  }
  function openHelp() { open('help', '도움말', (b) => b.append(helpContent())); }

  function showTitle() {
    close();
    el.hud.hidden = true; el.touch.hidden = true; el.prompt.hidden = true;
    Sfx.setMusicMode('none');
    const t = el.title;
    t.hidden = false;
    const info = Game.saveInfo();
    const btns = t.querySelector('.title-btns');
    btns.innerHTML = '';
    if (info) {
      btns.append(h('button', { class: 'btn gold big', type: 'button', onclick: () => {
        Sfx.resume();
        if (!Game.continueGame()) { toast('저장 파일을 읽지 못했다.', 'bad'); return; }
        hideTitle();
        toast(`${G.day}일째, 다시 협곡으로.`, 'info');
      } }, h('span', null, '이어하기'), h('small', null, `${info.day}일째 · ${U.fmtMoney(info.money)} · 지도 조각 ${info.frags}/3`)));
    }
    btns.append(h('button', { class: 'btn big' + (info ? '' : ' gold'), type: 'button', onclick: () => {
      Sfx.resume();
      const go = () => { Game.wipeSave(); Game.newGame(); hideTitle(); showIntro(); };
      if (info) confirm('새 게임', '저장된 게임을 지우고 새로 시작할까?', '새로 시작', go);
      else go();
    } }, h('span', null, '새 게임'), h('small', null, '매번 새로운 협곡이 만들어진다')));
    btns.append(h('button', { class: 'btn ghost', type: 'button', onclick: () => { Sfx.resume(); openHelp(); } }, '도움말'));
  }
  function hideTitle() {
    el.title.hidden = true;
    el.hud.hidden = false; el.touch.hidden = false;
    refreshHud(true);
    Game.snapCamera();
  }
  function showIntro() {
    open('intro', '1873년, 더스트우드', (b) => {
      b.append(
        h('div', { class: 'note' }, '삼십 년 전, 늙은 광부 에즈라는 협곡 어딘가에서 사람 머리만 한 금덩이가 박힌 광맥을 찾았다고 했다. 그는 위치를 그린 지도를 세 조각으로 찢어 숨긴 뒤 숨을 거뒀다.'),
        h('div', { class: 'note' }, '당신은 낡은 곡괭이 하나, 리볼버 한 자루, 그리고 단돈 $40을 들고 국경 마을 더스트우드에 막 도착했다.'),
        h('div', { class: 'label' }, '첫걸음'),
        h('ul', { class: 'steps' },
          h('li', null, '우물에서 물통을 채우고, 잡화점에서 기름과 식량을 사자.'),
          h('li', null, '마을 밖 절벽의 광산 입구로 들어가 반짝이는 금맥을 캐자.'),
          h('li', null, '캐낸 광석은 금 분석소에서 판다. 소문은 살롱에서, 의뢰는 보안관에게.')),
        h('div', { class: 'row' }, h('button', { class: 'btn gold big', type: 'button', onclick: close }, '협곡으로')));
    }, { closable: true, cls: 'narrow' });
  }
  function showDeath(info) {
    open('death', '쓰러졌다…', (b) => {
      b.append(
        h('p', { class: 'lead' }, `${info.cause} 때문에 정신을 잃었다. 지나가던 역마차 마부가 당신을 마을 병원으로 옮겨 주었다.`),
        h('table', { class: 'ledger' },
          h('tr', null, h('td', null, '잃어버린 광석'), h('td', null, U.fmtKg(info.lostOre))),
          h('tr', null, h('td', null, '잃어버린 금덩이 · 사금'), h('td', null, `${info.lostNug}개 · ${info.lostDust}줌`)),
          h('tr', null, h('td', null, '흘린 현금'), h('td', null, U.fmtMoney(info.lostCash))),
          h('tr', null, h('td', null, '치료비'), h('td', null, U.fmtMoney(info.fee)))),
        h('p', { class: 'hint' }, '은행 예금과 지도 조각, 장비는 그대로다.'),
        h('div', { class: 'row' }, h('button', { class: 'btn primary big', type: 'button', onclick: close }, '다시 일어서기')));
    }, { closable: false, cls: 'narrow' });
  }
  function victory() {
    const p = G.player;
    p.heart = false;
    p.money += 5000; G.stats.earned += 5000;
    G.flags.won = true;
    Sfx.play('win');
    Game.save();
    open('win', '전설을 손에 넣다', (b) => {
      b.append(
        h('div', { class: 'win-hero' }, h('strong', null, '$5,000'), h('span', null, '황금 심장 감정가')),
        h('p', { class: 'lead' }, '더스트우드 사람들이 모두 거리로 쏟아져 나왔다. 늙은 에즈라의 전설은 이제 당신의 이야기가 됐다.'),
        h('table', { class: 'ledger' },
          h('tr', null, h('td', null, '걸린 날'), h('td', null, `${G.day}일`)),
          h('tr', null, h('td', null, '캐낸 광석'), h('td', null, U.fmtKg(G.stats.oreMined))),
          h('tr', null, h('td', null, '번 돈'), h('td', null, U.fmtMoney(G.stats.earned))),
          h('tr', null, h('td', null, '전 재산'), h('td', null, U.fmtMoney(p.money + p.bank))),
          h('tr', null, h('td', null, '물리친 적'), h('td', null, String(G.stats.kills))),
          h('tr', null, h('td', null, '쓰러진 횟수'), h('td', null, String(G.stats.deaths)))),
        h('div', { class: 'row' },
          h('button', { class: 'btn gold', type: 'button', onclick: close }, '계속 탐험하기'),
          h('button', { class: 'btn', type: 'button', onclick: () => { close(); Game.startDemo(); showTitle(); } }, '타이틀로')));
    }, { closable: false, cls: 'narrow' });
  }

  return {
    init, refreshHud, toast, banner, fade, open, close, note,
    tryClose: () => { if (closable) close(); }, confirm, openBuilding, openBag, openMap, openMenu, openHelp,
    openPanning, showTitle, hideTitle, showIntro, showDeath,
    isOpen: () => !!kind || !el.title.hidden,
    current: () => kind,
  };
})();
