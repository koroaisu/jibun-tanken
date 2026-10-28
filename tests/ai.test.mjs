import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { handleRequest, UsageLimiter } from "../worker/index.mjs";
import { validateRequest, normalizeReply, COMPLETION, CONSENT_VERSION } from "../worker/conversation.mjs";
import { createSceneApi, SceneApiError } from "../lib/scene-api.mjs";

const consent = { version: CONSENT_VERSION, adult: true, externalProcessing: true };
const message = (text, role = "user") => ({ role, text });
const requestBody = (messages = [message("昔は折り紙が好きでした。")], action = "continue") => ({ messages, consent, action });
const request = (body = requestBody(), headers = {}, method = "POST") => new Request("https://api.example/api/chat", {
  method,
  headers: { Origin: "https://app.example", "Content-Type": "application/json", "CF-Connecting-IP": "192.0.2.1", ...headers },
  ...(method === "POST" ? { body: JSON.stringify(body) } : {})
});
const environment = () => ({ AI_ENABLED: "true", GEMINI_MODEL: "test-model", GEMINI_API_KEY: "test-secret-key", RATE_LIMIT_SALT: "test-salt-for-mocks-only-123456", ALLOWED_ORIGINS: "https://app.example", USAGE: { idFromName: name => name, get: () => ({ fetch: async () => Response.json({ allowed: true }) }) } });
const generated = (output, finishReason = "STOP") => Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(output) }] } }] });
const continued = { reply: "いま、なんとなく好きな時間はありますか？", status: "continue", scenes: [{ era: "past", messageIndex: 0, quote: "折り紙が好きでした。" }] };

test("入力: 同意・年齢・履歴形式・長さの不正を止める", () => {
  for (const bad of [null, {}, { ...requestBody(), consent: { ...consent, adult: false } }, { ...requestBody(), consent: { ...consent, version: "old" } }, { ...requestBody(), action: "inject" }, requestBody([]), requestBody([message("", "user")]), requestBody([message("pretend", "system")]), requestBody([message("x".repeat(2001))]), requestBody([message("a"), message("b", "assistant")])]) {
    assert.throws(() => validateRequest(bad));
  }
  assert.deepEqual(validateRequest({ ...requestBody(), secret: "must-not-forward" }), { messages: requestBody().messages, action: "continue" });
});

test("引用照合: 創作、assistant由来、不正インデックス、重複を除外する", () => {
  const body = validateRequest(requestBody([message("昔は折り紙が好きでした。"), message("未来はお店ですね。", "assistant"), message("今は読書が好きです。") ]));
  const output = normalizeReply({ ...continued, scenes: [...continued.scenes, continued.scenes[0], { era: "future", messageIndex: 0, quote: "起業したいです" }, { era: "future", messageIndex: 1, quote: "未来はお店ですね。" }, { era: "present", messageIndex: 2.5, quote: "読書" }] }, body);
  assert.deepEqual(output.scenes, continued.scenes);
});

test("終了: 3時間の本人引用が揃って初めて十分集まったと判定する", () => {
  const body = validateRequest(requestBody([message("昔は折り紙が好きでした。"), message("いまは？", "assistant"), message("今は読書が好きです。"), message("これからは？", "assistant"), message("いつか海を見たいです。") ]));
  const scenes = [{ era: "past", messageIndex: 0, quote: "折り紙が好きでした。" }, { era: "present", messageIndex: 2, quote: "読書が好きです。" }, { era: "future", messageIndex: 4, quote: "いつか海を見たいです。" }];
  const done = normalizeReply({ reply: "勝手な診断文", status: "complete", scenes }, body);
  assert.equal(done.reply, COMPLETION);
  assert.equal(done.status, "complete");
  assert.equal(done.endReason, "enough_scenes");
  const early = normalizeReply({ ...continued, status: "complete" }, body);
  assert.equal(early.status, "continue");
  assert.equal(early.endReason, null);
  assert(!early.reply.includes(COMPLETION));
});

