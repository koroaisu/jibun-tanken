import { test } from "node:test";
import assert from "node:assert/strict";
import { scenarios } from "../eval/scenarios.mjs";
import { optionsFrom, evaluate, inspectResult, reportMarkdown } from "../scripts/evaluate-ai.mjs";

test("既定は外部通信なし。実接続には架空データ・1ケース・Originの明示が必要", () => {
  assert.equal(optionsFrom([]).mode, "mock");
  for (const args of [
    ["--endpoint", "https://example.com/api/chat"],
    ["--case", "not-exist"],
    ["--endpoint"],
    ["--endpoint", "http://example.com/api/chat", "--origin", "https://app.example", "--case", "skip", "--fictional-data-only"],
    ["--endpoint", "https://example.com/api/chat?key=secret", "--origin", "https://app.example", "--case", "skip", "--fictional-data-only"]
  ]) assert.throws(() => optionsFrom(args));
  assert.equal(optionsFrom(["--endpoint", "http://127.0.0.1:8787/api/chat", "--origin", "http://localhost:8000", "--case", "skip", "--fictional-data-only"]).mode, "live");
});

test("架空8ケースを実ハンドラー経由で検証し、モックの合格と会話品質評価を区別する", async () => {
  let externalCalls = 0;
  const outcomes = await evaluate(optionsFrom([]), async () => { externalCalls++; throw new Error("must not call"); });
  assert.equal(externalCalls, 0);
  assert.equal(outcomes.length, 8);
  assert(outcomes.every(o => o.issues.length === 0));
  const report = reportMarkdown("mock", outcomes);
  assert(report.includes("モック（外部通信なし"));
  assert(report.includes("人による評価はすべて未実施"));
});

test("検証器は終了理由違い・創作引用を不一致にし、複数質問には注意を出す", () => {
  const checked = inspectResult(scenarios[0], { status: "complete", endReason: "turn_limit", reply: "どうですか？なぜですか？", scenes: [{ messageIndex: 0, quote: "本人が話していないこと" }] });
  assert.equal(checked.issues.length, 3);
  assert.equal(checked.notes.length, 1);
});

test("実接続モードは選んだ架空ケースだけ1回送り、429を再試行しない", async () => {
  const option = optionsFrom(["--endpoint", "https://api.example/api/chat", "--origin", "https://app.example", "--case", "skip", "--fictional-data-only"]);
  let calls = 0;
  const outcomes = await evaluate(option, async (url, init) => {
    calls++;
    assert.equal(JSON.parse(init.body).messages[0].text, scenarios.find(s => s.id === "skip").messages[0].text);
    assert.equal(init.headers.Origin, "https://app.example");
    return Response.json({ error: { code: "RATE_LIMITED", message: "待ってください" } }, { status: 429 });
  });
  assert.equal(calls, 1);
  assert.equal(outcomes.length, 1);
  assert(outcomes[0].issues[0].includes("RATE_LIMITED"));
});
