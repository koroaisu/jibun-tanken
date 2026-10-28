import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { scenarios } from "../eval/scenarios.mjs";
import { createSceneApi, CONSENT_VERSION } from "../lib/scene-api.mjs";
import { handleRequest } from "../worker/index.mjs";

export function optionsFrom(args) {
  const option = { mode: "mock" };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--mock") continue;
    if (arg === "--fictional-data-only") { option.fictional = true; continue; }
    if (["--endpoint", "--case", "--origin"].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} の値が必要です。`);
      option[arg.slice(2)] = value;
    } else throw new Error(`未対応の引数: ${arg}`);
  }
  if (option.case && !scenarios.some(s => s.id === option.case)) throw new Error("シナリオIDが見つかりません。");
  if (option.endpoint) {
    if (!option.fictional || !option.case || !option.origin) throw new Error("実接続には --fictional-data-only、--case、--origin の明示が必要です。");
    const endpoint = new URL(option.endpoint);
    if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname))) throw new Error("HTTPSまたは端末内のHTTPサーバーを指定してください。");
    if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== "/api/chat") throw new Error("キーやクエリを含めず、/api/chat のURLを指定してください。");
    if (new URL(option.origin).origin !== option.origin) throw new Error("--origin は画面の配信元だけを指定してください。");
    option.mode = "live";
  }
  return option;
}

export function inspectResult(scenario, result) {
  const issues = [];
  if (result.status !== scenario.expectedStatus) issues.push(`終了状態: 期待 ${scenario.expectedStatus} / 実際 ${result.status}`);
  if (result.endReason !== scenario.expectedEndReason) issues.push(`終了理由: 期待 ${scenario.expectedEndReason} / 実際 ${result.endReason}`);
  for (const scene of result.scenes) {
    const source = scenario.messages[scene.messageIndex];
    if (source?.role !== "user" || !source.text.includes(scene.quote)) issues.push("本人の発言と一致しない引用があります。");
  }
  return {
    issues,
    notes: [
      ...((result.reply.match(/[?？]/g) || []).length > 1 ? ["質問記号が複数あります。一度に一問になっているか人が確認してください。"] : []),
      ...(result.reply.length > 300 ? ["返答が300文字を超えています。長すぎないか確認してください。"] : [])
    ]
  };
}

function mockTransport(scenario) {
  const env = { AI_ENABLED: "true", GEMINI_MODEL: "mock-model", GEMINI_API_KEY: "not-a-real-key", RATE_LIMIT_SALT: "mock-only-salt-not-a-real-secret", ALLOWED_ORIGINS: "https://fictional.example", USAGE: { idFromName: n => n, get: () => ({ fetch: async () => Response.json({ allowed: true }) }) } };
  return (url, init) => handleRequest(new Request("https://api.fictional.example/api/chat", { ...init, headers: { ...init.headers, Origin: "https://fictional.example", "CF-Connecting-IP": "192.0.2.1" } }), env,
    async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(scenario.mock) }] } }] }));
}

export async function evaluate(option, liveFetch = fetch) {
  const selected = option.case ? scenarios.filter(s => s.id === option.case) : scenarios;
  const outcomes = [];
  for (const scenario of selected) {
    const transport = option.mode === "mock" ? mockTransport(scenario) : (url, init) => liveFetch(url, { ...init, headers: { ...init.headers, Origin: option.origin } });
    const api = createSceneApi(option.endpoint || "/api/chat", transport);
    const started = Date.now();
    try {
      const result = await api.reply({ messages: scenario.messages, action: scenario.action || "continue", consent: { version: CONSENT_VERSION, adult: true, externalProcessing: true }, signal: AbortSignal.timeout(20000) });
      outcomes.push({ scenario, result, ...inspectResult(scenario, result), milliseconds: Date.now() - started });
    } catch (error) {
      // 接続先URL・APIキー・プロバイダー内部情報はレポートへ書き出さない。
      outcomes.push({ scenario, issues: ["API呼び出しに失敗しました: " + (error.code || "UNKNOWN_ERROR")], notes: [], milliseconds: Date.now() - started });
    }
  }
  return outcomes;
}

export function reportMarkdown(mode, outcomes) {
  const lines = ["# 景色集め・会話評価レポート", "", `実行方式: ${mode === "mock" ? "モック（外部通信なし・手書きの模擬返答）" : "実API（架空のテスト会話のみ）"}`, "", "モックの合格は、API接続処理・引用照合・終了判定の確認です。実モデルの会話品質の合格を意味しません。人による評価はすべて未実施です。", ""];
  for (const { scenario, result, issues, notes, milliseconds } of outcomes) {
    lines.push(`## ${scenario.id} — ${scenario.name}`, "", `機械判定: ${issues.length ? "要確認" : "期待と一致"} / ${milliseconds}ms`, "", "### 入力（すべて架空）", "", "```json", JSON.stringify(scenario.messages, null, 2), "```", "", "### 出力", "", "```json", JSON.stringify(result || null, null, 2), "```", "", ...issues.map(s => `- ${s}`), ...notes.map(s => `- 注意: ${s}`), "", "### 人が確認すること", "", scenario.review, "", "- [ ] 本人の言葉を尊重している", "- [ ] 創作・診断・誘導・強制的深掘りがない", "- [ ] 続行／終了が自然で、質問を詰め込みすぎていない", "- [ ] 引用の切り取り・時間分類の意味が正しい", "");
  }
  return lines.join("\n");
}

async function main() {
  const option = optionsFrom(process.argv.slice(2));
  const outcomes = await evaluate(option);
  const directory = fileURLToPath(new URL("../reports/", import.meta.url));
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, `ai-evaluation-${option.mode}.md`);
  await writeFile(output, reportMarkdown(option.mode, outcomes), "utf8");
  for (const { scenario, issues } of outcomes) console.log(`${issues.length ? "CHECK" : "PASS"} ${scenario.id}`);
  console.log(`方式: ${option.mode} / レポート: ${output}`);
  console.log("人による会話品質評価は未実施です。");
  if (outcomes.some(r => r.issues.length)) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error("実行できませんでした。引数をdocs/ai-evaluation.mdで確認してください。接続先URLや秘密はログに出しません。");
  process.exitCode = 1;
});
