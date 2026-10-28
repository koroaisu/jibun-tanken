import { ApiError, validateRequest, normalizeReply, SYSTEM_PROMPT, OUTPUT_SCHEMA } from "./conversation.mjs";

const MAX_BODY = 64000;
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers } });
}

async function readJson(request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) throw new ApiError(415, "JSON_REQUIRED", "JSON形式で送信してください。");
  if (Number(request.headers.get("Content-Length")) > MAX_BODY) throw new ApiError(413, "BODY_TOO_LARGE", "送信内容が長すぎます。");
  if (!request.body) throw new ApiError(400, "INVALID_JSON", "送信内容がありません。");
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) { await reader.cancel(); throw new ApiError(413, "BODY_TOO_LARGE", "送信内容が長すぎます。"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, "INVALID_JSON", "送信内容を読み取れませんでした。"); }
}

async function reserveUsage(request, env) {
  const ip = request.headers.get("CF-Connecting-IP");
  if (!ip || !env.USAGE || !env.RATE_LIMIT_SALT || env.RATE_LIMIT_SALT.length < 24) throw new ApiError(503, "LIMITER_UNAVAILABLE", "利用制限の準備ができていません。");
  const day = Math.floor(Date.now() / 86400000);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.RATE_LIMIT_SALT}:${day}:${ip}`));
  const client = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  // 単一のDOで全体枠を原子的に予約。会話や生のIPは保存しない。
  let response;
  try {
    response = await env.USAGE.get(env.USAGE.idFromName("global-budget-v1")).fetch("https://usage.internal/reserve", { method: "POST", body: JSON.stringify({ client }) });
  } catch { throw new ApiError(503, "LIMITER_UNAVAILABLE", "利用制限を確認できませんでした。少し待ってお試しください。"); }
  if (!response.ok) {
    if (response.status !== 429) throw new ApiError(503, "LIMITER_UNAVAILABLE", "利用制限を確認できませんでした。");
    throw new ApiError(429, "RATE_LIMITED", "利用上限に達しました。時間をおいてお試しください。", Number(response.headers.get("Retry-After")) || 60);
  }
}

export async function handleRequest(request, env, fetchGemini = fetch) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  const origin = request.headers.get("Origin");
  const cors = origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, "Access-Control-Expose-Headers": "Retry-After", "Vary": "Origin" } : {};
  try {
    if (new URL(request.url).pathname !== "/api/chat") throw new ApiError(404, "NOT_FOUND", "見つかりません。");
    if (!cors["Access-Control-Allow-Origin"]) throw new ApiError(403, "ORIGIN_DENIED", "この画面からは利用できません。");
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" } });
    if (request.method !== "POST") throw new ApiError(405, "METHOD_NOT_ALLOWED", "POSTで送信してください。");
    if (env.AI_ENABLED !== "true") throw new ApiError(503, "AI_DISABLED", "AI接続はまだ有効になっていません。");
    if (!env.GEMINI_API_KEY || !/^[a-zA-Z0-9._-]{1,100}$/.test(env.GEMINI_MODEL || "")) throw new ApiError(503, "AI_NOT_CONFIGURED", "AI接続の準備ができていません。");
    const body = validateRequest(await readJson(request));
    await reserveUsage(request, env);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    let result;
    try {
      const upstream = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`, {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: body.messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] })),
          generationConfig: { temperature: 0.6, maxOutputTokens: 4096, responseMimeType: "application/json", responseJsonSchema: OUTPUT_SCHEMA }
        })
      });
      if (!upstream.ok) throw new ApiError(upstream.status === 429 ? 429 : 502, "AI_UNAVAILABLE", "AIが混み合っているか、接続できませんでした。少し待ってお試しください。", upstream.status === 429 ? 60 : 0);
      const data = await upstream.json();
      const candidate = data.candidates?.[0];
      if (candidate?.finishReason !== "STOP") throw new ApiError(502, "AI_RESPONSE_INCOMPLETE", "返答を受け取れませんでした。表現を変えるか、少し待ってお試しください。");
      const text = candidate.content?.parts?.filter(part => !part.thought && typeof part.text === "string").map(part => part.text).join("");
      try { result = normalizeReply(JSON.parse(text), body); }
      catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(502, "INVALID_AI_RESPONSE", "返答を読み取れませんでした。もう一度お試しください。"); }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(controller.signal.aborted ? 504 : 502, "AI_CONNECTION_FAILED", "返答が届きませんでした。記録は端末に残したまま、もう一度お試しください。");
    } finally { clearTimeout(timer); }
    return json(result, 200, cors);
  } catch (error) {
    const safe = error instanceof ApiError ? error : new ApiError(503, "SERVICE_UNAVAILABLE", "現在利用できません。少し待ってお試しください。");
    return json({ error: { code: safe.code, message: safe.message } }, safe.status, { ...cors, ...(safe.retryAfter ? { "Retry-After": String(safe.retryAfter) } : {}) });
  }
}

// Workersの第3引数はExecutionContext。テスト用fetch注入とは分ける。
export default { fetch(request, env) { return handleRequest(request, env); } };

export class UsageLimiter {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const { client } = await request.json();
    if (!/^[a-f0-9]{64}$/.test(client)) return json({}, 400);
    const now = Date.now();
    const day = Math.floor(now / 86400000);
    const minute = Math.floor(now / 60000);
    const retry = await this.ctx.storage.transaction(async storage => {
      let usage = await storage.get("usage");
      if (usage?.day !== day) usage = { day, total: 0, clients: {} };
      const previous = usage.clients[client] || { dayCount: 0, minute, minuteCount: 0 };
      if (usage.total >= 100 || previous.dayCount >= 20) return Math.ceil(((day + 1) * 86400000 - now) / 1000);
      if (previous.minute === minute && previous.minuteCount >= 6) return 60 - Math.floor(now / 1000) % 60;
      usage.total++;
      usage.clients[client] = { dayCount: previous.dayCount + 1, minute, minuteCount: previous.minute === minute ? previous.minuteCount + 1 : 1 };
      await storage.put("usage", usage);
      await this.ctx.storage.setAlarm((day + 1) * 86400000);
      return 0;
    });
    return retry ? json({}, 429, { "Retry-After": String(retry) }) : json({ allowed: true });
  }
  async alarm() {
    // 前日のalarmが遅れて届いても、新しい日のカウンターを消さない。
    await this.ctx.storage.transaction(async storage => {
      const usage = await storage.get("usage");
      const today = Math.floor(Date.now() / 86400000);
      if (usage && usage.day < today) await storage.delete("usage");
      else if (usage) await this.ctx.storage.setAlarm((today + 1) * 86400000);
    });
  }
}
