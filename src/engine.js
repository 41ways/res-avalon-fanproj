/**
 * 판의 규칙. 이름·문구는 없다(테마가 화면에서 붙인다). 자리 번호(seat)로만 다룬다.
 *
 * 흐름: reveal → team → vote → voteResult → mission → missionReveal → (lamp) → … → assassin → end
 * 비밀: 역할·아는 것·등불로 본 편은 view(seat) 에 그 사람 몫만 담긴다. 표는 모두 낸 뒤에야 공개된다.
 */
export const SPLIT = { 5: [3, 2], 6: [4, 2], 7: [4, 3], 8: [5, 3], 9: [6, 3], 10: [6, 4] };
export const SIZES = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5], 10: [3, 4, 4, 5, 5] };
export const SIDE = { guard: "good", star: "good", watch: "good", spy: "evil", assassin: "evil", wisp: "evil", newmoon: "evil", wander: "evil" };
export const ART_N = { guard: 3, spy: 2 };          // 같은 역할이 여럿일 때 그림을 돌려 쓴다(테마가 가진 만큼 화면에서 나눈다)
export const MIN = 5, MAX = 10;
export const LAMP_AFTER = [1, 2, 3];                  // 둘째·셋째·넷째 원정 뒤
export const needTwo = (n, r) => n >= 7 && r === 3;
export const defaultOpts = n => ({ watch: true, wisp: true, newmoon: n === 7 || n >= 9, wander: n === 10 });
const EVIL_SPECIAL = ["wisp", "newmoon", "wander"];

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function composition(n, opts) {
  const [good, evil] = SPLIT[n], o = opts || defaultOpts(n);
  const g = ["star"]; if (o.watch) g.push("watch"); while (g.length < good) g.push("guard");
  const e = ["assassin"]; EVIL_SPECIAL.forEach(k => { if (o[k] && e.length < evil) e.push(k); }); while (e.length < evil) e.push("spy");
  return { g, e };
}

export class Game {
  /** players: [{ id, name }] 자리 순서대로 */
  constructor(players, cfg = {}) {
    const n = players.length;
    if (!SPLIT[n]) throw new Error(`${MIN}~${MAX}명만 할 수 있어요.`);
    const { g, e } = composition(n, cfg.opts);
    const roles = shuffle([...g, ...e]);
    const artSeen = {};
    this.n = n;
    this.players = players.map((p, i) => {
      const r = roles[i];
      artSeen[r] = (artSeen[r] ?? Math.floor(Math.random() * 6)) + 1;
      return { id: p.id, name: p.name, role: r, art: artSeen[r] };
    });
    this.lampOn = !!cfg.lamp;
    this.timer = cfg.timer || 0;
    this.seen = players.map(() => false);
    this.round = 0;
    this.quests = [null, null, null, null, null];
    this.leader = Math.floor(Math.random() * n);
    this.rejects = 0;
    this.team = [];
    this.votes = {};             // seat → true/false (공개 전엔 누가 냈는지만 보인다)
    this.cards = {};             // seat → "ok"/"fail"
    this.pending = null;
    this.history = [];
    this.lamp = this.lampOn ? { holder: (this.leader - 1 + n) % n, past: [(this.leader - 1 + n) % n], log: [], pick: null, seen: {} } : null;
    this.target = null;
    this.winner = null; this.reason = null;
    this.step = "reveal";
    this.stepAt = Date.now();
    this.teamEnds = 0;
    this.seq = 0;
    this.fx = null;              // 화면 연출 한 번: { k: "depart" | "reveal" | "vote" | "band" … }
  }

  seatOf(id) { return this.players.findIndex(p => p.id === id); }
  side(i) { return SIDE[this.players[i].role]; }
  need() { return SIZES[this.n][this.round]; }
  okCount() { return this.quests.filter(q => q && q.result === "ok").length; }
  failCount() { return this.quests.filter(q => q && q.result === "fail").length; }
  set(step, fx) { this.step = step; this.stepAt = Date.now(); this.fx = fx || null; this.seq++; }

