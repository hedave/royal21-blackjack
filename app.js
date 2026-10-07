'use strict';
(() => {
const $ = id => document.getElementById(id);
const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const DECKS = 6, KEY = 'royal21.v1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let S = load();
let shoe = [], cut = 0, dealer = [], hands = [], act = 0, bet = 0, lastBet = 0, phase = 'bet', insBet = 0;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s.bank === 'number') return s; } catch (e) {}
  return { bank: 1000, sound: true, hands: 0, wins: 0, losses: 0, pushes: 0, bj: 0, biggest: 0, peak: 1000 };
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

// ---- audio ----
let ac = null;
function tone(f, d = .08, type = 'triangle', v = .15, delay = 0) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d + .02);
  } catch (e) {}
}
const sfx = {
  card: () => tone(900, .05, 'square', .05), chip: () => { tone(1800, .04, 'sine', .1); tone(2400, .04, 'sine', .07, .03); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .15, 'triangle', .15, i * .09)),
  lose: () => [330, 262].forEach((f, i) => tone(f, .2, 'sawtooth', .07, i * .15)),
  bj: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .18, 'square', .08, i * .07)),
};

// ---- shoe ----
function newShoe() {
  shoe = [];
  for (let d = 0; d < DECKS; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s });
  for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
  cut = Math.floor(shoe.length * .25);
}
const draw = () => { if (!shoe.length) newShoe(); return shoe.pop(); };
const val = c => c.r === 'A' ? 11 : 'JQK'.includes(c.r) ? 10 : +c.r;
function score(cards) {
  let t = 0, a = 0;
  for (const c of cards) { if (c.down) continue; t += val(c); if (c.r === 'A') a++; }
  while (t > 21 && a) { t -= 10; a--; }
  return { t, soft: a > 0 };
}
const isBJ = h => h.length === 2 && score(h).t === 21;

// ---- render ----
function cardEl(c, flip) {
  const e = document.createElement('div'), red = c.s === '♥' || c.s === '♦';
  e.className = 'card' + (red ? ' red' : '') + (c.down ? ' back' : '') + (flip ? ' flip' : '');
  e.innerHTML = `<div class="tl">${c.r}<br>${c.s}</div><div class="ct">${c.s}</div><div class="br">${c.r}<br>${c.s}</div>`;
  return e;
}
function syncHand(el, cards) {
  // only append new cards so existing ones don't re-animate
  while (el.children.length > cards.length) el.lastChild.remove();
  cards.forEach((c, i) => {
    const ex = el.children[i];
    if (!ex) el.appendChild(cardEl(c));
    else if (ex.classList.contains('back') !== !!c.down) el.replaceChild(cardEl(c, true), ex);
  });
}
function totText(cards) {
  if (!cards.length) return '';
  const { t, soft } = score(cards);
  if (isBJ(cards) && !cards.some(c => c.down)) return 'BJ';
  return soft && t < 21 ? `${t - 10}/${t}` : t;
}
function render() {
  $('bank').textContent = S.bank.toLocaleString();
  $('bet').textContent = bet;
  $('shoeCt').textContent = shoe.length;
  syncHand($('dealer'), dealer);
  $('dTot').textContent = totText(dealer);
  const H = $('hands');
  while (H.children.length > Math.max(hands.length, 0)) H.lastChild.remove();
  hands.forEach((h, i) => {
    let w = H.children[i];
    if (!w) { w = document.createElement('div'); w.className = 'phand'; w.innerHTML = '<div class="hand"></div><div class="info"></div>'; H.appendChild(w); }
    w.classList.toggle('active', phase === 'play' && i === act && hands.length > 1);
    syncHand(w.firstChild, h.cards);
    const r = h.res ? `<span class="res ${h.res.c}">${h.res.t}</span>` : '';
    w.lastChild.innerHTML = `<span class="tot">${totText(h.cards)}</span> · ${h.bet}${r}`;
  });
  $('betBar').classList.toggle('hidden', phase !== 'bet');
  $('actBar').classList.toggle('hidden', phase !== 'play');
  $('insBar').classList.toggle('hidden', phase !== 'ins');
  document.querySelectorAll('.chip').forEach(c => c.disabled = phase !== 'bet' || +c.dataset.v > S.bank - bet);
  $('deal').disabled = bet <= 0 || bet > S.bank;
  $('rebet').disabled = !lastBet || lastBet > S.bank;
  $('snd').textContent = S.sound ? '🔊' : '🔇';
  if (phase === 'play') {
    const h = hands[act];
    $('dbl').disabled = !canDouble(h);
    $('split').disabled = !canSplit(h);
  }
}
function msg(t, pop) { const m = $('msg'); m.textContent = t; if (pop) { m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop'); } }

// ---- rules ----
const committed = () => hands.reduce((a, h) => a + h.bet, 0) + insBet;
const canDouble = h => h && h.cards.length === 2 && !h.splitAce && S.bank - committed() >= h.bet;
const canSplit = h => h && h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1]) && hands.length < 4 && !h.splitAce && S.bank - committed() >= h.bet;