test("利用者の終了・ターン上限では景色の充足を断言しない", () => {
  const ended = normalizeReply({ ...continued, scenes: [] }, validateRequest(requestBody(undefined, "finish")));
  assert.equal(ended.endReason, "user_finished");
  assert.equal(ended.status, "complete");
  assert(!ended.reply.includes(COMPLETION));
  assert.equal(normalizeReply({ ...continued, status: "user_finished", scenes: [] }, validateRequest(requestBody([message("今日は終わりたいです")]))).endReason, "user_finished");
  const messages = Array.from({ length: 23 }, (_, i) => message("わからない", i % 2 ? "assistant" : "user"));
  assert.equal(normalizeReply({ ...continued, scenes: [] }, validateRequest(requestBody(messages))).endReason, "turn_limit");
});

test("無効・不正Origin・未同意・サイズ超過時は外部AIに送らない", async () => {
  let calls = 0;
  const fetchMock = async () => { calls++; return generated(continued); };
  assert.equal((await handleRequest(request(), { ...environment(), AI_ENABLED: "false" }, fetchMock)).status, 503);
  assert.equal((await handleRequest(request(undefined, { Origin: "https://evil.example" }), environment(), fetchMock)).status, 403);
  assert.equal((await handleRequest(request({ ...requestBody(), consent: null }), environment(), fetchMock)).status, 400);
  assert.equal((await handleRequest(request({ padding: "あ".repeat(65000) }), environment(), fetchMock)).status, 413);
  assert.equal((await handleRequest(request(undefined, { "Content-Type": "text/plain" }), environment(), fetchMock)).status, 415);
  assert.equal(calls, 0);
});

test("CORS事前確認・メソッドと未知のパス", async () => {
  const preflight = await handleRequest(request(undefined, {}, "OPTIONS"), environment());
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://app.example");
  assert.equal((await handleRequest(request(undefined, {}, "GET"), environment())).status, 405);
  assert.equal((await handleRequest(new Request("https://api.example/nope"), environment())).status, 404);
});

test("正常接続: キーをヘッダーで渡し、役割・構造化出力をサーバーで固定", async () => {
  const env = environment();
  const response = await handleRequest(request(), env, async (url, init) => {
    assert(!url.includes(env.GEMINI_API_KEY));
    assert.equal(init.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    const payload = JSON.parse(init.body);
    assert(payload.systemInstruction.parts[0].text.includes("先生でも診断者でもありません"));
    assert.equal(payload.generationConfig.responseMimeType, "application/json");
    assert.equal(payload.contents[0].role, "user");
    return generated(continued);
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const output = await response.text();
  assert(!output.includes(env.GEMINI_API_KEY));
  assert.equal(JSON.parse(output).scenes[0].quote, "折り紙が好きでした。");
});

test("Workersの実エントリーはExecutionContextをfetchと取り違えない", async t => {
  t.mock.method(globalThis, "fetch", async () => generated(continued));
  assert.equal((await worker.fetch(request(), environment(), { waitUntil() {} })).status, 200);
});

test("15秒タイムアウトは通信を中止し、入力を破棄する指示を返さない", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let began;
  const ready = new Promise(resolve => { began = resolve; });
  const result = handleRequest(request(), environment(), async (url, { signal }) => {
    began();
    return new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  await ready;
  t.mock.timers.tick(15001);
  const response = await result;
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, "AI_CONNECTION_FAILED");
});

test("上限・カウンター障害は失敗側へ倒し、プロバイダーへ送信しない", async () => {
  let calls = 0;
  const fetchMock = async () => { calls++; return generated(continued); };
  const denied = { idFromName: n => n, get: () => ({ fetch: async () => new Response("", { status: 429, headers: { "Retry-After": "42" } }) }) };
  const response = await handleRequest(request(), { ...environment(), USAGE: denied }, fetchMock);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "42");
  assert.equal(response.headers.get("Access-Control-Expose-Headers"), "Retry-After");
  assert.equal((await handleRequest(request(), { ...environment(), USAGE: null }, fetchMock)).status, 503);
  assert.equal((await handleRequest(request(undefined, { "CF-Connecting-IP": "" }), environment(), fetchMock)).status, 503);
  assert.equal(calls, 0);
});

test("AI障害・429・安全ブロック・不正JSONを安全なエラーへ変換", async () => {
  for (const [upstream, status] of [
    [() => new Response("secret provider details", { status: 429 }), 429],
    [() => new Response("secret provider details", { status: 401 }), 502],
    [() => generated(continued, "SAFETY"), 502],
    [() => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "bad json" }] } }] }), 502],
    [() => { throw new Error("secret transport details"); }, 502]
  ]) {
    const response = await handleRequest(request(), environment(), upstream);
    assert.equal(response.status, status);
    assert(!(await response.text()).includes("secret"));
  }
});