  /** 사람 하나의 조작. 잘못된 조작은 Error 로 알린다 */
  act(id, m) {
    const i = this.seatOf(id);
    if (i < 0) throw new Error("이 판의 자리가 아니에요.");
    const a = m && m.a;
    switch (this.step) {
      case "reveal":
        if (a !== "seen") break;
        this.seen[i] = true; this.seq++;
        if (this.seen.every(Boolean)) this.beginRound(true);
        return;
      case "team":
        if (i !== this.leader) throw new Error(`대장만 원정대를 고를 수 있어요.`);
        if (a === "pick") {
          const t = m.i | 0; if (t < 0 || t >= this.n) return;
          const at = this.team.indexOf(t);
          if (at >= 0) this.team.splice(at, 1);
          else if (this.team.length < this.need()) this.team.push(t);
          else throw new Error(`원정대는 ${this.need()}명이에요. 먼저 한 명을 빼세요.`);
          this.seq++; return;
        }
        if (a === "propose") {
          if (this.team.length !== this.need()) throw new Error(`${this.need()}명을 골라야 해요.`);
          this.votes = {}; this.set("vote"); return;
        }
        break;
      case "vote":
        if (a !== "vote") break;
        this.votes[i] = !!m.v; this.seq++;
        if (Object.keys(this.votes).length === this.n) this.resolveVote();
        return;
      case "voteResult":
        if (a !== "next") break;
        if (i !== this.leader && !m.host) throw new Error("대장이 넘깁니다.");
        return this.afterVote();
      case "mission":
        if (a !== "card") break;
        if (!this.team.includes(i)) throw new Error("원정대만 카드를 냅니다.");
        if (this.cards[i]) throw new Error("이미 냈어요.");
        if (m.v !== "ok" && m.v !== "fail") return;
        if (m.v === "fail" && this.side(i) === "good") throw new Error("이 편은 성공 카드만 낼 수 있어요.");
        this.cards[i] = m.v; this.seq++;
        if (Object.keys(this.cards).length === this.team.length) this.settleMission();
        return;
      case "missionReveal":
        if (a !== "next") break;
        if (i !== this.leader && !m.host) throw new Error("대장이 넘깁니다.");
        return this.afterMission();
      case "lamp": {
        const L = this.lamp;
        if (i !== L.holder) throw new Error("등불을 가진 사람만 고릅니다.");
        if (a === "pick") {
          const t = m.i | 0;
          if (L.pick != null) return;                     // 이미 봤다
          if (t === L.holder || L.past.includes(t) || t < 0 || t >= this.n) throw new Error("고를 수 없는 사람이에요.");
          L.pick = t; (L.seen[L.holder] = L.seen[L.holder] || []).push({ seat: t, side: this.side(t), round: this.round });
          this.seq++; return;
        }
        if (a === "done" && L.pick != null) {
          L.log.push({ from: L.holder, to: L.pick, round: this.round });
          L.past.push(L.pick); L.holder = L.pick; L.pick = null;
          return this.nextRound();
        }
        break;
      }
      case "assassin": {
        if (this.players[i].role !== "assassin") throw new Error("지목은 암살 역할이 합니다.");
        if (a === "target") { const t = m.i | 0; if (t < 0 || t >= this.n || this.side(t) === "evil") return; this.target = t; this.seq++; return; }
        if (a === "kill" && this.target != null) {
          const star = this.players.findIndex(p => p.role === "star"), hit = this.target === star;
          return this.end(hit ? "evil" : "good", hit ? "hit" : "miss");
        }
        break;
      }
    }
  }

