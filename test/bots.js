// 시험용: 열린 방에 가짜 사람 N명을 앉혀 판을 저절로 진행한다. 화면 한 개로 온라인 판을 확인할 때 쓴다.
//   node test/bots.js <방 코드> [사람 수=4] [주소=ws://localhost:8870/ws] [느리게 ms=900] [악이 실패 낼 확률=0.5]
import WebSocket from 'ws';

const [code, N = 4, url = 'ws://localhost:8870/ws', slow = 900, failP = .5] = process.argv.slice(2);
if (!code) { console.log('node test/bots.js ABCD [4]'); process.exit(1); }
const NAMES = ['도윤', '서연', '하준', '지우', '민서', '예준', '수아', '시우', '하린'];
const pick = a => a[Math.floor(Math.random() * a.length)];
const EVIL = new Set(['spy', 'assassin', 'wisp', 'newmoon', 'wander']);

for (let k = 0; k < +N; k++) {
  const ws = new WebSocket(url);
  let st = null, busyKey = '';
  const send = m => ws.readyState === 1 && ws.send(JSON.stringify(m));
  const act = r => send({ t: 'act', r });
  ws.on('open', () => send({ t: 'join', code: code.toUpperCase(), name: NAMES[k] }));
  ws.on('message', d => {
    const m = JSON.parse(String(d));
    if (m.t === 'err') console.log(NAMES[k], '!', m.msg);
    if (m.t !== 'state' || !m.g) return;
    st = m;
    const g = m.g, me = g.me, mine = g.seats[me], key = `${g.step}|${g.round}|${g.rejects}|${g.history.length}|${g.team.length}|${g.lamp?.pick}|${g.target}`;
    if (key === busyKey) return; busyKey = key;
    setTimeout(() => {
      if (st.g.step !== g.step || st.g.round !== g.round) return;
      switch (g.step) {
        case 'reveal': if (!mine.seen) act({ a: 'seen' }); break;
        case 'team':
          if (g.leader !== me) break;
          if (g.team.length < g.sizes[g.round]) {
            const free = [...Array(g.n).keys()].filter(i => !g.team.includes(i));
            act({ a: 'pick', i: g.team.length === 0 ? me : pick(free) });
          } else act({ a: 'propose' });
          break;
        case 'vote': if (g.myVote == null) act({ a: 'vote', v: Math.random() < .7 }); break;
        case 'voteResult': if (g.leader === me) act({ a: 'next' }); break;
        case 'mission': if (g.team.includes(me) && !g.myCard) act({ a: 'card', v: EVIL.has(mine.role) && Math.random() < +failP ? 'fail' : 'ok' }); break;
        case 'missionReveal': if (g.leader === me) setTimeout(() => act({ a: 'next' }), 9000); break;
        case 'lamp':
          if (g.lamp.holder !== me) break;
          if (g.lamp.pick == null) act({ a: 'pick', i: pick([...Array(g.n).keys()].filter(i => i !== me && !g.lamp.past.includes(i))) });
          else act({ a: 'done' });
          break;
        case 'assassin':
          if (mine.role !== 'assassin') break;
          if (g.target == null) act({ a: 'target', i: pick([...Array(g.n).keys()].filter(i => !g.seats[i].role)) });
          else act({ a: 'kill' });
          break;
      }
    }, +slow);
  });
  ws.on('close', () => console.log(NAMES[k], 'closed'));
}
setInterval(() => {}, 1 << 30);