async function dealTo(cards, down) { const c = draw(); if (down) c.down = true; cards.push(c); sfx.card(); render(); await sleep(330); }

async function deal() {
  if (phase !== 'bet' || bet <= 0 || bet > S.bank) return;
  if (shoe.length < cut || shoe.length < 20) { newShoe(); msg('Shuffling new shoe…', true); await sleep(600); }
  lastBet = bet; phase = 'dealing'; insBet = 0; $('hint').classList.add('hidden');
  dealer = []; hands = [{ cards: [], bet, res: null }]; act = 0; $('dealer').innerHTML = ''; $('hands').innerHTML = '';
  msg(''); render();
  await dealTo(hands[0].cards); await dealTo(dealer); await dealTo(hands[0].cards); await dealTo(dealer, true);
  if (dealer[0].r === 'A' && S.bank - bet >= Math.floor(bet / 2) && Math.floor(bet / 2) > 0) {
    phase = 'ins'; msg('Dealer shows an Ace'); render(); return;
  }
  await afterIns();
}
async function insurance(take) {
  if (phase !== 'ins') return;
  if (take) { insBet = Math.floor(bet / 2); sfx.chip(); }
  phase = 'dealing'; render(); await afterIns();
}
async function afterIns() {
  const dTen = ['A','10','J','Q','K'].includes(dealer[0].r);
  const dBJ = dTen && val(dealer[0]) + val(dealer[1]) === 21;
  if (insBet) { if (dBJ) { S.bank += insBet * 2; msg('Insurance pays 2:1', true); } else { S.bank -= insBet; msg('Insurance lost'); } insBet = 0; render(); await sleep(700); }
  if (dBJ) { dealer[1].down = false; render(); await sleep(400); return settle(); }
  if (isBJ(hands[0].cards)) { dealer[1].down = false; render(); await sleep(400); return settle(); }
  phase = 'play'; msg(''); render();
}
async function hit() {
  if (phase !== 'play') return; phase = 'busy';
  const h = hands[act]; await dealTo(h.cards);
  phase = 'play';
  if (score(h.cards).t >= 21) return next(); render();
}
function stand() { if (phase === 'play') next(); }
async function dbl() {
  const h = hands[act]; if (phase !== 'play' || !canDouble(h)) return; phase = 'busy';
  h.bet *= 2; h.doubled = true; sfx.chip(); await dealTo(h.cards); phase = 'play'; next();
}
async function split() {
  const h = hands[act]; if (phase !== 'play' || !canSplit(h)) return; phase = 'busy';
  sfx.chip();
  const nh = { cards: [h.cards.pop()], bet: h.bet, res: null };
  const aces = h.cards[0].r === 'A'; h.splitAce = nh.splitAce = aces; h.split = nh.split = true;
  hands.splice(act + 1, 0, nh); $('hands').innerHTML = ''; render();
  await dealTo(h.cards);
  if (aces) { await dealTo(nh.cards); phase = 'play'; act = hands.length - 1; return next(); }
  phase = 'play'; if (score(h.cards).t === 21) return next(); render();
}
async function next() {
  $('hint').classList.add('hidden');
  while (act < hands.length - 1) {
    act++; const h = hands[act];
    if (h.cards.length === 1) { phase = 'busy'; render(); await dealTo(h.cards); phase = 'play'; }
    if (h.splitAce || score(h.cards).t >= 21) continue;
    render(); return;
  }
  phase = 'dealer'; render(); await dealerPlay();
}
async function dealerPlay() {
  dealer[1].down = false; sfx.card(); render(); await sleep(500);
  const live = hands.some(h => score(h.cards).t <= 21);
  if (live) {
    for (;;) { const { t, soft } = score(dealer); if (t < 17 || (t === 17 && soft)) await dealTo(dealer); else break; } // H17
  }
  settle();
}
function settle() {
  const d = score(dealer).t, dBJ = isBJ(dealer);
  let net = 0;
  for (const h of hands) {
    const p = score(h.cards).t, pBJ = isBJ(h.cards) && !h.split;
    let w;
    if (pBJ && !dBJ) { w = h.bet * 1.5; h.res = { t: 'BLACKJACK', c: 'win' }; S.bj++; }
    else if (p > 21) { w = -h.bet; h.res = { t: 'BUST', c: 'lose' }; }
    else if (dBJ && !pBJ) { w = -h.bet; h.res = { t: 'LOSE', c: 'lose' }; }
    else if (pBJ && dBJ) { w = 0; h.res = { t: 'PUSH', c: 'push' }; }
    else if (d > 21 || p > d) { w = h.bet; h.res = { t: 'WIN', c: 'win' }; }
    else if (p < d) { w = -h.bet; h.res = { t: 'LOSE', c: 'lose' }; }
    else { w = 0; h.res = { t: 'PUSH', c: 'push' }; }
    w = Math.floor(w); net += w; S.hands++;
    if (w > 0) S.wins++; else if (w < 0) S.losses++; else S.pushes++;
  }
  S.bank += net; S.biggest = Math.max(S.biggest, net); S.peak = Math.max(S.peak, S.bank);
  if (net > 0) { msg(`You win +${net}!`, true); hands.some(h => h.res.t === 'BLACKJACK') ? sfx.bj() : sfx.win(); }
  else if (net < 0) { msg(`${d > 21 ? 'Dealer busts but…' : dBJ ? 'Dealer Blackjack' : 'Dealer wins'} ${net}`, true); sfx.lose(); }
  else msg('Push', true);
  if (S.bank < 5) { S.bank = 1000; setTimeout(() => msg('Broke! House spots you 1,000 🎁', true), 1600); }
  phase = 'bet'; bet = Math.min(lastBet, S.bank); save(); render();
}

