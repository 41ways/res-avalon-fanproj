/**
 * 방 · 자리 · 열린 방 목록 · 채팅. 판의 규칙은 engine.js.
 * 짜임은 허브의 다른 게임(뱅 · 로보77 · 바퀴벌레 포커)과 같다.
 *   rooms·unwatch(목록 구독) / create / join / resume(token) / cfg / kick / host / start / act / chat / again / leave
 * 소켓은 send(문자열) · close() · readyState 만 쓴다 — Node(server.js)와 Cloudflare(worker.js)가 같이 쓴다.
 * 봇은 없다(숨은 역할 게임은 말로 하는 게임이라). 판 중에 끊긴 사람은 같은 기기로 돌아오면 자리를 그대로 잇는다.
 */
import { Game, MIN, MAX, defaultOpts, SPLIT } from './engine.js';

const FAST = typeof process !== 'undefined' && !!process.env && process.env.RA_FAST === '1';
const LOBBY_GRACE = FAST ? 200 : 20_000;
const THEMES = ['knights', 'bonghwa'];
const TIMERS = [0, 60, 120, 180];

const clean = (s, max) => String(s == null ? '' : s)
  .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max);
const token = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join('');
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const rooms = new Map();

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
  while (rooms.has(c));
  return c;
}

function createRoom({ priv = false, theme = 'knights' } = {}) {
  const room = {
    code: makeCode(), phase: 'lobby',                 // lobby | playing | over
    hostId: null, players: [], nextId: 1,
    cfg: { max: 10, theme: THEMES.includes(theme) ? theme : 'knights', opts: defaultOpts(5), optsAuto: true, lamp: false, lampAuto: true, timer: 0, voteOpen: true, priv: !!priv, title: '' },
    game: null, chat: [], lastActive: Date.now(), madeAt: Date.now(), gameNo: 0, pushN: 0,
  };
  rooms.set(room.code, room);
  return room;
}
/** 인원이 바뀌면 방장이 손대지 않은 설정은 그 인원의 기본값을 따른다 */
function autoCfg(room) {
  const n = Math.max(MIN, Math.min(MAX, room.players.length));
  if (room.cfg.optsAuto) room.cfg.opts = defaultOpts(n);
  if (room.cfg.lampAuto) room.cfg.lamp = n >= 7;
}

function addPlayer(room, name) {
  const p = { id: room.nextId++, token: token(), name, ws: null, connected: false, lastChat: 0, ready: false };
  room.players.push(p);
  if (room.hostId == null) room.hostId = p.id;
  autoCfg(room);
  return p;
}
const playerOf = (room, id) => room.players.find(p => p.id === id) || null;
const live = room => room.phase === 'playing';

function pickHost(room) {
  const next = room.players.find(p => p.connected) || room.players[0];
  room.hostId = next ? next.id : null;
}
function uniqueName(room, name, self) {
  let nm = name, k = 2;
  while (room.players.some(p => p !== self && p.name === nm)) nm = `${name}${k++}`;
  return nm;
}

function removePlayer(room, id) {
  const i = room.players.findIndex(p => p.id === id);
  if (i < 0) return;
  const p = room.players[i];
  clearTimeout(p.leaveT);
  if (live(room)) {
    // 판 중에 나가면 자리는 남는다(역할이 사라지면 판이 안 된다). 돌아오지 않으면 방장이 판을 접는다
    p.left = true; p.connected = false; p.ws = null;
    if (room.hostId === p.id) pickHost(room);
    sys(room, `${p.name} 님이 나갔어요. 같은 기기로 다시 들어오면 자리를 잇습니다.`);
  } else {
    room.players.splice(i, 1);
    if (room.hostId === p.id) pickHost(room);
    autoCfg(room);
  }
  listChanged();
}

function dropRoom(room) {
  for (const p of room.players) if (p.ws) { send(p.ws, { t: 'err', msg: '방이 사라졌어요.', fatal: true }); p.ws.roomCode = null; p.ws.playerId = null; }
  rooms.delete(room.code);
  listChanged();
}

/* ─────────────────────────── 판 ─────────────────────────── */

