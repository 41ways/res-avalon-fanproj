// 온라인 화면. 처음 화면 → 방 목록 → 대기실 → 판 → 결과. 판의 규칙과 비밀은 서버(src/engine.js)가 쥐고,
// 이 화면은 서버가 보내 준 "내 눈으로 본 판"만 그린다. 판 화면의 생김새·연출은 한 기기 모드(local.html)와 같다.
import { THEMES, THEME_IDS, ROLE_SIDE, ROLE_ORDER, artURL, titleHTML, J, P } from "./themes.js";

const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const ORD = ["첫째", "둘째", "셋째", "넷째", "다섯째"];
const SPLIT = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
const SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
const needTwo = (n, r) => n >= 7 && r === 3;
const HUES = [["#3f62b8", "#141f4a"], ["#b0404f", "#43111c"], ["#7d52b8", "#2a1546"], ["#2f8296", "#0e2c38"], ["#b5822f", "#472a08"],
              ["#5f6f92", "#1c2337"], ["#a8558a", "#3c142f"], ["#b65a3c", "#45170b"], ["#4a58b0", "#131944"], ["#8e3d70", "#300d26"]];
const hue = i => `--c1:${HUES[i % 10][0]};--c2:${HUES[i % 10][1]}`;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ───────── 테마 ─────────
let T = THEMES.knights;
const img = k => artURL(T.id, k);
const roleName = r => T.roles[r].name;
const roleArt = (r, a) => { const arts = T.roles[r].art; return img(arts[(a || 0) % arts.length]); };
function setTheme(id) {
  const next = THEMES[id] || THEMES.knights;
  if (next === T && document.documentElement.dataset.theme === T.id) return;
  T = next;
  const d = document.documentElement;
  d.dataset.theme = T.id;
  d.style.setProperty("--bgimg", `url(${img("bg")})`);
  d.style.setProperty("--tok", `url(${img("token")})`);
  d.style.setProperty("--back", `url(${img("back")})`);
  $("heroBg").src = img("bg");
  document.title = `${T.title} — 숨은 역할 온라인 파티 게임`;
  const ic = document.querySelector('link[rel="icon"]'); if (ic) ic.href = img("crown");
}

// ───────── 상태 ─────────
const pref = LS.get("ra.pref", { sound: false });
let ws = null, wsWanted = false, retryT = null, pingT = null, everOpen = false;
let view = "title";               // title | rooms | room
let R = null;                     // 서버가 보낸 방 상태
let list = [], online = 0, chat = [], lastSeq = 0;
let myName = LS.get("ra.name", "");
let sess = LS.get("ra.sess", null);  // { code, token }
const inviteCode = (new URLSearchParams(location.search).get("r") || "").toUpperCase().slice(0, 6);
const UI = { ov: null, crownA: null, lampA: null, hubKey: "", voteFlash: false, revealing: -1, revealed: {}, fast: false, speed: REDUCED ? .2 : 1, busy: false, toastT: null, roleOpen: false, timerT: null };
const wait = ms => new Promise(r => setTimeout(r, ms * UI.speed * (UI.fast ? .12 : 1)));
const G = () => R?.g;
const meSeat = () => G()?.me ?? -1;
const isHost = () => R && R.hostId === R.you;
const nameAt = i => G().seats[i].name;
const teamNames = t => t.map(i => esc(nameAt(i))).join(", ");

// ───────── 소리 (합성음) ─────────
let AC = null, NB = null;
function ac() { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); return AC; }
function tone(freq, dur = .18, type = "sine", vol = .14, at = 0, slide = 0) {
  if (!pref.sound) return;
  try {
    const A = ac(), t = A.currentTime + at, o = A.createOscillator(), g = A.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .015); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    o.connect(g).connect(A.destination); o.start(t); o.stop(t + dur + .05);
  } catch {}
}
function noise(dur = .2, vol = .2, at = 0, filter = "lowpass", f = 800, q = 1) {
  if (!pref.sound) return;
  try {
    const A = ac();
    if (!NB) { NB = A.createBuffer(1, A.sampleRate * 1.5, A.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = A.currentTime + at, s = A.createBufferSource(), bf = A.createBiquadFilter(), g = A.createGain();
    s.buffer = NB; bf.type = filter; bf.frequency.value = f; bf.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0005, t + dur);
    s.connect(bf).connect(g).connect(A.destination); s.start(t, Math.random()); s.stop(t + dur + .05);
  } catch {}
}
const SFX = {
  tap: () => tone(660, .06, "triangle", .05),
  place: () => { tone(520, .08, "triangle", .08); noise(.08, .12, 0, "highpass", 2500); },
  flip: () => { noise(.12, .18, 0, "bandpass", 1800, .8); tone(420, .08, "triangle", .06); },
  seal: (yes, at = 0) => { noise(.16, .32, at, "lowpass", 380); tone(yes ? 150 : 95, .22, "sine", .3, at, .6); },
  stamp: (at = 0) => { noise(.3, .4, at, "lowpass", 260); tone(70, .4, "sine", .4, at, .5); },
  beat: (at = 0, v = .35) => { tone(58, .16, "sine", v, at, .7); tone(52, .2, "sine", v * .8, at + .15, .7); },
  shuffle: () => { for (let i = 0; i < 9; i++) noise(.05, .14, i * .085 + Math.random() * .03, "highpass", 2600); },
  chime: () => { tone(1568, .7, "sine", .07); tone(2349, .5, "sine", .04, .05); },
  crack: () => { noise(.6, .45, 0, "lowpass", 900); tone(180, .6, "sawtooth", .09, 0, .35); tone(90, .7, "square", .05, .02, .5); },
  horn: () => { [[196, 0], [294, .32], [392, .64]].forEach(([f, a]) => { tone(f, .9, "sawtooth", .045, a); tone(f * 1.005, .9, "triangle", .05, a); }); noise(1.2, .05, 0, "bandpass", 500, .7); },
  whoosh: () => noise(.6, .12, 0, "bandpass", 700, .6),
  ok: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .7, "triangle", .12, i * .1)),
  fail: () => { [330, 262, 196, 147].forEach((f, i) => tone(f, .8, "sawtooth", .06, i * .16)); tone(55, 1.4, "sine", .3, 0); },
  bell: () => [880, 1320].forEach((f, i) => tone(f, 1.1, "sine", .12, i * .02)),
  doom: () => { [110, 104, 98].forEach((f, i) => tone(f, .9, "sawtooth", .07, i * .25)); tone(41, 2, "sine", .3); },
  win: () => [523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, .5, "triangle", .12, i * .13)),
  lamp: () => [740, 988, 1175, 1480].forEach((f, i) => tone(f, .9, "sine", .07, i * .12)),
  ding: () => [988, 1319].forEach((f, i) => tone(f, .3, "sine", .08, i * .08)),
};

// 화면 꺼짐 막기 (판 중에만)
let lock = null;
async function keepAwake(on) {
  try {
    if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") { lock = await navigator.wakeLock.request("screen"); lock.addEventListener("release", () => { lock = null; }); }
    if (!on && lock) { await lock.release(); lock = null; }
  } catch {}
}

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(UI.toastT); UI.toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