// ---- basic strategy (6D, H17, DAS, no surrender) ----
function strategy(h) {
  const up = val(dealer[0]), { t, soft } = score(h.cards), two = h.cards.length === 2;
  const D = canDouble(h);
  if (canSplit(h)) {
    const r = val(h.cards[0]);
    const sp = { 11: true, 8: true, 9: ![7, 10, 11].includes(up), 7: up <= 7, 6: up <= 6, 4: up === 5 || up === 6, 3: up <= 7, 2: up <= 7 }[r];
    if (sp) return 'Split';
  }
  if (soft && t <= 21 && two || soft) {
    if (t >= 20) return 'Stand';
    if (t === 19) return up === 6 && D ? 'Double' : 'Stand';
    if (t === 18) { if (up <= 6 && up >= 2) return D ? 'Double' : 'Stand'; return up <= 8 ? 'Stand' : 'Hit'; }
    if (t === 17) return up >= 3 && up <= 6 && D ? 'Double' : 'Hit';
    if (t >= 15) return up >= 4 && up <= 6 && D ? 'Double' : 'Hit';
    return up >= 5 && up <= 6 && D ? 'Double' : 'Hit';
  }
  if (t >= 17) return 'Stand';
  if (t >= 13) return up <= 6 ? 'Stand' : 'Hit';
  if (t === 12) return up >= 4 && up <= 6 ? 'Stand' : 'Hit';
  if (t === 11) return D ? 'Double' : 'Hit';
  if (t === 10) return up <= 9 && D ? 'Double' : 'Hit';
  if (t === 9) return up >= 3 && up <= 6 && D ? 'Double' : 'Hit';
  return 'Hit';
}
function hint() {
  if (phase !== 'play') return;
  const e = $('hint'); e.textContent = '💡 Basic strategy: ' + strategy(hands[act]); e.classList.remove('hidden');
}
function showStats() {
  const wr = S.hands ? (S.wins / S.hands * 100).toFixed(1) : '0.0';
  const rows = [['Hands played', S.hands], ['Win rate', wr + '%'], ['Wins / Losses / Pushes', `${S.wins} / ${S.losses} / ${S.pushes}`],
    ['Blackjacks', S.bj], ['Biggest win', '+' + S.biggest], ['Peak bankroll', S.peak], ['Bankroll', S.bank]];
  $('statBody').innerHTML = rows.map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('');
  $('stats').classList.remove('hidden');
}

// ---- wiring ----
const on = (id, fn) => $(id).addEventListener('click', fn);
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  const v = +c.dataset.v; if (phase === 'bet' && bet + v <= S.bank) { bet += v; sfx.chip(); render(); }
}));
on('clear', () => { if (phase === 'bet') { bet = 0; render(); } });
on('rebet', () => { if (phase === 'bet' && lastBet <= S.bank) { bet = lastBet; sfx.chip(); render(); } });
on('deal', deal); on('hit', hit); on('stand', stand); on('dbl', dbl); on('split', split); on('hintBtn', hint);
on('insY', () => insurance(true)); on('insN', () => insurance(false));
on('snd', () => { S.sound = !S.sound; save(); render(); });
on('statsBtn', showStats); on('closeStats', () => $('stats').classList.add('hidden'));
on('reset', () => { if (confirm('Reset bankroll to 1,000 and clear stats?')) { const snd = S.sound; localStorage.removeItem(KEY); S = load(); S.sound = snd; save(); bet = lastBet = 0; showStats(); render(); } });
$('stats').addEventListener('click', e => { if (e.target.id === 'stats') $('stats').classList.add('hidden'); });
newShoe(); render();
window.__bj = { get phase() { return phase; }, get hands() { return hands; }, get dealer() { return dealer; }, get S() { return S; }, strategy: () => strategy(hands[act]) };
})();
