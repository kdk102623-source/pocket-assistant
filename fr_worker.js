// 프런티어 AI 실시간 판단 (로컬 PC 서버 전용 — 프런티어 코드는 비상업 사용 허락, 재배포 안 함)
// 페이지가 보낸 지금 상황(상대=AI, 나=플레이어)을 프런티어 배틀로 만들어 AI에게 묻고, 고른 행동과 행동 종류별 최고 점수를 돌려줌.
const V = "2026-11-03.1";
const norm = s => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
let obs, aiMsg, SETS, MV;
const mine = async ({ data }) => {
  const res = { id: data.id };
  try { Object.assign(res, judge(data)); } catch (e) { res.error = String(e.message || e).slice(0, 200); }
  self.postMessage(res);
};
(async () => {
  const content = await import("/frontier/assets/workers/content.js");
  await content.i(undefined, V);
  obs = await import("/frontier/assets/workers/observation.js");
  await import("/frontier/assets/workers/ai-handler.js");  // 이 파일이 self.onmessage를 자기 것으로 바꿈 → 받아 두고 우리 것으로 되돌림
  aiMsg = self.onmessage; self.onmessage = mine;
  SETS = await (await fetch("/frontier/sets.json")).json();
  MV = content.t.moves;
  self.postMessage({ kind: "ready" });
})().catch(e => self.postMessage({ kind: "fail", error: String(e.message || e) }));

function sideOf(s) {  // { sp, team:[이름], hp, status, boosts, alive, moves:[기술 id] }
  const names = [s.sp, ...s.team.filter(x => x && x !== s.sp)].slice(0, 3);
  const team = [], megaOf = [];
  for (const [i, nm] of names.entries()) {
    const base = SETS[norm(nm)] || SETS[norm(String(nm).split("-")[0])];
    if (!base) { if (i === 0) throw new Error("세트 없음: " + nm); continue; }
    const set = JSON.parse(JSON.stringify(base)); megaOf.push(set._mega && norm(nm) === set._mega ? set._mega : null);
    if (i === 0 && s.moves?.length) {  // 공개된 기술을 먼저, 나머지는 흔한 세트로
      const known = s.moves.map(norm).filter(m => set.learn.includes(m));
      set.moves = [...new Set([...known, ...set.moves])].slice(0, 4);
    }
    delete set.learn; delete set._mega; team.push(set);
  }
  return { team, mega: megaOf[0], hp: s.hp, status: s.status, boosts: s.boosts, fainted: Math.max(0, Math.min(team.length - 1, team.length - (s.alive || team.length))) };
}
const STATUS = new Set(["brn", "par", "psn", "tox", "slp", "frz"]);
function apply(battle, side, s) {  // frontier_ai/label.mjs와 같은 방식
  const mons = battle[side].pokemon, a = mons[0];
  if (s.mega) { try { a.formeChange(s.mega, a.getItem(), true); } catch {} }
  a.hp = Math.max(1, Math.round(a.maxhp * s.hp / 100));
  if (STATUS.has(s.status)) { try { a.setStatus(s.status, null, null, true); } catch {} }
  for (const [st, v] of Object.entries(s.boosts || {})) if (st in a.boosts) a.boosts[st] = v;
  for (let j = 0; j < s.fainted; j++) { const p = mons[mons.length - 1 - j]; p.hp = 0; p.fainted = true; p.status = "fnt"; battle[side].pokemonLeft--; }
}
const kind = c => c.kind === "switch" ? "교체" : MV[c.move]?.category === "Status" ? "변화" : "공격";
function judge({ ai, player, seed }) {
  const A = sideOf(ai), Pl = sideOf(player);
  const battle = obs.d([Pl.team, A.team], ["Player", "AI"], seed || 1);
  apply(battle, "p1", Pl); apply(battle, "p2", A);
  if (!obs.c(battle, "p2", 1)) throw new Error("AI 차례 아님");
  let got = null; const realPost = self.postMessage.bind(self);
  self.postMessage = m => { got = m; };
  try { aiMsg({ data: { kind: "think", battleId: "live-" + Math.random(), contentVersion: V, observation: obs.n(battle, "p2", 1, seed || 1, obs.t()) } }); }
  finally { self.postMessage = realPost; }
  if (!got || got.kind !== "ai") throw new Error(got?.message || "AI 응답 없음");
  const d = got.decision, best = { 공격: null, 변화: null, 교체: null };
  for (const sc of d.scores || []) { const g = kind(sc.choice); if (sc.score > -900 && (best[g] === null || sc.score > best[g])) best[g] = sc.score; }
  return { ai: kind(d.choice), move: d.choice.move || null, best };
}