function startGame(room) {
  const n = room.players.length;
  if (n < MIN || n > MAX) return false;
  // 악 쪽 특수 역할이 자리보다 많으면 앞에서부터 쓴다(engine 이 넘치는 것은 버린다)
  room.gameNo++;
  shuffle(room.players);
  room.game = new Game(room.players.map(p => ({ id: p.id, name: p.name })), { opts: room.cfg.opts, lamp: room.cfg.lamp, timer: room.cfg.timer });
  room.phase = 'playing';
  sys(room, `${room.gameNo > 1 ? `${room.gameNo}번째 판` : '판'}이 시작됐어요. 자리를 섞었습니다. 각자 역할을 확인하세요.`);
  pushState(room);
  listChanged();
  return true;
}

function act(room, p, m) {
  const g = room.game;
  if (!g || room.phase !== 'playing') return;
  const before = g.step;
  try { g.act(p.id, Object.assign({}, m, { host: room.hostId === p.id && m && m.a === 'next' })); }
  catch (e) { return send(p.ws, { t: 'err', msg: String(e.message || e) }); }
  if (g.step === 'end') { room.phase = 'over'; listChanged(); }
  pushState(room, before !== g.step);
}

/* ─────────────────────────── 통신 ─────────────────────────── */

function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (_) {} } }

function stateFor(room, me) {
  const base = {
    t: 'state', code: room.code, phase: room.phase, hostId: room.hostId, cfg: room.cfg, min: MIN, max: MAX,
    gameNo: room.gameNo, now: Date.now(), you: me ? me.id : null,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected, left: !!p.left })),
    split: SPLIT[Math.max(MIN, Math.min(MAX, room.players.length))],
  };
  if (room.game) base.g = room.game.view(me ? room.game.seatOf(me.id) : null);
  return base;
}
function pushState(room, stepChanged) {
  room.pushN++;
  for (const p of room.players) if (p.ws) send(p.ws, Object.assign(stateFor(room, p), { seq: room.pushN, moved: !!stepChanged }));
}
function broadcast(room, obj) { for (const p of room.players) send(p.ws, obj); }
function sys(room, text) { const m = { t: 'chat', sys: true, text, at: Date.now() }; room.chat.push(m); room.chat = room.chat.slice(-80); broadcast(room, m); }

/* ── 열린 방 목록 ── */
const watchers = new Set();
let listT = null;
function listChanged() {
  if (listT || !watchers.size) return;
  listT = setTimeout(() => { listT = null; pushList(); }, FAST ? 0 : 300);
}
function roomList() {
  const rs = [];
  for (const r of rooms.values()) {
    if (!r.players.some(p => p.connected)) continue;
    const state = r.phase !== 'lobby' ? 'playing' : r.players.length >= r.cfg.max ? 'full' : 'wait';
    rs.push({ r, state });
  }
  const open = x => (x.state === 'wait' && !x.r.cfg.priv ? 0 : 1);
  rs.sort((a, b) => open(a) - open(b) || b.r.madeAt - a.r.madeAt);
  const list = rs.slice(0, 30).map(({ r, state }) => {
    const host = playerOf(r, r.hostId);
    const e = { host: host ? host.name : '', title: r.cfg.title, theme: r.cfg.theme, n: r.players.length, max: r.cfg.max, state, lamp: r.cfg.lamp };
    if (r.cfg.priv) { e.priv = true; return e; }
    return Object.assign({ code: r.code }, e);
  });
  return { t: 'rooms', list, online: onlineCount() };
}
let socketsRef = null;
const onlineCount = () => (socketsRef ? socketsRef() : 0);
export function countSockets(fn) { socketsRef = fn; }
function pushList() {
  if (!watchers.size) return;
  const text = JSON.stringify(roomList());
  for (const ws of watchers) {
    if (ws.readyState !== 1) { watchers.delete(ws); continue; }
    try { ws.send(text); } catch (_) { watchers.delete(ws); }
  }
}

/* ─────────────────────────── 메시지 처리 ─────────────────────────── */

function attach(room, p, ws) {
  clearTimeout(p.leaveT);
  watchers.delete(ws);
  p.ws = ws; p.connected = true; p.left = false;
  const host = playerOf(room, room.hostId);
  if (!host || (!host.connected && host !== p)) room.hostId = p.id;
  ws.roomCode = room.code; ws.playerId = p.id;
  send(ws, { t: 'welcome', you: p.id, token: p.token, code: room.code, chat: room.chat.slice(-40) });
  pushState(room);
  listChanged();
}

