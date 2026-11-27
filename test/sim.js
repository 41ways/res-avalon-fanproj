// 가짜 소켓으로 방을 만들고 판을 끝까지 여러 번 돌린다. 비밀이 새지 않는지도 본다.
//   node test/sim.js [판 수]
process.env.RA_FAST = '1';
const { handle, rooms } = await import('../src/hub.js');
const { SIDE } = await import('../src/engine.js');

const GAMES = +process.argv[2] || 300;
let ok = 0, fail = 0;
const assert = (c, m) => { if (!c) { fail++; console.error('✗', m); throw new Error(m); } };

class Fake {
  constructor(name) { this.name = name; this.readyState = 1; this.inbox = []; this.state = null; }
  send(t) { const m = JSON.parse(t); this.inbox.push(m); if (m.t === 'state') this.state = m; if (m.t === 'welcome') this.me = m.you; if (m.t === 'err' && !m.fatal) this.lastErr = m.msg; }
  close() { this.readyState = 3; }
}
const rnd = a => a[Math.floor(Math.random() * a.length)];

const wins = { good: 0, evil: 0 }, reasons = {};
for (let k = 0; k < GAMES; k++) {
  const n = 5 + (k % 6);
  const socks = Array.from({ length: n }, (_, i) => new Fake(`P${i + 1}`));
  handle(socks[0], { t: 'create', name: socks[0].name, theme: k % 2 ? 'bonghwa' : 'knights' });
  const code = socks[0].state.code;
  for (const s of socks.slice(1)) handle(s, { t: 'join', code, name: s.name });
  if (k % 3 === 0) handle(socks[0], { t: 'cfg', lamp: true });
  handle(socks[0], { t: 'start' });
  const room = rooms.get(code), g = room.game;
  assert(g && g.n === n, 'game started');
  const sockOf = seat => socks.find(s => s.me === g.players[seat].id);
  // 비밀 검사: 각자 받은 판에 남의 역할이 없어야 한다(끝·지목 전)
  for (const s of socks) {
    const v = s.state.g;
    v.seats.forEach((x, i) => assert(i === v.me ? x.role === g.players[i].role : x.role === null, 'role leak at start'));
  }
  let guard = 0;
  while (g.step !== 'end' && guard++ < 500) {
    const st = g.step;
    if (st === 'reveal') socks.forEach(s => handle(s, { t: 'act', r: { a: 'seen' } }));
    else if (st === 'team') {
      const L = sockOf(g.leader);
      const pool = [...Array(n).keys()].sort(() => Math.random() - .5).slice(0, g.need());
      pool.forEach(i => handle(L, { t: 'act', r: { a: 'pick', i } }));
      handle(L, { t: 'act', r: { a: 'propose' } });
    } else if (st === 'vote') {
      const order = socks.slice().sort(() => Math.random() - .5);
      order.forEach((s, j) => {
        handle(s, { t: 'act', r: { a: 'vote', v: Math.random() < .62 } });
        if (j < order.length - 1) for (const o of socks) { const v = o.state.g; assert(v.history.length === g.history.length || v.step === 'vote', 'vote leak'); }
      });
    } else if (st === 'voteResult') handle(sockOf(g.leader), { t: 'act', r: { a: 'next' } });
    else if (st === 'mission') {
      for (const i of g.team) {
        const s = sockOf(i), evil = SIDE[g.players[i].role] === 'evil';
        if (!evil) { handle(s, { t: 'act', r: { a: 'card', v: 'fail' } }); assert(s.lastErr, 'good could fail'); s.lastErr = null; }
        handle(s, { t: 'act', r: { a: 'card', v: evil && Math.random() < .6 ? 'fail' : 'ok' } });
      }
    } else if (st === 'missionReveal') handle(rnd([sockOf(g.leader), socks[0]]), { t: 'act', r: { a: 'next' } });
    else if (st === 'lamp') {
      const L = g.lamp, s = sockOf(L.holder);
      const cand = [...Array(n).keys()].filter(i => i !== L.holder && !L.past.includes(i));
      const t = rnd(cand);
      handle(s, { t: 'act', r: { a: 'pick', i: t } });
      assert(s.state.g.lampSeen.some(x => x.seat === t && x.side === SIDE[g.players[t].role]), 'lamp result to holder');
      for (const o of socks) if (o !== s) assert(!o.state.g.lampSeen.some(x => x.seat === t && x.round === g.round), 'lamp leak');
      handle(s, { t: 'act', r: { a: 'done' } });
    } else if (st === 'assassin') {
      for (const s of socks) s.state.g.seats.forEach((x, i) => { if (SIDE[g.players[i].role] === 'evil') assert(x.role, 'evil unmasked'); else if (i !== s.state.g.me) assert(!x.role, 'good leak at assassin'); });
      const ai = g.players.findIndex(p => p.role === 'assassin'), s = sockOf(ai);
      const goods = [...Array(n).keys()].filter(i => SIDE[g.players[i].role] === 'good');
      handle(s, { t: 'act', r: { a: 'target', i: rnd(goods) } });
      handle(s, { t: 'act', r: { a: 'kill' } });
    }
    if (g.step === st && st !== 'vote') { /* 진행이 안 되면 */ }
  }
  assert(g.step === 'end', `game ended (n=${n}, stuck at ${g.step})`);
  for (const s of socks) assert(s.state.g.seats.every(x => x.role), 'all roles at end');
  wins[g.winner]++; reasons[g.reason] = (reasons[g.reason] || 0) + 1;
  // 다시 하기 → 대기실 → 나가기
  handle(socks[0], { t: 'again' });
  assert(room.phase === 'lobby', 'again → lobby');
  socks.forEach(s => handle(s, { t: 'leave' }));
  assert(!rooms.has(code), 'room dropped');
  ok++;
}
// 목록 · 끊김 · 다시 붙기
{
  const a = new Fake('A'), b = new Fake('B'), w = new Fake('W');
  handle(w, { t: 'rooms' });
  handle(a, { t: 'create', name: '가', title: '시험 방' });
  const code = a.state.code;
  await new Promise(r => setTimeout(r, 10));
  const list = w.inbox.filter(m => m.t === 'rooms').pop();
  assert(list.list.some(x => x.code === code && x.title === '시험 방'), 'room listed');
  handle(b, { t: 'join', code, name: '가' });
  assert(b.state.players.map(p => p.name).join() === '가,가2', 'unique names');
  const tok = b.inbox.find(m => m.t === 'welcome').token;
  const b2 = new Fake('B2');
  handle(b2, { t: 'resume', code, token: tok });
  assert(b2.me === b.me, 'resume same seat');
  handle(a, { t: 'start' });
  assert(a.lastErr, 'need 5 to start');
  ok++;
}
console.log(`ok ${ok}, fail ${fail} · 선 ${wins.good} / 악 ${wins.evil} ·`, reasons);
process.exit(fail ? 1 : 0);