function memoryStorage() {
  const values = new Map();
  let queue = Promise.resolve();
  const storage = {
    async get(key) { return structuredClone(values.get(key)); },
    async put(key, value) { values.set(key, structuredClone(value)); },
    async delete(key) { values.delete(key); },
    async setAlarm(timestamp) { storage.alarmAt = timestamp; },
    transaction(fn) { const next = queue.then(() => fn(storage)); queue = next.catch(() => {}); return next; }
  };
  return storage;
}
const hash = n => n.toString(16).padStart(64, "0");
const reserve = (limiter, n = 1) => limiter.fetch(new Request("https://internal", { method: "POST", body: JSON.stringify({ client: hash(n) }) }));

test("DO: 同時予約でも同一接続元の分上限6件を超えず、会話や生IPを保存しない", async () => {
  const storage = memoryStorage();
  const limiter = new UsageLimiter({ storage });
  const replies = await Promise.all(Array.from({ length: 10 }, () => reserve(limiter)));
  assert.equal(replies.filter(r => r.ok).length, 6);
  assert.equal(replies.filter(r => r.status === 429).length, 4);
  const usage = await storage.get("usage");
  assert.equal(usage.total, 6);
  assert.deepEqual(Object.keys(usage.clients[hash(1)]).sort(), ["dayCount", "minute", "minuteCount"]);
});

test("DO: 全体の日上限100件を接続元の変更でも超えない", async () => {
  const storage = memoryStorage();
  const limiter = new UsageLimiter({ storage });
  for (let n = 1; n <= 100; n++) assert.equal((await reserve(limiter, n)).status, 200);
  assert.equal((await reserve(limiter, 101)).status, 429);
  assert.equal((await storage.get("usage")).total, 100);
});

test("DO: 日替わり・接続元の日上限・遅れた削除alarm", async () => {
  const storage = memoryStorage();
  const limiter = new UsageLimiter({ storage });
  const day = Math.floor(Date.now() / 86400000);
  await storage.put("usage", { day: day - 1, total: 100, clients: {} });
  assert.equal((await reserve(limiter)).status, 200);
  let usage = await storage.get("usage");
  assert.equal(usage.total, 1);
  usage.clients[hash(1)].dayCount = 20;
  await storage.put("usage", usage);
  assert.equal((await reserve(limiter)).status, 429);
  await limiter.alarm();
  assert(await storage.get("usage")); // 前日のalarmが遅れて来ても今日の枠を消さない。
  await storage.put("usage", { day: day - 1, total: 1, clients: {} });
  await limiter.alarm();
  assert.equal(await storage.get("usage"), undefined);
});

test("画面用クライアント: 未同意で通信しない・返答・Retry-After・中断", async () => {
  let calls = 0;
  const api = createSceneApi("/api/chat", async () => { calls++; return Response.json({ version: 1, ...continued, endReason: null }); });
  await assert.rejects(api.reply({ messages: requestBody().messages }), { code: "CONSENT_REQUIRED" });
  assert.equal(calls, 0);
  assert.equal((await api.reply(requestBody())).status, "continue");
  const limited = createSceneApi("/api/chat", async () => Response.json({ error: { code: "RATE_LIMITED", message: "時間をおいて" } }, { status: 429, headers: { "Retry-After": "30" } }));
  await assert.rejects(limited.reply(requestBody()), error => error instanceof SceneApiError && error.retryAfter === 30);
  const controller = new AbortController(); controller.abort();
  const cancelled = createSceneApi("/api/chat", async () => { throw new Error("aborted"); });
  await assert.rejects(cancelled.reply({ ...requestBody(), signal: controller.signal }), { code: "CANCELLED" });
});
