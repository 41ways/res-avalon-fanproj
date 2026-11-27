// 테마 두 가지. 규칙은 같고 이름·그림·문구만 다르다. 온라인(app.js)과 한 기기 모드(local.html)가 같이 쓴다.
// 역할 키: guard 평범한 선 · star 악을 아는 자 · watch 둘을 보는 자 · spy 평범한 악 · assassin 마지막 지목
//          wisp 둘 중 가짜 · newmoon 보이지 않는 악 · wander 홀로 다니는 악
export const ROLE_SIDE = { guard: "good", star: "good", watch: "good", spy: "evil", assassin: "evil", wisp: "evil", newmoon: "evil", wander: "evil" };
export const ROLE_ORDER = ["star", "watch", "guard", "assassin", "wisp", "newmoon", "wander", "spy"];

// 그림: 테마 폴더에 없으면 common 폴더. 확장자가 webp 가 아니면 ext 에 적는다
const COMMON = { table: "webp", seal_yes: "webp", seal_no: "webp", lantern: "svg" };

export const THEMES = {
  knights: {
    id: "knights", title: "은빛 서약", tagline: "다섯 원정, 숨은 그림자", pick: "성채의 기사단, 다섯 원정 속 그림자",
    dir: "knights", ext: {},
    roles: {
      guard:    { name: "서약 기사", art: ["guardA", "guardB", "guardC"], blurb: "은빛 서약을 맺은 기사. 아는 것은 없지만 표와 말로 배신자를 가려낼 수 있다.",
                  tip: "누가 원정을 망쳤는지 기록을 보며 따져 보세요. 실패한 원정에 계속 끼는 사람이 수상합니다." },
      star:     { name: "점성술사", art: ["star"], blurb: "별자리로 그림자단의 얼굴을 읽는다. 너무 티를 내면 마지막에 암살자가 찾아온다.",
                  tip: "아는 걸 대놓고 말하면 마지막에 암살자가 당신을 찾아냅니다. 표와 은근한 말로 이끄세요." },
      watch:    { name: "방패지기", art: ["watch"], blurb: "등불 아래 두 사람의 기운을 느낀다. 하나는 진짜 점성술사, 하나는 흉내 내는 거울 마녀.",
                  tip: "진짜 점성술사를 알아내 그 뜻을 따르고, 암살자의 눈을 당신에게 돌려 점성술사를 지키세요." },
      spy:      { name: "배신 기사", art: ["spyA", "spyB"], blurb: "서약을 저버리고 그림자단에 붙은 기사. 동료를 알고, 원정에서 배신할 수 있다.",
                  tip: "처음 원정부터 배신하면 바로 들킵니다. 신뢰를 쌓고 결정적인 원정에서 배신하세요." },
      assassin: { name: "암살자", art: ["assassin"], blurb: "원정이 세 번 성공하면 정체를 드러내고 점성술사를 찾아 단 한 번 지목한다.",
                  tip: "판 내내 누가 그림자단을 너무 잘 아는지 지켜보세요. 마지막 지목이 당신 몫입니다." },
      wisp:     { name: "거울 마녀", art: ["wisp"], blurb: "점성술사의 모습을 비추는 마녀. 방패지기 눈에는 점성술사와 똑같이 보인다.",
                  tip: "점성술사인 척하세요. 방패지기가 당신을 믿게 만들면 서약단이 흔들립니다." },
      newmoon:  { name: "가면 군주", art: ["newmoon"], blurb: "그림자단의 우두머리. 점성술사의 별자리에도 잡히지 않는다.",
                  tip: "점성술사도 당신을 모릅니다. 가장 믿음직한 서약 기사처럼 행동하세요." },
      wander:   { name: "떠돌이 용병", art: ["wander"], blurb: "돈으로 그림자단에 붙은 칼. 동료를 모르고, 동료도 그를 모른다. 점성술사에게는 보인다.",
                  tip: "누가 동료인지 모르니 원정 결과와 표를 보고 짐작하세요. 동료들도 당신을 찾고 있습니다." },
    },
    side: { good: "서약단", evil: "그림자단" },
    unit: "원정", leader: "단장", mark: "왕관", cardG: "충성", cardB: "배신",
    okShort: "성공", failShort: "실패", okV: "원정 성공", failV: "원정 실패",
    dV: "실패합니다", dIf: "실패하면", dRel: "실패하는", lit3: "원정이 세 번 성공했다", lit3If: "원정이 세 번 성공하면",
    goalG: "다섯 원정 중 셋을 성공시키면 이깁니다.", goalE: "원정 셋을 실패시키거나 마지막에 점성술사를 찾으면 이깁니다.",
    depart: "원정 출발", winG: "성채를 지켰다", winE: "성채가 무너졌다",
    reject5: r => `${r} 원정에서 원정대가 다섯 번 연달아 부결됐습니다. 흩어진 기사단 위로 그림자가 내려앉았습니다.`,
    fail3: "원정 세 번이 배신으로 무너졌습니다. 성채는 그림자단의 손에 떨어졌습니다.",
    okNote: "모두 충성했습니다. 성채에 한 걸음 가까워졌습니다.",
    lamp: "진실의 등불", lampSee: "등불 아래 비쳐요",
    kn: {
      starH: "별자리에 비친 그림자", starHidden: "가면 군주는 별자리에 잡히지 않아 이 목록에 없습니다.",
      watchH: "등불에 비친 두 기운", watch2: "둘 중 하나는 진짜 점성술사, 하나는 거울 마녀입니다. 진짜를 지켜 주세요.",
      wanderH: "홀로 받은 금화", evilH: "함께하는 그림자", wanderHere: "떠돌이 용병 하나가 어딘가에 홀로 숨어 있습니다. 서로 모릅니다.",
      guardSub: "표와 말로 배신자를 가려내세요.",
    },
    story: "왕이 비운 성채를 지키는 은빛 서약단. 다섯 원정 가운데 셋을 성공시켜야 성채가 버팁니다. 그런데 서약을 맺은 기사들 틈에 그림자단이 섞여 있습니다.",
    opts: { watch: "점성술사와 거울 마녀, 두 기운을 느낀다", wisp: "방패지기에게 점성술사로 보인다", newmoon: "점성술사에게 보이지 않는다", wander: "그림자단끼리도 서로 모른다" },
  },
  bonghwa: {
    id: "bonghwa", title: "봉화", tagline: "다섯 봉우리에 불을 올려라", pick: "조선의 산골, 다섯 봉수대에 불을 올리는 밤",
    dir: "bonghwa", ext: { crown: "svg", token: "svg", sh_ok: "svg", sh_fail: "svg", sh_empty: "svg", q_ok: "svg", q_fail: "svg" },
    roles: {
      guard:    { name: "봉수군", art: ["guardA", "guardB"], blurb: "봉우리에 불을 올리는 산골 사람. 아는 것은 없지만 표와 말로 밀정을 가려낼 수 있다.",
                  tip: "누가 불을 꺼뜨렸는지 기록을 보며 따져 보세요. 꺼진 봉우리에 계속 끼는 사람이 수상합니다." },
      star:     { name: "별지기", art: ["star"], blurb: "별을 읽어 먹구름의 얼굴을 안다. 너무 티를 내면 마지막에 자객이 찾아온다.",
                  tip: "아는 걸 대놓고 말하면 마지막에 자객이 당신을 찾아냅니다. 표와 은근한 말로 이끄세요." },
      watch:    { name: "파수꾼", art: ["watch"], blurb: "벼랑 끝에서 불빛 둘을 본다. 하나는 진짜 별지기, 하나는 흉내 내는 도깨비불.",
                  tip: "진짜 별지기를 알아내 그 뜻을 따르고, 자객의 눈을 당신에게 돌려 별지기를 지키세요." },
      spy:      { name: "밀정", art: ["spyA", "spyB"], blurb: "마을 사람 얼굴을 한 먹구름의 끄나풀. 동료를 알고, 원정에서 찬물을 부을 수 있다.",
                  tip: "처음부터 찬물을 부으면 바로 들킵니다. 신뢰를 쌓고 결정적인 봉우리에서 부으세요." },
      assassin: { name: "자객", art: ["assassin"], blurb: "불이 세 번 오르면 정체를 드러내고 별지기를 찾아 단 한 번 지목한다.",
                  tip: "판 내내 누가 먹구름을 너무 잘 아는지 지켜보세요. 마지막 지목이 당신 몫입니다." },
      wisp:     { name: "도깨비불", art: ["wisp"], blurb: "별지기 흉내를 내는 혼불. 파수꾼 눈에는 별지기와 똑같이 보인다.",
                  tip: "별지기인 척하세요. 파수꾼이 당신을 믿게 만들면 봉수대가 흔들립니다." },
      newmoon:  { name: "그믐", art: ["newmoon"], blurb: "달 없는 밤 같은 자. 별지기의 눈에도 잡히지 않는다.",
                  tip: "별지기도 당신을 모릅니다. 가장 믿음직한 봉수군처럼 행동하세요." },
      wander:   { name: "떠돌이", art: ["wander"], blurb: "먹구름 편이지만 홀로 다닌다. 동료를 모르고, 동료도 그를 모른다. 별지기에게는 보인다.",
                  tip: "누가 동료인지 모르니 결과와 표를 보고 짐작하세요. 동료들도 당신을 찾고 있습니다." },
    },
    side: { good: "봉수대", evil: "먹구름" },
    unit: "봉우리", leader: "봉수장", mark: "횃불", cardG: "불씨", cardB: "찬물",
    okShort: "타오름", failShort: "꺼짐", okV: "불이 올랐다", failV: "불이 꺼졌다",
    dV: "꺼집니다", dIf: "꺼지면", dRel: "꺼지는", lit3: "불이 세 번 올랐다", lit3If: "불이 세 번 오르면",
    goalG: "다섯 봉우리 중 셋에 불을 올리면 이깁니다.", goalE: "봉우리 셋을 꺼뜨리거나 마지막에 별지기를 찾으면 이깁니다.",
    depart: "봉화를 올리러", winG: "새벽이 왔다", winE: "먹구름이 삼켰다",
    reject5: r => `${r} 봉우리에서 다섯 번 연달아 원정이 부결됐습니다. 먹구름이 산을 덮었습니다.`,
    fail3: "봉우리 세 곳이 찬물에 꺼졌습니다. 새벽은 오지 않습니다.",
    okNote: "모두 불씨를 냈습니다. 새벽에 한 걸음 가까워졌습니다.",
    lamp: "청사초롱", lampSee: "초롱 불빛에 비쳐요",
    kn: {
      starH: "별빛에 비친 먹구름", starHidden: "그믐 하나는 별빛에 잡히지 않아 이 목록에 없습니다.",
      watchH: "멀리 보이는 불빛", watch2: "둘 중 하나는 진짜 별지기, 하나는 도깨비불입니다. 진짜를 지켜 주세요.",
      wanderH: "홀로 걷는 길", evilH: "함께하는 먹구름", wanderHere: "떠돌이 하나가 어딘가에 홀로 숨어 있습니다. 서로 모릅니다.",
      guardSub: "표와 말로 밀정을 가려내세요.",
    },
    story: "긴 밤이 내려앉은 산골. 다섯 봉우리 봉수대에 불을 올려야 아랫마을에 새벽이 옵니다. 그런데 봉수대 사람들 틈에 먹구름의 밀정이 섞여 있습니다.",
    opts: { watch: "별지기와 도깨비불, 불빛 둘을 본다", wisp: "파수꾼에게 별지기로 보인다", newmoon: "별지기에게 보이지 않는다", wander: "먹구름끼리도 서로 모른다" },
  },
};
// 봉화는 데이터·그림을 남겨 두고 잠시 숨긴다(기사단 테마부터 마무리). 다시 켜려면 여기에 "bonghwa" 를 넣는다
export const THEME_IDS = ["knights"];

export function artURL(theme, k, base = "art/") {
  const T = THEMES[theme] || THEMES.knights;
  if (COMMON[k] && !(k in T.ext)) return `${base}common/${k}.${COMMON[k]}`;
  return `${base}${T.dir}/${k}.${T.ext[k] || "webp"}`;
}

// 한국어 조사: J("자객", "이", "가") → "자객이"
export const J = (w, a, b) => { const c = w.charCodeAt(w.length - 1); if (c < 0xAC00 || c > 0xD7A3) return `${w}${a}(${b})`; return w + ((c - 0xAC00) % 28 ? a : b); };
export const P = (w, a, b) => J(w, a, b).slice(w.length);