  beginRound(first) {
    this.team = []; this.votes = {}; this.cards = {}; this.pending = null;
    this.teamEnds = this.timer ? Date.now() + this.timer * 1000 : 0;
    this.set("team", { k: "band", first: !!first });
  }
  resolveVote() {
    const yes = Object.values(this.votes).filter(Boolean).length, ok = yes * 2 > this.n;
    this.history.push({ round: this.round, attempt: this.rejects + 1, leader: this.leader, team: this.team.slice(), votes: this.players.map((_, k) => !!this.votes[k]), ok });
    if (!ok) this.rejects++;
    this.set("voteResult", { k: "vote" });
  }
  afterVote() {
    const last = this.history[this.history.length - 1];
    if (last.ok) { this.cards = {}; this.set("mission", { k: "depart" }); return; }
    if (this.rejects >= 5) return this.end("evil", "reject5");
    this.leader = (this.leader + 1) % this.n;
    this.beginRound(false);
    this.fx = { k: "reject", n: this.rejects };
  }
  settleMission() {
    const all = this.team.map(k => this.cards[k]);
    const fails = all.filter(x => x === "fail").length, need = needTwo(this.n, this.round) ? 2 : 1;
    // 성공 카드를 먼저, 실패를 뒤로 — 누가 냈는지는 남기지 않는다
    const order = [...all.filter(x => x === "ok"), ...all.filter(x => x === "fail")];
    this.pending = { result: fails >= need ? "fail" : "ok", fails, team: this.team.slice(), cards: order, need };
    this.quests[this.round] = this.pending;
    this.cards = {};
    this.set("missionReveal", { k: "reveal" });
  }
  afterMission() {
    if (this.failCount() >= 3) return this.end("evil", "fail3");
    if (this.okCount() >= 3) { this.target = null; this.set("assassin", { k: "unmask" }); return; }
    if (this.lamp && LAMP_AFTER.includes(this.round)) { this.lamp.pick = null; this.set("lamp", { k: "lamp" }); return; }
    this.nextRound();
  }
  nextRound() {
    this.round++; this.rejects = 0; this.leader = (this.leader + 1) % this.n;
    this.beginRound(false);
  }
  end(winner, reason) { this.winner = winner; this.reason = reason; this.set("end", { k: "end" }); }

  /** seat 의 눈으로 본 판. seat 가 null 이면 구경꾼(비밀 없음) */
  view(seat) {
    const me = seat != null && seat >= 0 ? seat : null, P = this.players, end = this.step === "end";
    const unmask = this.step === "assassin" || end;
    const v = {
      n: this.n, step: this.step, seq: this.seq, stepAt: this.stepAt, fx: this.fx,
      round: this.round, leader: this.leader, rejects: this.rejects, team: this.team.slice(),
      quests: this.quests, history: this.history, sizes: SIZES[this.n], needTwo: needTwo(this.n, 3) ? 3 : -1,
      teamEnds: this.teamEnds,
      seats: P.map((p, i) => ({
        id: p.id, name: p.name, seen: this.seen[i],
        role: end || i === me || (unmask && SIDE[p.role] === "evil") ? p.role : null,
        art: end || i === me || (unmask && SIDE[p.role] === "evil") ? p.art : null,
      })),
      voted: this.step === "vote" ? P.map((_, i) => this.votes[i] != null) : null,
      carded: this.step === "mission" ? this.team.map(i => this.cards[i] != null) : null,
      pending: this.step === "missionReveal" ? this.pending : null,
      lamp: this.lamp ? { holder: this.lamp.holder, past: this.lamp.past, log: this.lamp.log, pick: this.step === "lamp" ? this.lamp.pick : null } : null,
      target: this.target, winner: this.winner, reason: this.reason,
      composition: Object.entries(P.reduce((m, p) => (m[p.role] = (m[p.role] || 0) + 1, m), {})),
    };
    if (me != null) {
      v.me = me;
      v.myVote = this.step === "vote" && this.votes[me] != null ? this.votes[me] : null;
      v.myCard = this.step === "mission" && this.cards[me] ? this.cards[me] : null;
      v.know = this.knowledge(me);
      v.lampSeen = this.lamp ? (this.lamp.seen[me] || []) : [];
    }
    return v;
  }

  knowledge(i) {
    this._kn = this._kn || {};
    return this._kn[i] || (this._kn[i] = this._know(i));
  }
  _know(i) {
    const P = this.players, r = P[i].role, has = k => P.some(p => p.role === k);
    const others = P.map((_, j) => j).filter(j => j !== i);
    if (r === "star") return { kind: "star", seats: others.filter(j => SIDE[P[j].role] === "evil" && P[j].role !== "newmoon"), hidden: has("newmoon") };
    if (r === "watch") return { kind: "watch", seats: shuffle(others.filter(j => ["star", "wisp"].includes(P[j].role))) };
    if (r === "wander") return { kind: "wander", seats: [] };
    if (SIDE[r] === "evil") return { kind: "evil", seats: others.filter(j => SIDE[P[j].role] === "evil" && P[j].role !== "wander"), wander: has("wander") };
    return { kind: "none", seats: [] };
  }
}
