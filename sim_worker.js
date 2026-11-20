// 미니 배틀 실행기: 프런티어 배틀 엔진 + AI (제작자 허락: 비상업·포스터 체험판 공개)
// 페이지 → { kind: "start", teams: [나, 상대], seed } / { kind: "choose", choice }
// 페이지 ← { kind: "state", view, events, request(내 선택지), ai(이번 턴 상대가 실제로 고른 것), over }
const V = "2026-11-03.1";
let obs, aiMsg, C, b, rid = 1, seed = 1, know, logPos = 0, MSG = {}, EN = {};
// 게임 공식 한국어 대사(battle_msgs.json, 프런티어 엔진에 들어 있던 것) + 영어 이름 → 한국어
const STAT = { Attack: "공격", Defense: "방어", "Sp. Atk": "특수공격", "Special Attack": "특수공격", "Sp. Def": "특수방어", "Special Defense": "특수방어", Speed: "스피드", accuracy: "명중률", Accuracy: "명중률", evasiveness: "회피율", Evasiveness: "회피율" };
const jong = ch => { const c = ch.charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : /[178]/.test(ch) ? 8 : /[036]/.test(ch) ? 1 : 0; };
const PART = { "은(는)": j => j ? "은" : "는", "이(가)": j => j ? "이" : "가", "을(를)": j => j ? "을" : "를", "과(와)": j => j ? "과" : "와", "(으)로": j => j && j !== 8 ? "으로" : "로", "아(야)": j => j ? "아" : "야" };
function ko(t) {
  const s = t && t.messageId && MSG[t.messageId]; if (!s) return "";
  const vals = (t.values || []).map(v => { v = String(v).replace(/^\[from\]\s*/, "").replace(/^(move|item|ability):\s*/, ""); return EN[v] || STAT[v] || v; });
  return s.replace(/\{(\d+)\}/g, (_, i) => vals[i - 1] ?? "")
    .replace(/(.)(은\(는\)|이\(가\)|을\(를\)|과\(와\)|\(으\)로|아\(야\))/g, (_, ch, p) => ch + PART[p](jong(ch)));
}
const ready = (async () => {
  const content = await import("./frontier/assets/workers/content.js");
  await content.i(undefined, V);
  C = content.t;
  obs = await import("./frontier/assets/workers/observation.js");
  await import("./frontier/assets/workers/ai-handler.js");  // self.onmessage를 자기 것으로 바꿈 → 받아 두고 되돌림
  aiMsg = self.onmessage; self.onmessage = onMsg;
  MSG = await (await fetch("battle_msgs.json")).json();
  for (const tb of ["species", "moves", "items", "abilities", "fieldEffects"]) for (const x of Object.values(C[tb])) if (x.name && x.nameKo) EN[x.name] = x.nameKo;
  for (const [id, t] of Object.entries(C.types)) if (t.nameKo) EN[id] = t.nameKo;  // "Bug타입" → "벌레타입"
  const abil = {}, typeKo = {};
  const items = {};
  for (const [id, x] of Object.entries(C.items)) if (x.champions && x.isBattleItem) items[id] = { ko: x.nameKo || x.name, mega: (x.flags || []).includes("MegaStone") };
  for (const [id, a] of Object.entries(C.abilities)) abil[id] = { ko: a.nameKo || a.name, desc: a.descriptionKo || "" };
  for (const [id, t] of Object.entries(C.types)) typeKo[id] = t.nameKo || id;
  const CAT = { Physical: "물리", Special: "특수", Status: "변화" }, ko = {}, names = {}, moveKo = {}, moveCat = {}, moveType = {};
  const base = {};  // 따라큐(정체 드러남) 같은 다른 모습 → 기본 모습 (그림이 없을 때 대신 씀)
  for (const [id, s] of Object.entries(C.species)) { ko[id] = s.nameKo || s.name; names[id] = s.name; const b = (s.baseSpecies || "").toLowerCase().replace(/[^a-z0-9]/g, ""); if (b && b !== id) base[id] = b; }
  for (const [id, m] of Object.entries(C.moves)) { moveKo[id] = m.nameKo || m.name; moveCat[id] = CAT[m.category] || ""; moveType[id] = m.type || ""; }
  self.postMessage({ kind: "ready", ko, names, moveKo, moveCat, moveType, abil, typeKo, base, items });
})().catch(e => self.postMessage({ kind: "error", message: "준비 실패: " + (e.message || e) }));

const kindOf = c => c.kind === "switch" ? "교체" : C.moves[c.move]?.category === "Status" ? "변화" : "공격";
function aiDecide() {  // 상대(p2) 차례면 AI가 고르고 적용
  const req = obs.c(b, "p2", rid); if (!req) return null;
  let got = null; const realPost = self.postMessage.bind(self);
  self.postMessage = m => { got = m; };
  try { aiMsg({ data: { kind: "think", battleId: "mini", contentVersion: V, observation: obs.n(b, "p2", rid, (seed + rid * 2654435761) >>> 0, know) } }); }
  finally { self.postMessage = realPost; }
  if (!got || got.kind !== "ai") throw new Error(got?.message || "AI 응답 없음");
  obs.s(b, "p2", got.decision.choice);
  return { choice: got.decision.choice, kind: kindOf(got.decision.choice), forced: req.kind !== "move" };
}
function reply(ai) {
  const log = b.log.slice(logPos); logPos = b.log.length;
  obs.r(b, log, know);  // AI가 아는 정보(공개된 도구·기술) 갱신
  const events = obs.l(b, log);
  for (const e of events) e.ko = ko(e.text);
  self.postMessage({ kind: "state", view: obs.a(b, false), events, request: obs.c(b, "p1", rid), ai, over: !!b.ended });
}
function onMsg({ data }) {
  ready.then(() => {
    try {
      if (data.kind === "start") {
        seed = data.seed || 1; rid = 1; logPos = 0; know = obs.t();
        b = obs.d(data.teams, ["나", "상대"], seed);
        return reply(null);
      }
      if (data.kind === "choose") {
        let ai = null;
        const mine = obs.c(b, "p1", rid);
        if (!mine || !mine.choices.some(c => JSON.stringify(c) === JSON.stringify(data.choice))) throw new Error("지금은 그 행동을 할 수 없어요");
        if (obs.c(b, "p2", rid)) ai = aiDecide();  // 같은 턴: 상대도 동시에 고름
        obs.s(b, "p1", data.choice); rid++;
        // 상대만 골라야 하는 경우(상대 포켓몬이 쓰러져 교체 등)는 바로 AI가 처리
        while (!b.ended && !obs.c(b, "p1", rid) && obs.c(b, "p2", rid)) { const f = aiDecide(); if (!ai) ai = f; rid++; }
        return reply(ai);
      }
    } catch (e) { self.postMessage({ kind: "error", message: String(e.message || e) }); }
  });
}
self.onmessage = onMsg;