// ───────── 연출 (한 기기 모드와 같다) ─────────
function cine(cls, html, ms, block = true) {
  return new Promise(res => {
    const fx = $("fx"), el = document.createElement("div");
    el.className = `cine ${cls}`; el.innerHTML = html + (block ? `<p class="cine-skip">눌러서 넘기기</p>` : "");
    fx.appendChild(el); if (block) fx.classList.add("block");
    let done = false;
    const end = () => {
      if (done) return; done = true; el.classList.add("out");
      setTimeout(() => { el.remove(); if (!fx.querySelector(".cine:not(.band)")) fx.classList.remove("block"); res(); }, 420);
    };
    const t = setTimeout(end, ms * UI.speed);
    if (block) el.addEventListener("click", () => { clearTimeout(t); end(); });
  });
}
function band(title, sub, bad) {
  $("fx").querySelectorAll(".cine.band").forEach(e => e.remove());
  cine(`band ${bad ? "bad" : ""}`, `<div class="bd"><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>`, 2300, false);
}
function flash(kind) { const f = document.createElement("div"); f.className = `flash ${kind}`; document.body.appendChild(f); setTimeout(() => f.remove(), 800); }
function shake(el) { if (!el) return; el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 520); }
function sparks(kind, ms = 2600) {
  if (REDUCED) return;
  const c = document.createElement("canvas"); c.className = "sparks"; document.body.appendChild(c);
  const dpr = Math.min(2, devicePixelRatio || 1), W = innerWidth, H = innerHeight;
  c.width = W * dpr; c.height = H * dpr; const x = c.getContext("2d"); x.scale(dpr, dpr);
  const Pz = [], gold = kind === "gold";
  for (let i = 0; i < (gold ? 150 : 120); i++) {
    if (gold) { const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9; Pz.push({ x: W / 2, y: H * .42, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, r: 1 + Math.random() * 2.6, h: 38 + Math.random() * 16, l: 60 + Math.random() * 25, d: Math.random() * .3 }); }
    else Pz.push({ x: Math.random() * W, y: H + Math.random() * 60, vx: (Math.random() - .5) * 1.2, vy: -(1.2 + Math.random() * 3.4), r: 1 + Math.random() * 2.4, h: 350 + Math.random() * 25, l: 50 + Math.random() * 15, d: Math.random() * .5 });
  }
  const t0 = performance.now();
  const step = now => {
    const t = (now - t0) / ms; x.clearRect(0, 0, W, H);
    if (t >= 1) { c.remove(); return; }
    for (const p of Pz) {
      if (t < p.d) continue;
      p.x += p.vx; p.y += p.vy;
      if (gold) { p.vy += .22; p.vx *= .985; } else { p.vx += (Math.random() - .5) * .2; }
      const al = Math.max(0, 1 - (t - p.d) / (1 - p.d));
      x.fillStyle = `hsla(${p.h},95%,${p.l}%,${al})`; x.shadowColor = x.fillStyle; x.shadowBlur = 8;
      x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
const medal = i => `<i style="${hue(i)}">${esc([...nameAt(i)][0])}</i>`;

// ───────── 소켓 ─────────
function wsURL() { return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`; }
function connect() {
  wsWanted = true;
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  clearTimeout(retryT);
  try { ws = new WebSocket(wsURL()); } catch { return retry(); }
  ws.onopen = () => {
    everOpen = true; $("conn").hidden = true;
    clearInterval(pingT); pingT = setInterval(() => send({ t: "ping" }), 25000);
    if (sess) send({ t: "resume", code: sess.code, token: sess.token });
    else if (view !== "room") send({ t: "rooms" });
    if (UI.pendingSend) { const m = UI.pendingSend; UI.pendingSend = null; send(m); }
  };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
  ws.onclose = () => { clearInterval(pingT); if (wsWanted) { if (view === "room") $("conn").hidden = false; retry(); } };
  ws.onerror = () => {};
}
function retry() { clearTimeout(retryT); retryT = setTimeout(connect, everOpen ? 1500 : 3000); }
function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
  else { if (m.t !== "ping") UI.pendingSend = m; connect(); }
}
const act = r => send({ t: "act", r });

function onMsg(m) {
  switch (m.t) {
    case "rooms": list = m.list; online = m.online; if (view === "rooms") renderRooms(); if (view === "title") renderOnline(); break;
    case "welcome":
      sess = { code: m.code, token: m.token }; LS.set("ra.sess", sess);
      chat = m.chat || []; view = "room"; history.replaceState(null, "", `?r=${m.code}`);
      break;
    case "state": {
      if (m.seq && m.seq < lastSeq && R && R.code === m.code) return;
      const prev = R; R = m; R._recv = Date.now(); lastSeq = m.seq || 0; view = "room";
      setTheme(R.cfg.theme);
      onState(prev, m);
      break;
    }
    case "chat": chat.push(m); chat = chat.slice(-80); renderChat(); if (!m.sys && m.from !== R?.you) SFX.tap(); break;
    case "err":
      toast(m.msg);
      if (m.fatal) { sess = null; LS.del("ra.sess"); R = null; view = "rooms"; history.replaceState(null, "", location.pathname); UI.ov = null; render(); send({ t: "rooms" }); }
      break;
    case "left": sess = null; LS.del("ra.sess"); R = null; view = "rooms"; UI.ov = null; history.replaceState(null, "", location.pathname); render(); send({ t: "rooms" }); break;
    case "moved": wsWanted = false; toast("다른 창에서 이 자리로 들어왔어요. 이 창은 멈춥니다."); break;
    case "idle": toast("한동안 조작이 없어 연결을 쉬어요. 누르면 다시 붙습니다."); break;
  }
}

// 서버가 판을 한 걸음 옮겼을 때 연출을 붙인다
function onState(prev, m) {
  const g = m.g, pg = prev?.g;
  if (!g) { UI.revealed = {}; render(); return; }
  if (pg && pg.step === "reveal" && g.step !== "reveal") UI.roleOpen = false;
  const moved = m.moved && pg && (pg.step !== g.step || pg.round !== g.round);
  if (prev && prev.phase === "lobby" && m.phase === "playing") { UI.dealIn = true; UI.intro = true; immerse(); }
  if (g.step === "reveal" && !g.seats[g.me]?.seen && !UI.ov && !UI.intro) UI.ov = { k: "role" };
  if (g.step !== "reveal" && UI.ov?.k === "role" && UI.ov.auto) UI.ov = null;
  if (g.step === "voteResult" && moved) UI.voteFlash = true;
  if (g.step === "missionReveal" && UI.revealed[g.round] == null) UI.revealed[g.round] = moved ? "go" : "done";
  if (g.step !== "missionReveal" && UI.ov?.k === "mission") UI.ov = null;
  if (g.step === "mission" && g.team.includes(g.me) && !g.myCard && moved) UI.ov = { k: "mission" };
  if (g.step === "end" && moved) { UI.ov = null; keepAwake(false); }
  if (g.step !== "end" && m.phase === "playing") keepAwake(true);
  render();
  if (!moved || !g.fx) return;
  const fx = g.fx;
  if (fx.k === "band") {
    SFX.horn();
    band(`${ORD[g.round]} ${T.unit}`, `원정대 <b>${g.sizes[g.round]}명</b>${needTwo(g.n, g.round) ? ` · ${T.cardB} 2장이어야 ${T.failShort}` : ""} · ${T.leader} <b>${esc(nameAt(g.leader))}</b>`);
  } else if (fx.k === "reject") {
    band(`부결 ${g.rejects} / 5`, `${T.leader} 자리가 <b>${esc(nameAt(g.leader))}</b>에게 넘어갑니다${g.rejects === 4 ? ` · 한 번 더 부결되면 ${SIDE().evil} 승리` : ""}`, true);
  } else if (fx.k === "vote") {
    const n = g.n, last = g.history[g.history.length - 1];
    const order = g.seats.map((_, k) => (last.leader + k) % n);
    order.forEach((i, k) => SFX.seal(last.votes[i], .2 + k * .15));
    SFX.stamp(.5 + n * .15);
    setTimeout(() => { if (!last.ok) shake($("stage")); }, (500 + n * 150) * UI.speed);
  } else if (fx.k === "depart") {
    SFX.horn();
    cine("depart", `<img class="cine-bg" src="${img("depart")}" alt=""><div class="cine-shade"></div>
      <div class="cine-txt"><p class="cine-k">${ORD[g.round]} ${T.unit}</p><h2 class="cine-title">${T.depart}</h2>
      <div class="march">${g.team.map((i, k) => `<span style="--d:${700 + k * 160}ms">${medal(i)}${esc(nameAt(i))}</span>`).join("")}</div></div>`, 3200);
  } else if (fx.k === "reveal") {
    runReveal();
  } else if (fx.k === "unmask") {
    SFX.doom(); window.scrollTo({ top: 0, behavior: "smooth" });
    const evils = g.seats.map((_, i) => i).filter(i => g.seats[i].role && ROLE_SIDE[g.seats[i].role] === "evil");
    cine("dark", `<div class="cine-txt"><p class="cine-k">${T.lit3}</p><h2 class="cine-title">${J(SIDE().evil, "이", "가")} 정체를 드러낸다</h2>
      <div class="deal">${evils.map((i, k) => `<figure style="--d:${900 + k * 380}ms"><img src="${roleArt(g.seats[i].role, g.seats[i].art)}" alt=""><figcaption>${esc(nameAt(i))}<small>${roleName(g.seats[i].role)}</small></figcaption></figure>`).join("")}</div>
      <p class="lead" style="animation:fadeIn .6s ${1400 + evils.length * 380}ms both">함께 의논해 ${J(roleName("star"), "을", "를")} 찾으세요. ${J(roleName("assassin"), "이", "가")} 단 한 번 지목합니다.</p></div>`, 4200 + evils.length * 380);
  } else if (fx.k === "lamp") SFX.lamp();
  else if (fx.k === "end") {
    const good = g.winner === "good";
    if (g.reason === "hit" || g.reason === "miss") {
      const t = g.target;
      cine("dark", `<div class="cine-txt kill"><p class="cine-k">${roleName("assassin")}의 칼끝이 향한 곳</p>
        <h2 class="cine-title" style="font-size:clamp(34px,7vw,64px)">${esc(nameAt(t))}</h2>
        <div class="kcard" style="--flip:2.6s"><div class="kb"></div><div class="kf"><img src="${roleArt(g.seats[t].role, g.seats[t].art)}" alt=""></div></div>
        <p class="kres" style="--flip2:3.2s;color:${!good ? "var(--red-hi)" : "var(--gold-hi)"}">${!good ? `${J(roleName("star"), "을", "를")} 찾아냈다` : "빗나갔다"}<small>${esc(nameAt(t))}의 정체: ${roleName(g.seats[t].role)}</small></p></div>`, 6000)
        .then(() => { (good ? SFX.win : SFX.doom)(); sparks(good ? "gold" : "ember", 3400); });
      for (let b = 0; b < 6; b++) SFX.beat(.3 + b * .42, .3);
    } else { (good ? SFX.win : SFX.doom)(); setTimeout(() => sparks(good ? "gold" : "ember", 3400), 400); }
  }
}
const SIDE = () => T.side;
// 판 시작: 대기실 장면 속으로 다가가며 자리를 섞고, 카드가 깔린 뒤 역할 카드가 열린다
async function immerse() {
  SFX.horn();
  await cine("immerse", `<div class="imm" style="background-image:url(${img("hall")})"></div><div class="imm-v"></div>
    <div class="cine-txt"><p class="cine-k">${esc(R.cfg.title || `방 ${R.code}`)} · ${R.players.length}명</p><h2 class="cine-title">${titleHTML(T.title)}</h2>
    <p class="lead" style="animation:fadeIn .6s 1.1s both">자리를 섞었습니다. 각자 역할을 받습니다.</p></div>`, 3400);
  UI.intro = false;
  const g = G();
  if (g && g.step === "reveal" && !g.seats[g.me]?.seen && !UI.ov) { UI.ov = { k: "role" }; renderOv(); }
}
// 으로/로: 받침 없거나 ㄹ 받침이면 "로"
const ro = w => { const c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c <= 11171 && c % 28 && c % 28 !== 8 ? "으로" : "로"); };

// ───────── 그리기 ─────────
function render() {
  renderBrand(); renderTop();
  const g = G();
  document.body.classList.toggle("ingame", view === "room" && !!R);
  document.body.classList.toggle("has-chat", view === "room" && !!R);
  $("hero").classList.toggle("title", view === "title");
  if (view === "title") renderTitle();
  else if (view === "rooms") renderRooms();
  else if (!R) renderRooms();
  else if (!g) renderLobby();
  else if (g.step === "end") renderEnd();
  else renderBoard();
  renderQuests();
  renderOv();
}
function renderBrand() {
  const inGame = view === "room" && G();
  $("brand").innerHTML = `<h1>${titleHTML(T.title)}</h1><p>${inGame ? (R.cfg.title ? `${esc(R.cfg.title)} · ${R.code}` : `방 ${R.code}`) : T.tagline}</p>`;
}
function renderTop() {
  const nav = [], g = G();
  if (view === "room" && g && g.step !== "end") nav.push(`<button class="btn sm" data-act="myrole">내 역할</button>`);
  nav.push(`<button class="btn sm" data-act="sound" aria-pressed="${pref.sound}" aria-label="소리">${pref.sound ? "♪<span class=long> 소리</span>" : "♪ 끔"}</button>`);
  nav.push(`<button class="btn sm" data-act="rules">규칙</button>`);
  if (view === "room") nav.push(`<button class="btn sm" data-act="leave">나가기</button>`);
  else if (view === "rooms") nav.push(`<button class="btn sm" data-act="home">처음</button>`);
  $("topnav").innerHTML = nav.join("");
}
function renderQuests() {
  const g = view === "room" ? G() : null;
  if (!g) { $("quests").innerHTML = ""; $("hero").classList.remove("win", "lose"); return; }
  $("quests").innerHTML = g.sizes.map((sz, r) => questHTML(g, r, `원정대 ${sz}명`)).join("");
  const end = g.step === "end";
  $("hero").classList.toggle("win", end && g.winner === "good");
  $("hero").classList.toggle("lose", end && g.winner === "evil");
}
// 결과 공개 연출이 끝나기 전에는 그 원정 결과를 감춘다
const shownQuest = (g, r) => (g.step === "missionReveal" && r === g.round && UI.revealed[r] !== "done") ? null : g.quests[r];
function questHTML(g, r, sz) {
  const q = shownQuest(g, r), now = !["end", "reveal"].includes(g.step) && r === g.round && !q;
  const st = q ? q.result : now ? "now" : "future";
  const sh = q ? (q.result === "ok" ? "sh_ok" : "sh_fail") : "sh_empty";
  const lab = q ? (q.result === "ok" ? T.okShort : `${T.failShort} · ${T.cardB} ${q.fails}`) : sz;
  return `<div class="quest ${st}">
    <div class="sh"><img src="${img(sh)}" alt=""><span class="n">${r + 1}</span></div>
    <div class="lab"><b>${ORD[r]}</b>${lab}${needTwo(g.n, r) && !q ? `<br><span class="two">${T.cardB} 2장</span>` : ""}</div>
  </div>`;
}

function legalHTML() {
  return `<footer class="legal"><p>비공식·비영리 팬 프로젝트입니다. 보드게임 『레지스탕스: 아발론』(Indie Boards &amp; Cards)의 진행 방식을 바탕으로 했고,<br>
    이름·인물·그림은 새로 만들었습니다(그림은 Gemini로 생성). 『레지스탕스: 아발론』 명칭과 상표의 권리는 원권리자에게 있습니다.<br>
    권리자께서 문제를 알려 주시면 바로 비공개로 돌리거나 지우겠습니다. 문의 <a href="mailto:gyolno2@naver.com">gyolno2@naver.com</a></p></footer>`;
}

// ── 처음 화면 ──
function renderTitle() {
  const themes = THEME_IDS.map(k => { const t = THEMES[k]; return `<button data-act="pickTheme" data-v="${k}" aria-pressed="${T.id === k}"><img src="${artURL(k, "bg")}" alt=""><span class="t">${t.title}</span><span class="d">${t.pick}</span></button>`; }).join("");
  $("main").innerHTML = `
    <div class="title-acts">
      <button class="btn gold big" data-act="goRooms">온라인으로 하기</button>
      <a class="btn big" href="local.html" style="text-decoration:none;display:inline-grid;place-items:center">한 기기로 돌려 하기</a>
      <button class="btn big ghost" data-act="rules">규칙 보기</button>
      <span class="online ${online ? "" : "off"}" id="online"><i></i>${online ? `지금 ${online}명 접속` : "서버에 붙는 중"}</span>
    </div>
    <div class="feat">
      <section class="panel"><h3>방을 만들고 모인다</h3><p>방을 열면 네 글자 초대 코드가 생깁니다. 5~10명이 각자 폰으로 들어오면 방장이 시작합니다.</p></section>
      <section class="panel"><h3>역할은 내 폰에만</h3><p>역할과 아는 것, 원정 카드와 표는 각자 화면에서 몰래 고릅니다. 표는 모두 낸 뒤 한꺼번에 열립니다.</p></section>
      <section class="panel"><h3>다섯 원정, 마지막 지목</h3><p>대장이 원정대를 꾸리고 모두 찬반을 냅니다. 셋을 먼저 가져가는 쪽이 이기지만, 마지막 지목이 남아 있습니다.</p></section>
    </div>
    ${THEME_IDS.length > 1 ? `<section class="panel stack" style="margin-bottom:24px"><div><p class="kicker">테마</p><h3>어느 밤으로 갈까요</h3></div>
      <div class="themes">${themes}</div><p class="note">방장이 대기실에서 바꿀 수 있습니다. 규칙은 같고 이름과 그림만 바뀝니다.</p></section>` : ""}
    ${legalHTML()}`;
}
function renderOnline() { const e = $("online"); if (e) { e.className = `online ${online ? "" : "off"}`; e.innerHTML = `<i></i>${online ? `지금 ${online}명 접속` : "서버에 붙는 중"}`; } }

// ── 방 목록 ──
function renderRooms() {
  const cur = document.activeElement?.id;
  const items = list.length ? list.map(r => {
    const can = r.code && r.state === "wait";
    const st = r.state === "wait" ? `<span class="st wait">대기 ${r.n}/${r.max}</span>` : r.state === "full" ? `<span class="st">가득 참</span>` : `<span class="st playing">진행 중 ${r.n}명</span>`;
    return `<button class="ritem" ${can ? `data-act="joinRoom" data-code="${r.code}"` : "disabled"}><img src="${artURL(r.theme, "bg")}" alt="">
      <span><span class="t">${esc(r.title || `${r.host}의 방`)}</span><br><span class="m">${THEMES[r.theme]?.title || ""} · 방장 ${esc(r.host)}${r.lamp ? ` · ${THEMES[r.theme]?.lamp}` : ""}${r.priv ? " · 비공개" : ""}</span></span>${st}</button>`;
  }).join("") : `<p class="empty">열린 방이 없습니다. 방을 하나 만들고 초대 코드를 나눠 주세요.</p>`;
  if (document.getElementById("rlist") && UI.roomsDrawn) { $("rlist").innerHTML = items; $("onlineN").textContent = online ? `지금 ${online}명 접속` : ""; return; }
  UI.roomsDrawn = true;
  $("main").innerHTML = `
    <div class="lobby-grid">
      <section class="panel stack">
        <div class="field"><label for="nm">내 이름</label><input class="inp" id="nm" maxlength="10" placeholder="판에 보일 이름" value="${esc(myName)}" autocomplete="off"></div>
        <div><p class="kicker">방 만들기</p><h3>새 방을 엽니다</h3></div>
        <div class="field"><label for="rt">방 이름 (선택)</label><input class="inp" id="rt" maxlength="20" placeholder="예: 금요일 저녁 판" autocomplete="off"></div>
        <div class="row"><label class="opt" style="width:auto;flex:1" ><input type="checkbox" id="rp" style="accent-color:var(--gold)"> <span><span class="t" style="font-size:15px">비공개</span> <span class="d">목록에 코드가 안 보입니다</span></span></label></div>
        <button class="btn gold big wide" data-act="create">방 만들기</button>
        <div style="border-top:1px solid var(--line);padding-top:14px" class="stack">
          <div><p class="kicker">초대 코드</p><h3>코드로 들어가기</h3></div>
          <div class="row"><input class="inp code-inp" id="jc" maxlength="4" placeholder="ABCD" value="${esc(inviteCode)}" autocomplete="off" autocapitalize="characters"><button class="btn gold" data-act="joinCode">들어가기</button></div>
        </div>
      </section>
      <section class="panel stack">
        <div class="row" style="justify-content:space-between"><div><p class="kicker">열린 방</p><h3>대기실 목록</h3></div><span class="online" id="onlineN">${online ? `지금 ${online}명 접속` : ""}</span></div>
        <div class="rlist" id="rlist">${items}</div>
        <p class="note">5명이 모여야 시작할 수 있습니다. 진행 중인 방에는 들어갈 수 없습니다.</p>
      </section>
    </div>${legalHTML()}`;
  if (cur && $(cur)) $(cur).focus();
}
function needName() {
  const v = ($("nm")?.value || myName || "").trim().slice(0, 10);
  if (!v) { toast("이름을 먼저 적어 주세요"); $("nm")?.focus(); return null; }
  myName = v; LS.set("ra.name", v); return v;
}

// ── 대기실 ──
function renderLobby() {
  UI.roomsDrawn = false;
  const c = R.cfg, n = R.players.length, host = isHost(), nn = Math.max(5, Math.min(10, n));
  const [good, evil] = SPLIT[nn];
  const comp = composition(nn, c.opts);
  const count = arr => arr.reduce((m, r) => (m[r] = (m[r] || 0) + 1, m), {});
  const chips = (arr, side) => Object.entries(count(arr)).map(([r, k]) => `<div class="chip ${side}"><img src="${roleArt(r, 0)}" alt=""><span class="cap">${roleName(r)}</span>${k > 1 ? `<span class="cnt">×${k}</span>` : ""}</div>`).join("");
  const slots = [];
  for (let i = 0; i < R.players.length; i++) {
    const p = R.players[i];
    slots.push(`<div class="slot ${p.id === R.you ? "me" : ""} ${p.connected ? "" : "off"}"><span class="av" style="${hue(i)}">${esc([...p.name][0])}</span>
      <span class="nm">${esc(p.name)}<br><span class="tag">${p.id === R.hostId ? "방장" : p.connected ? "" : "연결 끊김"}${p.id === R.you ? " · 나" : ""}</span></span>
      ${host && p.id !== R.you ? `<button class="x" data-act="kick" data-id="${p.id}" aria-label="${esc(p.name)} 내보내기">×</button>` : ""}</div>`);
  }
  if (c.max > n) slots.push(`<div class="slot free">빈자리 ${c.max - n}</div>`);
  const espec = ["wisp", "newmoon", "wander"].filter(k => c.opts[k]).length;
  const opts = ["watch", "wisp", "newmoon", "wander"].map(k => {
    const on = !!c.opts[k], side = ROLE_SIDE[k], block = !on && side === "evil" && espec >= evil - 1;
    return `<button class="opt" ${host ? `data-act="cfgOpt" data-k="${k}"` : "disabled"} aria-pressed="${on}" ${block && host ? "disabled" : ""}><span class="box"></span><span><span class="t">${roleName(k)}</span> <span class="d"><span class="${side === "good" ? "side-g" : "side-e"}">${T.side[side]}</span> · ${T.opts[k]}</span></span></button>`;
  }).join("");
  const seg = (key, cur, items) => `<div class="seg" role="group">${items.map(([v, t]) => `<button ${host ? `data-act="cfgSet" data-k="${key}" data-v="${v}"` : "disabled"} aria-pressed="${String(cur) === String(v)}">${t}</button>`).join("")}</div>`;
  const themes = THEME_IDS.map(k => { const t = THEMES[k]; return `<button ${host ? `data-act="cfgSet" data-k="theme" data-v="${k}"` : "disabled"} aria-pressed="${c.theme === k}"><img src="${artURL(k, "bg")}" alt=""><span class="t">${t.title}</span><span class="d">${t.pick}</span></button>`; }).join("");
  const url = `${location.origin}${location.pathname}?r=${R.code}`;
  const keepHall = $("lobbyHall")?.dataset.code === R.code ? $("lobbyHall") : null;
  if (keepHall) keepHall.remove();
  keepChat(() => { $("main").innerHTML = `
    <div class="lobby-grid room">
      <section class="stack">
      <div id="hallSlot"></div>
      <section class="panel stack">
        <div><p class="kicker">이번 판${host ? "" : " · 방장이 정합니다"}</p><h3>설정</h3></div>
        ${THEME_IDS.length > 1 ? `<div class="themes">${themes}</div>` : ""}
        <div class="comp">${chips(comp.g, "good")}${chips(comp.e, "evil")}</div>
        <p class="note">${J(roleName("star"), "과", "와")} ${J(roleName("assassin"), "은", "는")} 항상 들어갑니다. 빈자리는 ${J(roleName("guard"), "과", "와")} ${roleName("spy")}${P(roleName("spy"), "이", "가")} 채웁니다. 사람 수가 바뀌면 기본 구성으로 돌아갑니다${host ? `(직접 바꾸면 그대로 둡니다 · <button class="btn sm ghost" data-act="cfgReset" style="padding:2px 8px">기본으로</button>)` : ""}.</p>
        <div class="opts">${opts}</div>
        <div class="opts"><button class="opt" ${host ? `data-act="cfgLamp"` : "disabled"} aria-pressed="${!!c.lamp}"><span class="box"></span><span><span class="t">${T.lamp}</span> <span class="d"><span class="side-r">규칙</span> · 둘째·셋째·넷째 ${T.unit} 뒤, 한 사람의 편을 몰래 살펴본다 (7명 이상 추천)</span></span></button></div>
        <div class="row"><span class="sub-h">토론 타이머</span>${seg("timer", c.timer, [[0, "없음"], [60, "1분"], [120, "2분"], [180, "3분"]])}</div>
        ${host ? `<div class="row"><span class="sub-h">최대 인원</span>${seg("max", c.max, [[5, "5"], [6, "6"], [7, "7"], [8, "8"], [9, "9"], [10, "10"]])}</div>
          <div class="row"><button class="opt" data-act="cfgPriv" aria-pressed="${!!c.priv}" style="width:auto"><span class="box"></span><span><span class="t" style="font-size:15px">비공개 방</span></span></button></div>` : ""}
        ${legalHTML()}
      </section>
      </section>
      <aside class="room-side">
        <div class="panel stack" style="gap:10px">
          <div class="roomcode"><span class="kicker" style="margin:0">초대 코드</span><b>${R.code}</b>
            <button class="btn sm" data-act="copy" data-v="${esc(url)}">링크 복사</button></div>
          <p class="note">${esc(c.title || "이름 없는 방")} · ${c.priv ? "비공개" : "공개"} · ${n}명 / 최대 ${c.max}명</p>
          <div class="seatlist">${slots.join("")}</div>
          <div class="row" style="justify-content:space-between">
            <span class="split"><span class="g">${T.side.good} ${good}</span> · <span class="e">${T.side.evil} ${evil}</span>${n < 5 ? ` <span class="note">(5명 기준)</span>` : ""}</span>
            ${host ? `<button class="btn gold big" data-act="start" ${n >= 5 ? "" : "disabled"}>${n >= 5 ? "판 시작" : `${5 - n}명 더 모이면 시작`}</button>` : `<span class="waitnote">방장이 시작하기를 기다리는 중</span>`}
          </div>
        </div>
        ${chatHTML("대기실 이야기")}
      </aside>
    </div>`; });
  const slot = $("hallSlot");
  if (keepHall) slot.replaceWith(keepHall);
  else { slot.outerHTML = hallShell("lobbyHall", "lobby"); $("lobbyHall").dataset.code = R.code; UI.seenIds = new Set(); }
  renderLobbyHall($("lobbyHall"));
}
function composition(n, o) {
  const [good, evil] = SPLIT[n];
  const g = ["star"]; if (o.watch) g.push("watch"); while (g.length < good) g.push("guard");
  const e = ["assassin"]; ["wisp", "newmoon", "wander"].forEach(k => { if (o[k] && e.length < evil) e.push(k); }); while (e.length < evil) e.push("spy");
  return { g, e };
}

// ── 채팅 ──
function chatHTML(title = "이야기") {
  return `<section class="panel chatbox float ${UI.chatOpen ? "open" : ""}" id="chatp"><h3>${title}<small style="font-family:var(--f-body);font-weight:400;font-size:12.5px;color:var(--dim);margin-left:8px">모두에게 보입니다</small></h3>
    <div class="chatlog" id="chatlog">${chatLines()}</div>
    <form class="chatform" data-form="chat"><button class="btn sm chat-tog" type="button" data-act="chatTog" aria-label="이야기 크게 보기">${UI.chatOpen ? "▾" : "▴"}</button><input class="inp" id="chatin" maxlength="200" placeholder="말하기" autocomplete="off" enterkeyhint="send"><button class="btn sm" type="submit">보내기</button></form></section>`;
}
// 화면을 다시 그려도 쓰던 말과 커서를 지킨다
function keepChat(fn) {
  const el = $("chatin"), v = el?.value || "", f = document.activeElement === el;
  fn();
  const n = $("chatin"); if (n) { n.value = v; if (f) n.focus(); }
  scrollChat();
}
const chatLines = () => chat.map(m => m.sys ? `<p class="c sys">${esc(m.text)}</p>` : `<p class="c ${m.from === R?.you ? "mine" : ""}"><b>${esc(m.name)}</b>${esc(m.text)}</p>`).join("");
function renderChat() { const el = $("chatlog"); if (!el) return; el.innerHTML = chatLines(); scrollChat(); }
function scrollChat() { const el = $("chatlog"); if (el) el.scrollTop = el.scrollHeight; }

// ── 판 ──
function boardSkeleton() {
  if ($("board")) return;
  UI.roomsDrawn = false;
  $("main").innerHTML = `<div class="board" id="board">
    <div class="left"><div class="stage-wrap" id="stageWrap"></div><section class="panel chron" id="chron"></section></div>
    <aside class="side"><div class="panel qt" id="qtrack"></div><section class="panel dock" id="dock"></section>${chatHTML()}</aside></div>`;
  scrollChat();
}
// ── 장면: 내 자리에서 탁자 건너편을 본다. 다른 사람은 건너편 의자에, 나는 앞쪽 가장자리에 ──
// 초상은 역할과 상관없는 "자리 초상"(art/knights/seat/p1~12). 방 안 사람의 id 순서로 나눠 모두에게 같게 보인다
const PORTRAITS = 12;
const faceNo = id => { const ids = (R?.players || []).map(p => p.id).sort((a, b) => a - b); const k = ids.indexOf(id); return ((k < 0 ? id : k) % PORTRAITS) + 1; };
const portraitOf = id => artURL(T.id, `seat/p${faceNo(id)}`);     // 내 자리(앞쪽 구석)의 액자 초상
const figureOf = id => artURL(T.id, `fig/f${faceNo(id)}`);        // 건너편에 앉은 사람(배경 없는 인물)
function hallSpots(k) {
  const out = [], step = k > 1 ? Math.min(11.2, 84 / (k - 1)) : 0;
  for (let j = 0; j < k; j++) {
    const dx = (j - (k - 1) / 2) * step, t = Math.min(1, Math.abs(dx) / 45);
    out.push({ x: 50 + dx, y: 61 + 7 * t * t, s: .9 + .2 * t * t, z: 10 + Math.round(t * 10) });
  }
  return out;
}
// 자리 배치: 나를 앞에 두고 나머지를 내 왼쪽부터(시계 방향) 건너편에 늘어놓는다
function hallLayout(n, me) {
  const spots = hallSpots(n - 1), pos = {};
  for (let j = 0; j < n - 1; j++) pos[(me + 1 + j) % n] = spots[j];
  pos[me] = { x: 89, y: 97.5, s: 1.08, z: 40, me: true };
  return pos;
}
function cardHTML(i, name, id, p, extra = "") {
  return `<button class="pc ${p.me ? "me" : "fig"} ${extra}" data-i="${i}" data-id="${id}" style="left:${p.x}%;top:${p.y}%;--s:${p.s};z-index:${p.z}" aria-label="${esc(name)}">
    <span class="pc-fr"><img class="pc-pt" src="${p.me ? portraitOf(id) : figureOf(id)}" alt=""><img class="pc-rl" alt=""><img class="pc-seal" alt=""><span class="pc-chk">✓</span></span>
    <span class="pc-nm">${p.me ? "나 · " : ""}${esc(name)}</span><img class="pc-tok" src="${img("token")}" alt=""></button>`;
}
function hallShell(id, extraCls = "") {
  return `<div class="hall ${extraCls}" id="${id}" style="--hallimg:url(${img("hall")})"><div class="hall-v"></div><div class="hub" id="hub"></div>
    <img class="h-crown off" id="hCrown" src="${img("crown")}" alt="${T.leader}"><img class="h-lamp off" id="hLamp" src="${img("lantern")}" alt="${T.lamp}"></div>`;
}
function hallUnit(h) {
  if (!h || h._ro) return;
  const set = () => { if (h.clientWidth) h.style.setProperty("--u", `${h.clientWidth / 130}px`); };
  set(); if (window.ResizeObserver) { h._ro = new ResizeObserver(set); h._ro.observe(h); }
}
// 왕관·등불은 한 장만 두고 그 사람 카드 위로 미끄러져 간다
function floatTo(el, card, where) {
  const h = el.parentElement; if (!card || !h) { el.classList.add("off"); return; }
  const place = () => {
    const hr = h.getBoundingClientRect(), cr = card.querySelector(".pc-fr").getBoundingClientRect();
    if (!hr.width) return;
    const x = where === "lamp" ? cr.right - hr.left : cr.left + cr.width / 2 - hr.left;
    const y = where === "lamp" ? cr.bottom - hr.top - cr.height * .1 : cr.top - hr.top + cr.height * .08;
    el.style.left = `${x / hr.width * 100}%`; el.style.top = `${y / hr.height * 100}%`;
    el.classList.remove("off");
  };
  place(); requestAnimationFrame(place); setTimeout(place, 650);
}

// 대기실 장면: 들어온 사람이 의자에 나타난다
function renderLobbyHall(h) {
  hallUnit(h);
  const n = R.players.length, me = Math.max(0, R.players.findIndex(p => p.id === R.you)), pos = hallLayout(Math.max(n, 1), me);
  UI.seenIds = UI.seenIds || new Set();
  const have = new Map([...h.querySelectorAll(".pc")].map(e => [+e.dataset.id, e]));
  R.players.forEach((p, i) => {
    const sp = pos[i]; let el = have.get(p.id);
    if (!el) {
      h.insertAdjacentHTML("beforeend", cardHTML(i, p.name, p.id, sp, UI.seenIds.has(p.id) ? "" : "arrive"));
      el = h.querySelector(`.pc[data-id="${p.id}"]`);
      if (!UI.seenIds.has(p.id) && UI.seenIds.size) SFX.place();
      UI.seenIds.add(p.id);
    } else {
      el.style.left = `${sp.x}%`; el.style.top = `${sp.y}%`; el.style.setProperty("--s", sp.s); el.style.zIndex = sp.z;
      el.classList.toggle("me", !!sp.me); el.classList.toggle("fig", !sp.me);
      el.querySelector(".pc-nm").textContent = `${sp.me ? "나 · " : ""}${p.name}`;
      const u = sp.me ? portraitOf(p.id) : figureOf(p.id), im = el.querySelector(".pc-pt"); if (im.getAttribute("src") !== u) im.src = u;
    }
    el.classList.toggle("offline", !p.connected);
    el.disabled = true;
    have.delete(p.id);
  });
  have.forEach(el => { el.classList.add("leave"); setTimeout(() => el.remove(), 450); });
  const host = R.players.findIndex(p => p.id === R.hostId);
  floatTo($("hCrown"), host >= 0 ? h.querySelector(`.pc[data-id="${R.players[host].id}"]`) : null, "crown");
  $("hub").innerHTML = `<div class="hub-in"><p class="hk">대기실 · ${R.code}</p><p class="hbig">${n} / ${R.cfg.max}</p><p class="hs">${n < 5 ? `${5 - n}명 더 모이면 시작할 수 있어요` : "방장이 시작하면 자리를 섞습니다"}</p></div>`;
}

function stageSkeleton() {
  const g = G(), key = g.seats.map(p => p.id).join("|") + R.gameNo;
  let st = $("stage");
  if (st && st.dataset.key === key) return st;
  const pos = hallLayout(g.n, g.me);
  $("stageWrap").innerHTML = hallShell("stage", UI.dealIn ? "deal" : "");
  st = $("stage"); st.dataset.key = key;
  st.insertAdjacentHTML("beforeend", g.seats.map((s, i) => cardHTML(i, s.name, s.id, pos[i])).join(""));
  if (UI.dealIn) { [...st.querySelectorAll(".pc")].forEach((el, k) => el.style.setProperty("--d", `${200 + k * 110}ms`)); setTimeout(() => st.classList.remove("deal"), 2600); UI.dealIn = false; }
  hallUnit(st); UI.hubKey = "";
  return st;
}
function renderStage() {
  const g = G(), n = g.n, st = stageSkeleton(), me = g.me;
  const showTeam = ["team", "vote", "voteResult", "mission", "missionReveal"].includes(g.step);
  const lastVote = g.history[g.history.length - 1];
  const order = g.seats.map((_, k) => ((lastVote?.leader ?? g.leader) + k) % n);
  const pl = id => R.players.find(p => p.id === id);
  st.classList.toggle("dark", g.step === "assassin");
  st.classList.toggle("water", g.step === "lamp");
  st.querySelectorAll(".pc").forEach(el => {
    const i = +el.dataset.i, s = g.seats[i], cls = ["pc", i === me ? "" : "fig"], on = showTeam && g.team.includes(i);
    let a = "", label = s.name, seal = "";
    if (i === me) cls.push("me");
    if (pl(s.id) && !pl(s.id).connected) { cls.push("offline"); label += ", 연결 끊김"; }
    if (showTeam && i === g.leader) { cls.push("lead"); label += `, ${T.leader}`; }
    if (on) { cls.push("on"); label += ", 원정대"; }
    if (g.step === "reveal" && s.seen) cls.push("seen");
    if (g.step === "team" && me === g.leader) { a = "pick"; cls.push("pickable"); }
    if (g.step === "vote" && g.voted?.[i]) cls.push("voted");
    if (g.step === "voteResult" && lastVote) {
      const v = lastVote.votes[i]; seal = v ? "seal_yes" : "seal_no"; cls.push("sv", v ? "yes" : "no"); label += v ? ", 찬성" : ", 반대";
      if (UI.voteFlash) { cls.push("anim"); el.style.setProperty("--d", `${200 + order.indexOf(i) * 150}ms`); }
    }
    if (g.step === "assassin" || g.step === "end") {
      if (s.role && ROLE_SIDE[s.role] === "evil") cls.push("showrole", "evil");
      else if (g.step === "assassin" && g.seats[me]?.role === "assassin") { a = "target"; cls.push("pickable"); }
      if (g.target === i) cls.push("target");
    }
    if (g.step === "lamp" && g.lamp) {
      const L = g.lamp;
      if (i === L.holder) {}
      else if (L.past.includes(i)) cls.push("past");
      else if (me === L.holder && L.pick == null) { a = "lampPick"; cls.push("pickable"); }
      if (L.pick === i) cls.push("target", "pick-lamp");
    }
    const rl = el.querySelector(".pc-rl");
    if (cls.includes("showrole")) { const u = roleArt(s.role, s.art); if (rl.dataset.u !== u) { rl.src = u; rl.dataset.u = u; } }
    el.className = cls.filter(Boolean).join(" ");
    if (a) { el.dataset.act = a; el.disabled = false; } else { delete el.dataset.act; el.disabled = true; }
    el.setAttribute("aria-label", label);
    const si = el.querySelector(".pc-seal");
    if (seal) { if (si.dataset.k !== seal) { si.src = img(seal); si.dataset.k = seal; } } else { si.removeAttribute("src"); si.dataset.k = ""; }
  });
  const crownOn = !["assassin", "lamp", "end"].includes(g.step) && (g.step !== "reveal" || g.seats.every(s => s.seen));
  if (crownOn) floatTo($("hCrown"), st.querySelector(`.pc[data-i="${g.leader}"]`), "crown"); else $("hCrown").classList.add("off");
  if (g.lamp && g.step !== "assassin") floatTo($("hLamp"), st.querySelector(`.pc[data-i="${g.lamp.holder}"]`), "lamp"); else $("hLamp").classList.add("off");
  renderHub();
}
function renderHub() {
  const g = G(), n = g.n, need = g.sizes[g.round];
  const key = [g.step, g.round, g.team.length, (g.voted || []).filter(Boolean).length, (g.carded || []).filter(Boolean).length, g.rejects, g.lamp?.pick, g.target, g.seats.filter(s => s.seen).length, g.history.length, UI.revealed[g.round]].join("|");
  if (key === UI.hubKey) return; const prev = UI.hubKey; UI.hubKey = key;
  let h = "";
  const pips = k => { let s = ""; for (let i = 0; i < need; i++) s += `<i class="${i < k ? "on" : ""}"></i>`; return `<div class="pips">${s}</div>`; };
  switch (g.step) {
    case "reveal": { const k = g.seats.filter(s => s.seen).length; h = `<p class="hk">역할 확인</p><p class="hbig">${k} / ${n}</p><p class="hs">${k === n ? "모두 확인했습니다" : "각자 화면에서<br>몰래 확인하세요"}</p>`; break; }
    case "team": h = `<div class="sh"><img src="${img("sh_empty")}" alt=""><span>${g.round + 1}</span></div><p class="hk">${ORD[g.round]} ${T.unit}</p>${pips(g.team.length)}<p class="hs">원정대 ${g.team.length} / ${need}${needTwo(n, g.round) ? ` · ${T.cardB} 2장` : ""}</p>`; break;
    case "vote": { const k = (g.voted || []).filter(Boolean).length; h = `<p class="hk">표결 · 몰래</p><p class="hbig">${k} / ${n}</p><p class="hs">모두 내면 한꺼번에 열립니다</p>`; break; }
    case "voteResult": {
      const last = g.history[g.history.length - 1], yes = last.votes.filter(Boolean).length, d = UI.voteFlash ? 350 + n * 150 : 0;
      h = `<p class="bigstamp ${last.ok ? "ok" : "bad"} ${d ? "slam" : ""}" style="--d:${d}ms">${last.ok ? "가결" : "부결"}</p><p class="hs after" style="--d:${d + 300}ms;margin-top:calc(1.6 * var(--u))">찬성 ${yes} · 반대 ${n - yes}</p>`; break;
    }
    case "mission": case "missionReveal": {
      const k = g.step === "mission" ? (g.carded || []).filter(Boolean).length : g.team.length, pk = prev.split("|");
      const grew = pk[0] === "mission" && +pk[4] < k;
      let s = ""; for (let i = 0; i < g.team.length; i++) s += `<i class="${i < k ? (grew && i === k - 1 ? "drop" : "") : "slot"}" style="transform:rotate(${(i - (g.team.length - 1) / 2) * 7}deg) translateX(calc(${(i - (g.team.length - 1) / 2) * 1.6} * var(--u)))"></i>`;
      h = `<div class="pile">${s}</div><p class="hk" style="margin-top:calc(1.4 * var(--u))">${ORD[g.round]} ${T.unit}</p><p class="hs">${g.step === "mission" ? `카드 ${k} / ${g.team.length}` : "결과 공개"}</p>`; break;
    }
    case "lamp": h = `<div class="ripple"><img class="roundimg" src="${img("lantern")}" alt=""></div><p class="hk" style="margin-top:calc(1.6 * var(--u));color:var(--teal)">${T.lamp}</p>`; break;
    case "assassin": h = `<img class="roundimg red" src="${img("assassin")}" alt=""><p class="hk" style="margin-top:calc(1.6 * var(--u));color:var(--red-hi)">${J(roleName("star"), "은", "는")} 누구인가</p>`; break;
  }
  $("hub").innerHTML = `<div class="hub-in">${h}</div>`;
}
function rejectsHTML(k) {
  let s = ""; for (let i = 0; i < 5; i++) s += `<i class="${i < k ? "on" : ""} ${i === 4 ? "last" : ""}"></i>`;
  return `<span class="rejects" title="같은 ${T.unit}에서 다섯 번 연달아 부결되면 ${SIDE().evil} 승리">${s}<span>부결 ${k}/5</span></span>`;
}
function logHTML() {
  const g = G(), items = [];
  g.history.forEach(h => {
    const q = shownQuest(g, h.round), last = g.history.filter(x => x.round === h.round && x.ok).pop() === h;
    const res = h.ok ? (q && last ? (q.result === "ok" ? ` → <span class="res-ok">${T.okV}</span>` : ` → <span class="res-fail">${T.failV} · ${T.cardB} ${q.fails}</span>`) : " → 원정 중") : "";
    const yes = h.votes.filter(Boolean).length;
    const chips = h.votes.map((v, i) => `<span class="vc ${v ? "y" : "n"} ${h.team.includes(i) ? "tm" : ""}">${esc(nameAt(i))}</span>`).join("");
    items.push({ round: h.round, k: 0, html: `<div class="log-item ${h.ok ? "ok" : "bad"}"><span class="t">${ORD[h.round]} ${T.unit} · ${T.leader} ${esc(nameAt(h.leader))}<em>${h.attempt}번째 제안</em></span><br>
      원정대 <b>${teamNames(h.team)}</b> — ${h.ok ? `<span class="tag-yes">가결 ${yes}:${h.votes.length - yes}</span>` : `<span class="tag-no">부결 ${yes}:${h.votes.length - yes}</span>`}${res}
      <div class="vrow">${chips}</div></div>` });
  });
  (g.lamp?.log || []).forEach(l => items.push({ round: l.round, k: 1, html: `<div class="log-item lady"><span class="t">${T.lamp} · ${ORD[l.round]} ${T.unit} 뒤</span><br>${esc(nameAt(l.from))} → ${esc(nameAt(l.to))}의 편을 살펴봄</div>` }));
  if (!items.length) return `<p class="log-empty">아직 표결이 없습니다. 찬성·반대는 모두 공개 정보라 여기 쌓입니다. 노란 칸은 찬성, 붉은 칸은 반대, 흰 테두리는 원정대입니다.</p>`;
  items.sort((a, b) => a.round - b.round || a.k - b.k);
  return `<div class="log">${items.reverse().map(x => x.html).join("")}</div>`;
}
function renderBoard() {
  const g = G();
  boardSkeleton();
  renderStage();
  const meta = [];
  if (g.step !== "reveal") meta.push(rejectsHTML(g.rejects));
  if (g.lamp && g.step !== "assassin") meta.push(`<span class="ladytag"><img src="${img("lantern")}" alt="">${T.lamp} · ${esc(nameAt(g.lamp.holder))}</span>`);
  if (g.step === "team" && g.teamEnds) meta.push(`<span id="timer" class="timer run"></span>`);
  $("qtrack").innerHTML = `<div class="qt-row">${g.sizes.map((sz, r) => questHTML(g, r, `${sz}명`)).join("")}</div>${meta.length ? `<div class="qt-meta">${meta.join("")}</div>` : ""}`;
  tickTimer();
  renderDock();
  $("chron").innerHTML = `<h3>연대기<small>표는 모두 공개 정보</small></h3>${logHTML()}`;
  if (!$("chatlog")?.childElementCount && chat.length) renderChat();
  UI.voteFlash = false;
}
function tickTimer() {
  clearTimeout(UI.timerT);
  const el = $("timer"), g = G(); if (!el || !g?.teamEnds) return;
  const left = Math.max(0, Math.ceil((g.teamEnds - Date.now() - (R.now ? 0 : 0)) / 1000));
  el.textContent = `⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; el.className = `timer ${left ? "run" : "out"}`;
  if (left === 0 && !UI.rang?.[g.round + "-" + g.rejects]) { UI.rang = UI.rang || {}; UI.rang[g.round + "-" + g.rejects] = 1; SFX.bell(); toast("토론 시간이 끝났습니다"); }
  if (left > 0) UI.timerT = setTimeout(tickTimer, 500);
}

function renderDock() {
  const g = G(), n = g.n, need = g.sizes[g.round], dock = $("dock"), me = g.me, mine = g.seats[me];
  let a = "", kind = "";
  const L = g.leader === me, leaderName = esc(nameAt(g.leader));
  const nextBtn = (txt) => `<p class="waitnote autonext" data-auto="${R.autoAt || 0}">${txt} · <b class="cd"></b></p>`;
  switch (g.step) {
    case "reveal": {
      const k = g.seats.filter(s => s.seen).length;
      a = `<div><p class="kicker">역할 확인 · ${k} / ${n}</p><h3>${mine.seen ? "다른 사람을 기다리는 중" : "내 역할을 확인하세요"}</h3></div>
        <p class="lead">역할은 내 화면에만 보입니다. 모두 확인하면 첫 ${T.unit}이 열립니다.</p>
        <button class="btn ${mine.seen ? "" : "gold"} big wide ${mine.seen ? "" : "myturn"}" data-act="myrole">${mine.seen ? "내 역할 다시 보기" : "내 역할 보기"}</button>`;
      break;
    }
    case "team":
      a = L ? `<div><p class="kicker">원정대 꾸리기 · ${ORD[g.round]} ${T.unit}</p><h3>내가 ${T.leader}입니다 · ${need}명을 고르세요</h3></div>
          <p class="lead">탁자의 자리를 눌러 표식을 놓으세요. 자기 자신도 됩니다. 고르기 전에 충분히 이야기하세요.</p>
          <button class="btn gold big wide myturn" data-act="propose" ${g.team.length === need ? "" : "disabled"}>${g.team.length === need ? "이 원정대로 표결" : `${need - g.team.length}명 더 고르세요`}</button>`
        : `<div><p class="kicker">원정대 꾸리기 · ${ORD[g.round]} ${T.unit}</p><h3>${T.leader} ${J(leaderName, "이", "가")} ${need}명을 고르는 중</h3></div>
          <p class="lead">고르는 동안 이야기로 거드세요. 지금까지 ${g.team.length}명: ${g.team.length ? `<b>${teamNames(g.team)}</b>` : "아직 없음"}</p>`;
      if (g.rejects === 4) a += `<p class="warn">이번에도 부결되면 ${J(SIDE().evil, "이", "가")} 바로 이깁니다.</p>`;
      break;
    case "vote": {
      const k = (g.voted || []).filter(Boolean).length;
      a = `<div><p class="kicker">표결 · ${k} / ${n} 냄</p><h3>이 원정대를 보낼까요?</h3></div>
        <p class="lead">원정대 <b>${teamNames(g.team)}</b> · ${T.leader} ${leaderName}<br>모두 내기 전에는 바꿀 수 있고, 다 모이면 한꺼번에 공개됩니다.</p>
        <div class="vbtns"><button class="y ${g.myVote == null ? "myturn" : ""}" data-act="vote" data-v="1" aria-pressed="${g.myVote === true}"><img src="${img("seal_yes")}" alt=""><span class="t">찬성</span><small>보낸다</small></button>
          <button class="n" data-act="vote" data-v="0" aria-pressed="${g.myVote === false}"><img src="${img("seal_no")}" alt=""><span class="t">반대</span><small>막는다</small></button></div>`;
      break;
    }
    case "voteResult": {
      const h = g.history[g.history.length - 1], yes = h.votes.filter(Boolean).length, d = UI.voteFlash ? 600 + n * 150 : 0;
      kind = h.ok ? "" : "evil";
      a = h.ok ? `<div class="banner ok after" style="--d:${d}ms">가결 · 찬성 ${yes} : 반대 ${n - yes}<small>원정대 ${teamNames(h.team)}</small></div><div class="after" style="--d:${d + 200}ms">${nextBtn("원정 출발")}</div>`
        : `<div class="banner bad after" style="--d:${d}ms">부결 · 찬성 ${yes} : 반대 ${n - yes}<small>${g.rejects >= 5 ? `다섯 번째 부결입니다.` : `${T.leader} 자리가 ${esc(nameAt((g.leader + 1) % n))}에게 넘어갑니다 · 부결 ${g.rejects}/5`}</small></div><div class="after" style="--d:${d + 200}ms">${nextBtn(g.rejects >= 5 ? "결과 보기" : `${T.mark} 넘기기`)}</div>`;
      break;
    }
    case "mission": {
      const k = (g.carded || []).filter(Boolean).length, onTeam = g.team.includes(me);
      a = `<div><p class="kicker">${ORD[g.round]} ${T.unit} · 카드 ${k} / ${g.team.length}</p><h3>${onTeam ? (g.myCard ? "카드를 냈습니다" : "원정대원입니다 · 카드를 내세요") : "원정대가 몰래 카드를 내는 중"}</h3></div>
        <p class="lead">원정대 <b>${teamNames(g.team)}</b>. ${J(SIDE().good, "은", "는")} ${T.cardG}만, ${J(SIDE().evil, "은", "는")} ${J(T.cardG, "과", "와")} ${T.cardB} 중 하나를 냅니다.</p>
        ${onTeam && !g.myCard ? `<button class="btn gold big wide myturn" data-act="openMission">카드 고르기</button>` : ""}`;
      break;
    }
    case "missionReveal":
      a = `<div><p class="kicker">${ORD[g.round]} ${T.unit} 결과</p><h3>모두 함께 카드를 뒤집습니다</h3></div>${UI.revealed[g.round] === "done" ? `<button class="btn big wide" data-act="reopenReveal">결과 다시 보기</button>` : ""}`;
      break;
    case "lamp": {
      const Lp = g.lamp; kind = "lady";
      const holder = Lp.holder === me;
      a = holder ? `<div><p class="kicker">${T.lamp}</p><h3>내가 한 사람의 편을 살펴봅니다</h3></div>
          <p class="lead">탁자에서 한 명을 누르면 그 사람의 편이 내 화면에만 보입니다. 전에 ${J(T.lamp, "을", "를")} 가졌던 사람은 고를 수 없습니다. 본 것을 말해도, 거짓말해도 됩니다.</p>
          ${Lp.pick != null ? `<button class="btn gold big wide" data-act="lampShow">본 결과 다시 보기</button><button class="btn big wide" data-act="lampDone">다 봤어요 · ${J(T.lamp, "을", "를")} 넘기기</button>` : ""}`
        : `<div><p class="kicker">${T.lamp}</p><h3>${J(esc(nameAt(Lp.holder)), "이", "가")} 한 사람의 편을 살펴보는 중</h3></div>
          <p class="lead">${Lp.pick != null ? `<b>${esc(nameAt(Lp.pick))}</b>의 편을 보았습니다. 뭐라고 하는지 들어 보세요.` : "누구를 고를지 지켜보세요."}</p>`;
      break;
    }
    case "assassin": {
      const ai = g.seats.findIndex(s => s.role === "assassin"); kind = "evil";
      const evils = g.seats.map((_, i) => i).filter(i => g.seats[i].role && ROLE_SIDE[g.seats[i].role] === "evil");
      const amA = mine.role === "assassin";
      a = `<div><p class="kicker">마지막 지목</p><h3>${J(esc(nameAt(ai)), "이", "가")} ${J(roleName("star"), "을", "를")} 지목합니다</h3></div>
        <p class="lead">${SIDE().evil} 편 <b>${teamNames(evils)}</b>. 함께 의논한 뒤 ${J(roleName("assassin"), "이", "가")} 탁자에서 한 명을 누릅니다. 맞히면 ${SIDE().evil}의 역전승입니다.</p>
        ${g.target == null ? "" : `<div class="banner bad">${J(esc(nameAt(g.target)), "을", "를")} ${ro(roleName("star"))} 지목${amA ? "할까요?<small>되돌릴 수 없습니다</small>" : "하려 합니다"}</div>`}
        ${amA ? `<button class="btn red big wide myturn" data-act="kill" ${g.target == null ? "disabled" : ""}>${g.target == null ? `${roleName("star")}라 생각하는 사람을 누르세요` : "지목하기"}</button>` : ""}`;
      break;
    }
  }
  if (isHost() && g.step !== "end") a += `<p class="note" style="margin-top:4px">돌아오지 않는 사람이 있으면 <button class="btn sm ghost" data-act="abort" style="padding:2px 8px">판 접기</button></p>`;
  dock.className = `panel dock ${kind}`;
  dock.innerHTML = a;
}

function faceHTML(c) {
  return c === "ok" ? `<div class="face ok"><img src="${img("q_ok")}" alt=""><span class="lab">${T.cardG}</span></div>`
    : `<div class="face fail"><img src="${img("q_fail")}" alt=""><span class="lab">${T.cardB}</span></div>`;
}

function renderEnd() {
  const g = G(), good = g.winner === "good", star = g.seats.findIndex(s => s.role === "star");
  UI.roomsDrawn = false;
  const cast = g.seats.map((s, i) => `<div class="chip ${ROLE_SIDE[s.role]} ${i === g.target ? "mark" : ""}" style="--d:${600 + i * 140}ms"><img src="${roleArt(s.role, s.art)}" alt=""><span class="cap">${esc(s.name)}<small>${roleName(s.role)} · ${SIDE()[ROLE_SIDE[s.role]]}</small></span></div>`).join("");
  const recap = g.quests.map((q, r) => `<div class="q"><img src="${img(q ? (q.result === "ok" ? "sh_ok" : "sh_fail") : "sh_empty")}" alt="" style="${q ? "" : "opacity:.35"}"><b>${ORD[r]}</b>${q ? `${q.team.map(i => esc(nameAt(i))).join(", ")}${q.fails ? `<br><span class="tag-no">${T.cardB} ${q.fails}</span>` : ""}` : "—"}</div>`).join("");
  const reason = g.reason === "reject5" ? T.reject5(ORD[g.round]) : g.reason === "fail3" ? T.fail3
    : g.reason === "hit" ? `${T.lit3.replace(/다$/, "지만")} ${roleName("assassin")} ${J(esc(nameAt(g.seats.findIndex(s => s.role === "assassin"))), "이", "가")} ${roleName("star")} ${J(esc(nameAt(star)), "을", "를")} 찾아냈습니다.`
    : `${roleName("assassin")} ${J(esc(nameAt(g.seats.findIndex(s => s.role === "assassin"))), "은", "는")} ${J(esc(nameAt(g.target)), "을", "를")} 지목했습니다. 진짜 ${J(roleName("star"), "은", "는")} ${J(esc(nameAt(star)), "이었", "였")}습니다.`;
  keepChat(() => { $("main").innerHTML = `
    <div class="end-grid">
      <section class="stack">
        <div class="end-hero"><img src="${img(good ? "win" : "lose")}" alt="">
          <div class="txt"><p class="verdict ${good ? "ok" : "fail"}">${good ? T.winG : T.winE}</p>
          <h3 style="font-family:var(--f-head);font-size:20px">${SIDE()[g.winner]}의 승리</h3>
          <p class="lead">${reason}</p></div></div>
        <div class="panel stack"><h3>모두의 정체</h3><div class="cast">${cast}</div>
          ${g.target != null ? `<p class="note">붉은 테두리가 ${J(roleName("assassin"), "이", "가")} 지목한 사람입니다. ${J(roleName("star"), "은", "는")} ${esc(nameAt(star))}.</p>` : ""}</div>
        <div class="panel stack"><h3>원정 기록</h3><div class="recap">${recap}</div></div>
        <div class="panel chron"><h3>연대기</h3>${logHTML()}</div>
        ${legalHTML()}
      </section>
      <aside class="room-side">
        <div class="panel stack"><h3>한 판 더</h3><p class="lead">같은 방으로 돌아가 다시 모입니다.</p>
          <div class="row">${isHost() ? `<button class="btn gold big" data-act="again">대기실로</button>` : `<span class="waitnote">방장이 대기실로 데려갑니다</span>`}<button class="btn" data-act="leave">방 나가기</button></div></div>
        ${chatHTML()}
      </aside>
    </div>`; });
}

// ───────── 덮개 화면 ─────────
function roleFace() {
  const g = G(), me = g.me, s = g.seats[me], R0 = T.roles[s.role], side = ROLE_SIDE[s.role], k = g.know;
  const list = js => js.map(j => `<b>${esc(nameAt(j))}</b>`).join(", ");
  let kn;
  if (k.kind === "star") kn = { h: T.kn.starH, body: k.seats.length ? list(k.seats) : "아무도 보이지 않습니다", sub: (k.hidden ? T.kn.starHidden + " " : "") + "누가 어떤 역할인지는 모릅니다." };
  else if (k.kind === "watch") kn = { h: T.kn.watchH, body: list(k.seats), sub: k.seats.length > 1 ? T.kn.watch2 : `이 사람이 ${roleName("star")}입니다. ${roleName("assassin")}에게 들키지 않게 지켜 주세요.` };
  else if (k.kind === "wander") kn = { h: T.kn.wanderH, body: "동료를 모릅니다", sub: `다른 ${SIDE().evil}도 당신을 모릅니다. ${roleName("star")}에게는 보입니다. 원정에서 ${J(T.cardB, "을", "를")} 낼 수 있습니다.` };
  else if (k.kind === "evil") {
    const subs = [];
    if (s.role === "assassin") subs.push(`${T.lit3If} ${J(roleName("star"), "을", "를")} 한 번 지목합니다. 맞히면 ${J(SIDE().evil, "이", "가")} 이깁니다.`);
    if (s.role === "wisp") subs.push(`${roleName("watch")}에게는 당신이 ${ro(roleName("star"))} 보입니다.`);
    if (s.role === "newmoon") subs.push(`${J(roleName("star"), "은", "는")} 당신을 보지 못합니다.`);
    if (k.wander) subs.push(T.kn.wanderHere);
    subs.push(`원정에서 ${J(T.cardG, "과", "와")} ${T.cardB} 중 하나를 고를 수 있습니다.`);
    kn = { h: T.kn.evilH, body: k.seats.length ? list(k.seats) : "없음", sub: subs.join(" ") };
  } else kn = { h: "아는 것", body: "없음", sub: `${T.kn.guardSub} 원정에서는 ${T.cardG}만 낼 수 있습니다.` };
  return `<div class="rolecard ${side}">
    <figure><img src="${roleArt(s.role, s.art)}" alt=""></figure>
    <div><p class="rc-who">${J(esc(s.name), "은", "는")}</p><p class="rc-role">${R0.name}</p><span class="rc-side">${SIDE()[side]} 편</span>
    <p class="rc-goal">${side === "good" ? T.goalG : T.goalE}</p>
    <p class="note">${R0.blurb}</p>
    <div class="know"><h4>${kn.h}</h4><p class="names-list">${kn.body}</p><p class="sub">${kn.sub}</p></div>
    <p class="tip" style="margin-top:10px"><b>요령</b> ${R0.tip}</p></div></div>`;
}

function renderOv() {
  const ov = $("ov"), o = UI.ov, g = view === "room" ? G() : null;
  ov.classList.remove("rv", "tense");
  if (g && g.step === "missionReveal" && (UI.revealed[g.round] === "go" || UI.revealed[g.round] === "running" || UI.reopen) && !o) {
    ov.classList.add("rv");
    const key = `reveal${g.round}`, cur = ov.querySelector(".ov-in[data-key]");
    ov.hidden = false; document.body.style.overflow = "hidden";
    if (cur && cur.dataset.key === key) { const act = ov.querySelector(".rv-act"); if (act && UI.revealed[g.round] === "done") act.innerHTML = revealNext(); return; }
    ov.innerHTML = revealHTML(); return;
  }
  if (!o) { ov.hidden = true; ov.innerHTML = ""; document.body.style.overflow = ""; return; }
  ov.hidden = false; document.body.style.overflow = "hidden";
  let h = "";
  if (o.k === "rules") h = rulesHTML();
  else if (o.k === "leave") h = `<div class="ov-in"><h2>방을 나갈까요?</h2><p class="lead">${g && g.step !== "end" ? "판 중에 나가면 자리는 남고, 같은 기기로 다시 들어오면 이어집니다. 다른 사람들은 당신을 기다려야 합니다." : "대기실 자리가 비워집니다."}</p>
      <div class="row" style="justify-content:center"><button class="btn" data-act="ov-x">머물기</button><button class="btn red" data-act="leave-yes">나가기</button></div></div>`;
  else if (o.k === "abort") h = `<div class="ov-in"><h2>판을 접을까요?</h2><p class="lead">지금 판은 사라지고 모두 대기실로 돌아갑니다. 나간 사람의 자리는 비워집니다.</p>
      <div class="row" style="justify-content:center"><button class="btn" data-act="ov-x">계속하기</button><button class="btn red" data-act="abort-yes">판 접기</button></div></div>`;
  else if (o.k === "role" && g?.know) {
    const seen = g.seats[g.me].seen;
    h = `<div class="ov-in"><p class="kicker">${esc(nameAt(g.me))}의 역할 · 다른 사람에게 화면이 보이지 않게</p>
      ${UI.roleOpen ? roleFace() : `<button class="flipcard" data-act="roleShow" aria-label="카드 뒤집기"><img class="ov-back" src="${img("back")}" alt=""></button><p class="lead">카드를 눌러 뒤집으세요.</p>`}
      <div class="row" style="justify-content:center">${UI.roleOpen ? `<button class="btn" data-act="roleHide">가리기</button>` : `<button class="btn gold big" data-act="roleShow">카드 뒤집기</button>`}
      ${g.step === "reveal" && !seen ? `<button class="btn gold big" data-act="seen" ${UI.roleOpen ? "" : "disabled"}>확인했어요</button>` : `<button class="btn" data-act="ov-x">닫기</button>`}</div></div>`;
  } else if (o.k === "mission" && g?.step === "mission") {
    const good = ROLE_SIDE[g.seats[g.me].role] === "good";
    const btn = c => `<button class="mcard static" data-act="card" data-v="${c}" ${good && c === "fail" ? "disabled" : ""} aria-label="${c === "ok" ? T.cardG : T.cardB}">${faceHTML(c)}${good && c === "fail" ? `<span class="dis">${J(SIDE().good, "은", "는")}<br>${T.cardG}만</span>` : ""}</button>`;
    h = `<div class="ov-in"><p class="kicker">${ORD[g.round]} ${T.unit} · ${esc(nameAt(g.me))}의 카드</p><h2>무엇을 낼까요?</h2>
      <p class="lead">고르면 뒤집혀 섞여 들어갑니다. 누가 무엇을 냈는지는 아무도 모릅니다.</p>
      <div class="cards">${["ok", "fail"].map(btn).join("")}</div><button class="btn" data-act="ov-x">나중에</button></div>`;
  } else if (o.k === "lamp" && g?.lampSeen?.length) {
    const s = g.lampSeen[g.lampSeen.length - 1], side = s.side;
    h = `<div class="ov-in"><p class="kicker">${T.lamp} · 나만 보는 화면</p>
      <div class="ripple"><img src="${img("lantern")}" alt="" style="width:120px"></div>
      <div class="loyal"><img src="${img(side === "good" ? "sh_ok" : "sh_fail")}" alt="" style="width:120px"><h2>${esc(nameAt(s.seat))}</h2><p class="verdict ${side === "good" ? "ok" : "fail"}">${SIDE()[side]} 편</p></div>
      <div class="row" style="justify-content:center"><button class="btn" data-act="ov-x">닫기</button>${g.step === "lamp" && g.lamp.holder === g.me ? `<button class="btn gold big" data-act="lampDone">다 봤어요 · 넘기기</button>` : ""}</div></div>`;
  } else { UI.ov = null; ov.hidden = true; ov.innerHTML = ""; document.body.style.overflow = ""; return; }
  ov.innerHTML = h; ov.scrollTop = 0;
}

function revealNext() {
  const g = G();
  const lbl = g.quests.filter(q => q && q.result === "fail").length >= 3 ? "결과 보기" : g.quests.filter(q => q && q.result === "ok").length >= 3 ? "마지막 지목으로" : g.lamp && [1, 2, 3].includes(g.round) ? ro(T.lamp) : `다음 ${ro(T.unit)}`;
  return `<p class="waitnote autonext" data-auto="${R.autoAt || 0}">${lbl} · <b class="cd"></b></p><button class="btn" data-act="closeReveal">닫기</button>`;
}
function revealHTML() {
  const g = G(), p = g.pending, done = UI.revealed[g.round] === "done", ok = p.result === "ok";
  const k = done ? p.cards.length : 0, a = p.cards.slice(0, k).filter(x => x === "ok").length, f = k - a;
  const cards = p.cards.map((c, j) => `<div class="mcard ${j < k ? "open" : ""}"><div class="back" style="background-image:url(${img("back")})"></div>${faceHTML(c)}</div>`).join("");
  return `<div class="rv-bg ${done ? "on" : ""}" style="background-image:url(${img(ok ? "ret_ok" : "ret_fail")})"></div>
    <div class="ov-in rv" data-key="reveal${g.round}" data-settled="${done}">
    <p class="kicker">${ORD[g.round]} ${T.unit} · 원정대 ${teamNames(p.team)}</p>
    <div class="rv-head">${done ? `<p class="vstamp ${ok ? "ok" : "fail"}" style="animation:none">${ok ? T.okV : T.failV}</p>` : `<h2>섞인 카드 ${p.cards.length}장</h2>`}</div>
    <div class="cards">${cards}</div>
    <div class="rv-tally"><span class="a">${T.cardG} <b>${a}</b></span><span class="f">${T.cardB} <b>${f}</b></span></div>
    <p class="lead rv-note">${done ? (ok ? (p.fails ? `${T.cardB} ${p.fails}장이 나왔지만 2장이 필요한 ${T.unit}이라 ${T.okShort}입니다.` : T.okNote) : `${T.cardB} ${p.fails}장. 원정대 안에 ${J(SIDE().evil, "이", "가")} 있습니다.`) : p.need === 2 ? `이번 ${J(T.unit, "은", "는")} ${T.cardB} 2장이 나와야 ${T.dV}` : `${J(T.cardB, "이", "가")} 한 장이라도 섞이면 ${T.dV}`}</p>
    <div class="rv-act">${done ? revealNext() : ""}</div>
    <p class="rv-hint" ${done ? "hidden" : ""}>화면을 누르면 빨리 넘깁니다</p>
  </div>`;
}
// 결과 공개: 섞고 → 한 장씩(뒤로 갈수록 오래) → 판정 도장. 모두의 화면에서 같은 박자로 돈다
async function runReveal() {
  const g = G(); if (!g || g.step !== "missionReveal" || UI.revealed[g.round] === "running") return;
  UI.revealed[g.round] = "running"; UI.fast = false; renderOv();
  const ov = $("ov"), p = g.pending, round = g.round;
  const cards = [...ov.querySelectorAll(".rv .mcard")], m = cards.length;
  await wait(500);
  const row = ov.querySelector(".rv .cards")?.getBoundingClientRect();
  if (row) {
    const mid = row.left + row.width / 2; SFX.shuffle();
    cards.forEach((el, k) => {
      const r = el.getBoundingClientRect(), dx = mid - (r.left + r.width / 2);
      el.animate([{ transform: `translateX(${dx}px) rotate(${(k - m / 2) * 3}deg)` }, { transform: `translateX(${dx + (k % 2 ? 60 : -60)}px) translateY(-10px) rotate(${k % 2 ? 8 : -8}deg)`, offset: .3 },
        { transform: `translateX(${dx}px) rotate(${(m / 2 - k) * 2}deg)`, offset: .55 }, { transform: `translateX(${dx + (k % 2 ? -40 : 40)}px) rotate(${k % 2 ? -6 : 6}deg)`, offset: .75 }, { transform: "none" }], { duration: 1300 * UI.speed, easing: "ease-in-out" });
    });
  }
  await wait(1650);
  let a = 0, f = 0;
  const tally = () => {
    const ea = ov.querySelector(".rv-tally .a b"), ef = ov.querySelector(".rv-tally .f b");
    if (ea && +ea.textContent !== a) { ea.textContent = a; ea.classList.remove("bump"); void ea.offsetWidth; ea.classList.add("bump"); }
    if (ef && +ef.textContent !== f) { ef.textContent = f; ef.classList.remove("bump"); void ef.offsetWidth; ef.classList.add("bump"); }
  };
  for (let k = 0; k < m; k++) {
    if (G()?.round !== round || G()?.step !== "missionReveal") break;
    const el = cards[k], last = k === m - 1;
    const span = m > 1 ? k / (m - 1) : 1, dur = 750 + 1850 * span * span;
    el.classList.add("lift"); SFX.whoosh();
    if (dur > 1200) { ov.classList.add("tense"); el.classList.add("tremble"); }
    const beats = Math.floor(dur / 430);
    for (let b = 0; b < beats; b++) SFX.beat(b * (dur / 1000) / beats * .95, .2 + .2 * (b / beats) * span);
    if (last && dur > 1800) setTimeout(() => el.classList.add("hard"), dur * .6 * UI.speed * (UI.fast ? .12 : 1));
    await wait(dur);
    el.classList.remove("tremble", "hard", "lift"); ov.classList.remove("tense");
    el.classList.add("open"); SFX.flip();
    if (p.cards[k] === "fail") { f++; await wait(180); el.classList.add("hit"); SFX.crack(); flash("red"); shake(ov.querySelector(".ov-in")); }
    else { a++; await wait(150); el.classList.add("glint"); SFX.chime(); }
    tally();
    await wait(p.cards[k] === "fail" ? 1000 : 520);
  }
  await wait(450);
  UI.revealed[round] = "done"; UI.fast = false;
  if (G()?.step !== "missionReveal" || G()?.round !== round) return;
  const ok = p.result === "ok", inn = ov.querySelector(".ov-in");
  if (inn) inn.dataset.settled = "true";
  ov.querySelector(".rv-bg")?.classList.add("on");
  const head = ov.querySelector(".rv-head"); if (head) head.innerHTML = `<p class="vstamp ${ok ? "ok" : "fail"}">${ok ? T.okV : T.failV}</p>`;
  SFX.stamp(); (ok ? SFX.ok : SFX.fail)(); flash(ok ? "gold" : "red"); shake(inn); sparks(ok ? "gold" : "ember");
  const hint = ov.querySelector(".rv-hint"); if (hint) hint.hidden = true;
  const note = ov.querySelector(".rv-note");
  if (note) note.innerHTML = ok ? (p.fails ? `${T.cardB} ${p.fails}장이 나왔지만 2장이 필요한 ${T.unit}이라 ${T.okShort}입니다.` : T.okNote) : `${T.cardB} ${p.fails}장. 원정대 안에 ${J(SIDE().evil, "이", "가")} 있습니다.`;
  await wait(700);
  const act0 = ov.querySelector(".rv-act"); if (act0) { act0.innerHTML = revealNext(); act0.classList.add("after"); }
  renderQuests(); if ($("board")) renderBoard();
}

function rulesHTML() {
  const sizes = [5, 6, 7, 8, 9, 10].map(k => `<tr><td>${k}명</td><td>${SPLIT[k][0]} : ${SPLIT[k][1]}</td>${SIZES[k].map((s, r) => `<td>${s}${needTwo(k, r) ? "*" : ""}</td>`).join("")}</tr>`).join("");
  const codex = ROLE_ORDER.map(k => { const r = T.roles[k]; return `<div class="ent"><img src="${roleArt(k, 0)}" alt=""><div><div class="nm">${r.name} <span class="note">${SIDE()[ROLE_SIDE[k]]}</span></div><div class="ds">${r.blurb}</div></div></div>`; }).join("");
  return `<div class="ov-in" style="width:min(100%,900px)"><button class="btn sm ov-close" data-act="ov-x">닫기</button>
    <h2>${T.title} 놀이법</h2>
    <div class="rules">
      <div><h3>이야기</h3><p>${T.story}</p></div>
      <div><h3>모이기</h3><p>한 사람이 방을 만들고 네 글자 초대 코드나 링크를 나눕니다. 5~10명이 각자 폰이나 컴퓨터로 들어오면 방장이 시작합니다. 말은 같은 자리에서 하거나 음성 통화로, 아니면 화면 옆 이야기 칸으로 합니다.</p></div>
      <div><h3>한 차례</h3><ol>
        <li><b>원정대 꾸리기</b> — ${J(T.mark, "을", "를")} 가진 ${J(T.leader, "이", "가")} 정해진 인원만큼 원정대를 고릅니다. 자기 자신도 됩니다.</li>
        <li><b>표결</b> — 모두 자기 화면에서 찬성 또는 반대. 다 모이면 한꺼번에 열립니다. 과반이 찬성이면 떠나고, 동수는 부결입니다. 부결되면 ${J(T.mark, "이", "가")} 옆 사람에게 넘어갑니다. 한 ${T.unit}에서 <b>다섯 번 연달아</b> 부결되면 ${J(SIDE().evil, "이", "가")} 이깁니다.</li>
        <li><b>원정</b> — 원정대원만 몰래 <b>${T.cardG}</b>${P(T.cardG, "이나", "나")} <b>${T.cardB}</b>${P(T.cardB, "을", "를")} 냅니다. ${J(SIDE().good, "은", "는")} ${T.cardG}만 낼 수 있습니다.</li>
        <li><b>결과</b> — 카드를 섞어 한 장씩 뒤집습니다. ${J(T.cardB, "이", "가")} 한 장이라도 있으면 ${T.failShort}. 7명 이상이면 넷째 ${T.unit}만 ${T.cardB} 2장이 필요합니다.</li>
        <li>결과와 관계없이 ${J(T.mark, "은", "는")} 옆 사람에게 넘어갑니다.</li></ol></div>
      <div><h3>끝</h3><ul><li>${T.unit} 셋이 ${T.dIf} ${SIDE().evil} 승리.</li><li>${T.lit3If} ${J(SIDE().evil, "이", "가")} 정체를 밝히고, ${J(roleName("assassin"), "이", "가")} ${J(roleName("star"), "을", "를")} 한 번 지목합니다. 맞히면 ${SIDE().evil}의 역전승, 틀리면 ${SIDE().good} 승리.</li></ul></div>
      <div><h3>${T.lamp} (선택 규칙)</h3><p>판이 시작될 때 첫 ${T.leader}의 오른쪽 사람이 갖습니다. 둘째·셋째·넷째 ${T.unit}이 끝난 뒤, 가진 사람이 한 명을 골라 그 사람의 편을 몰래 봅니다. 그러면 ${J(T.lamp, "은", "는")} 그 사람에게 넘어가고, 전에 가졌던 사람은 다시 고를 수 없습니다. 본 것을 말할지, 거짓말할지는 자유입니다.</p></div>
      <div><h3>인원과 원정대 크기</h3><div class="tbl"><table><thead><tr><th>인원</th><th>${SIDE().good} : ${SIDE().evil}</th>${ORD.map(o => `<th>${o}</th>`).join("")}</tr></thead><tbody>${sizes}</tbody></table></div>
        <p class="note">* ${T.cardB} 2장이어야 ${T.dRel} ${T.unit}.</p></div>
      <div><h3>역할</h3><div class="codex">${codex}</div></div>
      ${legalHTML()}
    </div><button class="btn gold" data-act="ov-x">알겠어요</button></div>`;
}

// ───────── 손 ─────────
document.addEventListener("click", e => {
  if (UI.revealing && e.target.closest("#ov .rv")) { UI.fast = true; }
  if (e.target.closest("#ov .rv") && G() && UI.revealed[G().round] === "running") UI.fast = true;
  const b = e.target.closest("[data-act]"); if (!b || b.disabled) return;
  const a = b.dataset.act, i = b.dataset.i != null ? +b.dataset.i : null, g = G();
  switch (a) {
    case "goRooms": view = "rooms"; UI.roomsDrawn = false; render(); send({ t: "rooms" }); break;
    case "home": view = "title"; render(); break;
    case "pickTheme": LS.set("ra.theme", b.dataset.v); setTheme(b.dataset.v); render(); break;
    case "sound": pref.sound = !pref.sound; LS.set("ra.pref", pref); renderTop(); if (pref.sound) SFX.ding(); break;
    case "rules": UI.ov = { k: "rules" }; renderOv(); break;
    case "ov-x": UI.ov = null; renderOv(); break;
    case "create": { const nm = needName(); if (!nm) return; send({ t: "create", name: nm, title: $("rt").value, priv: $("rp").checked, theme: LS.get("ra.theme", "knights") }); break; }
    case "joinRoom": { const nm = needName(); if (!nm) return; send({ t: "join", code: b.dataset.code, name: nm }); break; }
    case "joinCode": { const nm = needName(); if (!nm) return; const c = ($("jc").value || "").trim().toUpperCase(); if (c.length !== 4) { toast("네 글자 코드를 적어 주세요"); return; } send({ t: "join", code: c, name: nm }); break; }
    case "copy": navigator.clipboard?.writeText(b.dataset.v).then(() => toast("초대 링크를 복사했어요"), () => toast(b.dataset.v)); break;
    case "kick": send({ t: "kick", id: +b.dataset.id }); break;
    case "cfgOpt": send({ t: "cfg", opt: b.dataset.k }); break;
    case "cfgLamp": send({ t: "cfg", lamp: !R.cfg.lamp }); break;
    case "cfgPriv": send({ t: "cfg", priv: !R.cfg.priv }); break;
    case "cfgReset": send({ t: "cfg", reset: true }); break;
    case "cfgSet": { const k = b.dataset.k, v = k === "theme" ? b.dataset.v : +b.dataset.v; send({ t: "cfg", [k]: v }); break; }
    case "start": send({ t: "start" }); break;
    case "leave": UI.ov = { k: "leave" }; renderOv(); break;
    case "leave-yes": UI.ov = null; send({ t: "leave" }); break;
    case "abort": UI.ov = { k: "abort" }; renderOv(); break;
    case "abort-yes": UI.ov = null; send({ t: "abort" }); break;
    case "again": send({ t: "again" }); break;
    case "myrole": UI.ov = { k: "role" }; UI.roleOpen = false; renderOv(); break;
    case "roleShow": UI.roleOpen = true; SFX.flip(); renderOv(); break;
    case "roleHide": UI.roleOpen = false; renderOv(); break;
    case "seen": UI.roleOpen = false; UI.ov = null; act({ a: "seen" }); renderOv(); break;
    case "pick": act({ a: "pick", i }); SFX.place(); break;
    case "propose": act({ a: "propose" }); SFX.whoosh(); break;
    case "vote": act({ a: "vote", v: b.dataset.v === "1" }); SFX.seal(b.dataset.v === "1"); break;
    case "next": UI.reopen = false; act({ a: "next" }); break;
    case "openMission": UI.ov = { k: "mission" }; renderOv(); break;
    case "card": {
      const box = b.closest(".cards"); if (box.classList.contains("chosen")) break;
      box.classList.add("chosen"); b.classList.add("go"); SFX.flip();
      setTimeout(() => { UI.ov = null; act({ a: "card", v: b.dataset.v }); SFX.place(); renderOv(); }, 520);
      break;
    }
    case "closeReveal": UI.reopen = false; UI.revealed[g.round] = "done"; $("ov").innerHTML = ""; $("ov").hidden = true; document.body.style.overflow = ""; renderBoard(); break;
    case "reopenReveal": UI.reopen = true; $("ov").innerHTML = ""; renderOv(); break;
    case "lampPick": act({ a: "pick", i }); UI.ov = { k: "lamp" }; SFX.lamp(); break;
    case "lampShow": UI.ov = { k: "lamp" }; renderOv(); break;
    case "lampDone": UI.ov = null; act({ a: "done" }); renderOv(); break;
    case "chatTog": UI.chatOpen = !UI.chatOpen; $("chatp")?.classList.toggle("open", UI.chatOpen); b.textContent = UI.chatOpen ? "▾" : "▴"; scrollChat(); break;
    case "target": act({ a: "target", i }); SFX.beat(0, .3); break;
    case "kill": act({ a: "kill" }); break;
  }
});
document.addEventListener("submit", e => {
  const f = e.target.closest("[data-form]"); if (!f) return;
  e.preventDefault();
  const inp = f.querySelector("input"), text = inp.value.trim(); if (!text) return;
  send({ t: "chat", text }); inp.value = "";
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && UI.ov && ["rules", "leave", "abort"].includes(UI.ov.k)) { UI.ov = null; renderOv(); }
  if (e.key === "Enter" && e.target.id === "jc") document.querySelector('[data-act="joinCode"]')?.click();
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && wsWanted && (!ws || ws.readyState > 1)) connect(); });

// 저절로 넘어가기까지 남은 초
setInterval(() => {
  document.querySelectorAll(".autonext").forEach(el => {
    const at = +el.dataset.auto, cd = el.querySelector(".cd"); if (!cd) return;
    const skew = R ? (R.now - R._recv || 0) : 0;
    const left = at ? Math.max(0, Math.ceil((at - (Date.now() + skew)) / 1000)) : 0;
    cd.textContent = at ? (left ? `${left}초 뒤 넘어갑니다` : "넘어가는 중") : "곧 넘어갑니다";
  });
}, 250);

// ───────── 시작 ─────────
setTheme(THEME_IDS.includes(LS.get("ra.theme", "knights")) ? LS.get("ra.theme", "knights") : "knights");
if (sess || inviteCode) view = "rooms";
render();
connect();
window.__ra = { get R() { return R; }, get UI() { return UI; }, speed: v => { UI.speed = v; }, send };