function detach(ws) {
  const room = rooms.get(ws.roomCode);
  if (room) {
    const p = playerOf(room, ws.playerId);
    if (p && p.ws === ws) {
      if (room.phase !== 'playing') {
        removePlayer(room, p.id);
        if (!room.players.length) dropRoom(room); else pushState(room);
      } else disconnect(ws);
    }
  }
  ws.roomCode = null; ws.playerId = null;
}

function chatText(room, who, msg) {
  const text = clean(msg.text, 200);
  if (!text) return;
  const now = Date.now();
  if (now - (who.lastChat || 0) < 400) return;
  who.lastChat = now;
  const m = { t: 'chat', from: who.id, name: who.name, text, at: now };
  room.chat.push(m); room.chat = room.chat.slice(-80);
  broadcast(room, m);
}

export function handle(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  if ((msg.t === 'create' || msg.t === 'join' || msg.t === 'resume') && ws.roomCode) detach(ws);
  switch (msg.t) {
    case 'rooms': if (!ws.roomCode) { watchers.add(ws); send(ws, roomList()); } return;
    case 'unwatch': watchers.delete(ws); return;
    case 'create': {
      const r = createRoom({ priv: msg.priv === true, theme: msg.theme });
      r.cfg.title = clean(msg.title, 20);
      const p = addPlayer(r, clean(msg.name, 10) || '손님 1');
      attach(r, p, ws);
      sys(r, `${p.name} 님이 방을 열었어요. 초대 코드 ${r.code}`);
      return;
    }
    case 'join': {
      const code = clean(msg.code, 8).toUpperCase();
      const r = rooms.get(code);
      if (!r) return send(ws, { t: 'err', msg: '그런 방이 없어요. 코드를 확인해 주세요.' });
      if (r.phase !== 'lobby') return send(ws, { t: 'err', msg: '이미 판이 시작된 방이에요.' });
      if (r.players.length >= r.cfg.max) return send(ws, { t: 'err', msg: '방이 가득 찼어요.' });
      const p = addPlayer(r, uniqueName(r, clean(msg.name, 10) || `손님 ${r.players.length + 1}`));
      attach(r, p, ws);
      sys(r, `${p.name} 님이 들어왔어요.`);
      return;
    }
    case 'resume': {
      const r = rooms.get(clean(msg.code, 8).toUpperCase());
      if (!r) return send(ws, { t: 'err', msg: '방이 사라졌어요.', fatal: true });
      const p = r.players.find(x => x.token === msg.token);
      if (!p) return send(ws, { t: 'err', msg: '자리를 찾을 수 없어요.', fatal: true });
      if (p.ws && p.ws !== ws) { send(p.ws, { t: 'moved' }); try { p.ws.close(4001, 'moved'); } catch (_) {} }
      attach(r, p, ws);
      return;
    }
  }

  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const me = playerOf(room, ws.playerId);
  if (!me) return;
  const isHost = room.hostId === me.id;
  room.lastActive = Date.now();

  switch (msg.t) {
    case 'cfg': {
      if (!isHost || room.phase !== 'lobby') return;
      const c = room.cfg;
      if (THEMES.includes(msg.theme)) c.theme = msg.theme;
      if (TIMERS.includes(msg.timer)) c.timer = msg.timer;
      if (Number.isInteger(msg.max) && msg.max >= MIN && msg.max <= MAX && msg.max >= room.players.length) c.max = msg.max;
      if (typeof msg.lamp === 'boolean') { c.lamp = msg.lamp; c.lampAuto = false; }
      if (typeof msg.priv === 'boolean') c.priv = msg.priv;
      if (typeof msg.voteOpen === 'boolean') c.voteOpen = msg.voteOpen;
      if (typeof msg.title === 'string') c.title = clean(msg.title, 20);
      if (msg.opt && ['watch', 'wisp', 'newmoon', 'wander'].includes(msg.opt)) { c.opts = Object.assign({}, c.opts, { [msg.opt]: !c.opts[msg.opt] }); c.optsAuto = false; }
      if (msg.reset) { c.optsAuto = true; c.lampAuto = true; autoCfg(room); }
      pushState(room); listChanged();
      break;
    }
    case 'rename': {
      if (room.phase !== 'lobby') return;
      const nm = clean(msg.name, 10); if (!nm) return;
      me.name = uniqueName(room, nm, me); pushState(room); listChanged();
      break;
    }
    case 'kick': {
      if (!isHost || room.phase !== 'lobby') return;
      const t = playerOf(room, msg.id);
      if (!t || t.id === room.hostId) return;
      if (t.ws) { send(t.ws, { t: 'err', msg: '방장이 내보냈어요.', fatal: true }); t.ws.roomCode = null; t.ws.playerId = null; }
      removePlayer(room, t.id);
      sys(room, `${t.name} 님이 나갔어요.`);
      pushState(room);
      break;
    }
    case 'host': {
      if (!isHost) return;
      const t = playerOf(room, msg.id);
      if (!t || !t.connected) return;
      room.hostId = t.id;
      sys(room, `${t.name} 님이 방장이 되었어요.`);
      pushState(room); listChanged();
      break;
    }
    case 'start': {
      if (!isHost || room.phase !== 'lobby') return;
      if (room.players.length < MIN) return send(ws, { t: 'err', msg: `${MIN}명이 모여야 시작할 수 있어요. 초대 코드를 나눠 주세요.` });
      startGame(room);
      break;
    }
    case 'act': act(room, me, msg.r || {}); break;
    case 'chat': chatText(room, me, msg); break;
    case 'abort': {                                    // 판 접기 — 돌아오지 않는 사람이 있을 때
      if (!isHost || room.phase !== 'playing') return;
      room.phase = 'lobby'; room.game = null;
      room.players = room.players.filter(p => !p.left);
      for (const p of room.players) if (!p.connected) armLeave(room, p);
      if (!playerOf(room, room.hostId)) pickHost(room);
      autoCfg(room);
      sys(room, '방장이 판을 접었어요.');
      pushState(room); listChanged();
      break;
    }
    case 'again': {
      if (!isHost || room.phase !== 'over') return;
      room.phase = 'lobby'; room.game = null;
      room.players = room.players.filter(p => !p.left);
      for (const p of room.players) if (!p.connected) armLeave(room, p);
      if (!playerOf(room, room.hostId)) pickHost(room);
      autoCfg(room);
      pushState(room); listChanged();
      break;
    }
    case 'leave':
      removePlayer(room, me.id);
      ws.roomCode = null; ws.playerId = null;
      send(ws, { t: 'left' });
      if (!room.players.some(x => !x.left)) dropRoom(room);
      else pushState(room);
      break;
  }
}

