// Figma側で作る画面から使う、UIに依存しないAPIクライアント。
// 保存する履歴やDOMには触らず、既存の固定質問版からも自動で呼び出さない。
export const CONSENT_VERSION = "2026-10-28";

export class SceneApiError extends Error {
  constructor(code, message, retryAfter = 0) {
    super(message);
    Object.assign(this, { code, retryAfter });
  }
}

export function createSceneApi(endpoint = "/api/chat", fetchImpl = fetch) {
  return {
    async reply({ messages, consent, action = "continue", signal }) {
      if (consent?.version !== CONSENT_VERSION || consent.adult !== true || consent.externalProcessing !== true) {
        throw new SceneApiError("CONSENT_REQUIRED", "外部AIへの送信についての説明と年齢確認が必要です。");
      }
      let response;
      let data;
      try {
        response = await fetchImpl(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, consent, action }), signal, credentials: "omit", cache: "no-store" });
        data = await response.json();
      } catch (error) {
        if (signal?.aborted) throw new SceneApiError("CANCELLED", "送信を中止しました。");
        throw new SceneApiError("NETWORK_ERROR", "接続できませんでした。入力した言葉を残したまま、もう一度お試しください。");
      }
      if (!response.ok) throw new SceneApiError(data?.error?.code || "SERVICE_ERROR", data?.error?.message || "現在利用できません。", Number(response.headers.get("Retry-After")) || 0);
      if (data?.version !== 1 || typeof data.reply !== "string" || !["continue", "complete"].includes(data.status) || !Array.isArray(data.scenes)) {
        throw new SceneApiError("INVALID_RESPONSE", "返答を読み取れませんでした。");
      }
      return data;
    }
  };
}
