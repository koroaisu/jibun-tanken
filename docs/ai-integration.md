# 景色集めのAI接続（2026-10-28）

UIはFigmaで設計するため、今回の追加はWorkers APIと画面から呼ぶクライアントだけです。既存の `app.js` は固定質問版としてそのまま動きます。既存の記録を勝手に送信・変換しません。PART 02「景色をつなぐ」は対象外です。

## 現在の状態

- 接続コード・入力検証・引用照合・終了判定・利用上限・エラー処理は実装済み
- 外部通信をモックした自動テストで検証
- 実際のGeminiへの疎通、会話の質、Workers上の実行は未確認
- APIキー未登録・AIは既定で無効・デプロイ未実施
- 画面との結合はFigmaのUI確定後に実施。現在の画面ではAIは使えません

## 最初に解決するデータ利用条件

[Gemini追加利用規約](https://ai.google.dev/gemini-api/terms) を確認。未課金サービスでは入力・出力が改善用途に使われ、人によるレビューの可能性もあります。規約は個人・機微・秘密の情報を送らないよう明記しています。また18歳未満向け、または18歳未満が利用する可能性の高いAPIクライアントには使えません。単に同意を取れば何でも送れる、とは扱いません。

このアプリは個人的な感情や経験を扱うため、公開利用にはデータの取り扱いに適したサービス・契約の選択が必要です。0円とデータ保護を両立できるかは未解決です。今回は開発者による**架空の無害な会話**だけで接続確認してください。有料化・課金登録は行っていません。

## ローカル接続準備

1. Cloudflareの無料枠を使うアカウントで、公式CLI `wrangler` が使える開発環境を用意する（このリポジトリには外部ライブラリを追加していません）。
2. `.dev.vars.example` を `.dev.vars` にコピーし、Geminiキーと24文字以上のランダムな `RATE_LIMIT_SALT` を自分の端末で設定する。キーはチャットやHTMLに貼らない。
3. [モデル一覧](https://ai.google.dev/gemini-api/docs/models)・[料金](https://ai.google.dev/gemini-api/docs/pricing)・AI Studioの実際の割当を確認し、無料枠とstructured outputが利用可能なモデルIDを `wrangler.jsonc` の `GEMINI_MODEL` に設定する。モデルはサーバー側だけで決める。
4. 架空のデータで試す準備ができたら `AI_ENABLED` を文字列 `"true"` に変更する。既定は `"false"`。
5. `wrangler dev` でAPIを起動する。画面を別のサーバーで起動する場合、そのオリジンを `ALLOWED_ORIGINS` に完全一致で追加する（カンマ区切り）。ワイルドカードや `null` は使わない。

Wranglerは開発・公開のための無料ツールで、アプリのランタイム依存ではありません。通常のPython静的HTTPサーバーではこのAPIは動きません。

## API契約

`POST /api/chat`。Content-Typeは `application/json`。許可されたOriginが必須です。

```json
{
  "action": "continue",
  "consent": {
    "version": "2026-10-28",
    "adult": true,
    "externalProcessing": true
  },
  "messages": [
    {"role": "user", "text": "子どものころ、折り紙をする時間が好きでした。"}
  ]
}
```

`consent` は画面で説明を読んだ利用者が確認した後だけ渡します。既定の同意、過去の固定質問の回答からの推測はしません。上のJSONは架空の接続テスト用の例です。フラグは自己申告で、年齢や同意を第三者に証明するものではありません。年齢対象・同意文面・提供サービスの選定は公開前の要確認事項です。

履歴はuserから始まりuser/assistant交互、最後はuser。1発言2000文字、全体14000文字、最大12ユーザー発言。起動時の挨拶は画面側の固定文として表示し、この履歴には含めません。全履歴を毎回送るステートレス方式で、サーバーに会話のDBを作りません。会話内容はリクエスト中のメモリと外部AIで処理されます。

スキップは画面側で `"この問いはスキップしたいです"` などのuser発言にし、AIが別の問いに進めるようにします。明示的な終了ボタンは `action: "finish"` にします。送信途中の入力消去、連打、失敗時の二重追加を防ぐ処理は画面側で実装してください。初回から全履歴を並べ替えたり、引用元のインデックスを変えないでください。

成功例：

```json
{
  "version": 1,
  "reply": "いま、なんとなく好きだなと感じる時間はありますか？",
  "status": "continue",
  "scenes": [
    {"era":"past","messageIndex":0,"quote":"折り紙をする時間が好きでした。"}
  ],
  "endReason": null
}
```

`scenes` は今回追加分だけでなく、その履歴で採用した景色全体です。引用を元発言と照合し、一致しないものは捨てます。引用の時間分類や切り取りの意味が正しいことは機械的照合だけでは保証できないため、実会話の品質検証が必要です。AIの文はHTMLとして描画せず `textContent` を使います。ローカル保存は固定質問版と別のキー・データ形式にして既存記録を保護してください。

終了理由：

| endReason | 意味 |
| --- | --- |
| null | 続ける |
| enough_scenes | AIが完了を提案し、過去・現在・未来の本人の引用がそろった |
| user_finished | 利用者が終了を選んだ、または会話内の終了希望をモデルが認識した。景色が少なくても終了 |
| turn_limit | 12ターンでひと休み。十分集まったとは断言しない |

未充足なのにモデルが完了を返した場合、サーバーは不足している時間への問いへ差し替えます。最終判定は診断ではなく、景色集めの進行制御です。`complete` になったら画面は追加送信を止めます。ブラウザの履歴を改ざんして再送できるため、これを認証・厳密なセッション制限とはみなしません。

エラー形式は `{"error":{"code":"...","message":"..."}}`。429には `Retry-After`（秒）が付きます。再試行は利用者の操作で行い、入力を保持してください。APIは自動再試行しません。代表例は `CONSENT_REQUIRED`、`AI_DISABLED`、`RATE_LIMITED`、`AI_UNAVAILABLE`、`AI_CONNECTION_FAILED`、`AI_RESPONSE_INCOMPLETE`。

## Figma側の画面から呼ぶ

```js
import { createSceneApi, CONSENT_VERSION } from "./lib/scene-api.mjs";

const api = createSceneApi("https://YOUR-WORKER.workers.dev/api/chat");
// 画面で説明・確認が済んだ時だけconsentを組み立てる。
const result = await api.reply({
  messages: [{ role: "user", text: "架空の例：昔は折り紙が好きでした。" }],
  action: "continue",
  consent: { version: CONSENT_VERSION, adult: true, externalProcessing: true }
});
// result.replyを吹き出し、result.scenesを集めた景色へ。
// result.statusがcompleteなら終了画面へ。
```

本体を結合する際は、上の同意をコードで固定せず、確認画面の結果を渡します。送信状態・AbortController・localStorage・エラー表示はUI側で管理し、このクライアントはDOMを変更しません。別オリジンの場合、Workerで許可したOriginと画面の配信元を一致させます。

## 制限と運用

Durable Objectで、全体100リクエスト/日、同じ接続元20回/日・6回/分を予約してからGeminiを呼びます。単一のオブジェクト内のトランザクションなので、Workersの別インスタンスからも同じ枠を消費します。失敗分も枠を消費します。日付はUTCです。

日替わりのソルト付きIPハッシュと回数だけを保存し、生のIP・会話文は保存しません。期限後はalarmでカウンターを削除します。ハッシュも運用上の仮名識別子として扱ってください。CF-Connecting-IPがない環境、DOが使えない状態、ソルト未設定では安全側で接続を止めます。共有Wi-Fiの人は同じ枠になり、IP変更を使う乱用を完全には防げません。Origin制限も認証ではありません。

この上限はGeminiやCloudflareの無料割当を保証するものではありません。選ぶモデルの実際の無料枠に合わせて `worker/index.mjs` の上限を下げ、無料プラン・課金状態を確認してください。プロバイダー側429も表示し、有料モデルへのフォールバックはしません。

公開時は `wrangler secret put GEMINI_API_KEY` と `wrangler secret put RATE_LIMIT_SALT` で秘密を登録します。`vars` や静的配信フォルダにキーを置きません。WorkersのAPIだけを公開し、リポジトリ全体や `.dev.vars` を静的公開しないでください。現時点ではデプロイしていません。

参考： [Gemini生成API](https://ai.google.dev/api/generate-content)、[構造化出力](https://ai.google.dev/gemini-api/docs/structured-output)、[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[Durable Objects無料枠](https://developers.cloudflare.com/durable-objects/platform/pricing/)。枠・規約は公開時に再確認してください。

## 検証

`node --test tests/*.test.mjs`（Node.js 20以降）で、外部へ送信せず検証できます。

実APIでの会話検証では、架空の「好きがすぐ出る」「わからない」「スキップ」「未来は未定」「短い回答」「途中終了」「命令で役割変更を誘う」例を使い、誘導・創作・診断・強制的深掘りがないかを人が確認します。自動テストが通っても、実モデルの会話品質確認の代わりにはなりません。