function armLeave(room, p) {
  clearTimeout(p.leaveT);
  p.leaveT = setTimeout(() => {
    if (p.connected || room.phase !== 'lobby' || rooms.get(room.code) !== room) return;
    removePlayer(room, p.id);
    sys(room, `${p.name} 님의 연결이 끊겨 자리를 비웠어요.`);
    if (!room.players.length) dropRoom(room); else pushState(room);
  }, LOBBY_GRACE);
}

export function disconnect(ws, { keepSeat = false } = {}) {
  watchers.delete(ws);
  const room = rooms.get(ws.roomCode);
  if (!room) return;
  const p = playerOf(room, ws.playerId);
  if (!p || p.ws !== ws) return;
  p.connected = false; p.ws = null;
  room.lastActive = Date.now();
  listChanged();
  if (room.hostId === p.id) {
    clearTimeout(room.hostT);
    room.hostT = setTimeout(() => {
      const h = playerOf(room, room.hostId);
      if (h && h.connected) return;
      const next = room.players.find(x => x.connected);
      if (next) { room.hostId = next.id; sys(room, `${next.name} 님이 방장이 되었어요.`); pushState(room); }
    }, LOBBY_GRACE);
  }
  if (room.phase === 'lobby' && !keepSeat) armLeave(room, p);
  pushState(room);
}

/** 사람이 다 떠난 방을 치운다. 통신 쪽이 20초마다 부른다 */
export function sweepRooms(now = Date.now()) {
  for (const room of [...rooms.values()]) {
    const on = room.players.filter(p => p.connected).length;
    const limit = room.phase === 'playing' ? 30 * 60_000 : room.players.length ? 10 * 60_000 : 60_000;
    if (on === 0 && now - room.lastActive > limit) dropRoom(room);
  }
}
export const busy = () => rooms.size > 0 || watchers.size > 0;
