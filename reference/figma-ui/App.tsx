import { FormEvent, useEffect, useRef, useState } from 'react'

type View = 'welcome' | 'explore' | 'summary'

type Message = {
  id: number
  from: 'guide' | 'user'
  text: string
}

const firstQuestion =
  'まずは、ふと思い出す子どもの頃の景色から。どんな場所で、何をしている時間が好きでしたか？'

const questions = [
  {
    chapter: '過去の景色',
    caption: '記憶に残っている、小さな光を辿ります',
    reply:
      'その景色を聞かせてくれて、ありがとう。好きだった時間の中には、今のあなたにも続いている感覚がありそうです。',
    next: '今の暮らしの中で、理由はうまく説明できなくても、つい惹かれてしまうものはありますか？',
    suggestions: ['外で遊んでいた', 'ものを作っていた', '本を読んでいた'],
  },
  {
    chapter: '今の景色',
    caption: '心が自然に向かう方角を眺めます',
    reply:
      '「つい惹かれる」という感覚は、大切な景色ですね。理由は今すぐ分からなくても、そのまま地図に置いておきましょう。',
    next: '反対に、最近少し疲れたり、身体が「ちょっと違う」と教えてくれた場面はありましたか？',
    suggestions: ['静かな場所', '人と話す時間', '新しいこと'],
  },
  {
    chapter: '身体の景色',
    caption: '言葉になる前の感覚にも耳を澄ませます',
    reply:
      'その身体の反応にも、あなたらしい歩幅が表れているように思います。無理に意味を決めず、ひとつの目印にしてみますね。',
    next: '最後に、こんな一日を過ごせたら心地よさそう、と思う未来の景色を自由に描いてみてください。',
    suggestions: ['予定が多い日', '人に合わせる時', '急いでいる時'],
  },
  {
    chapter: '未来の景色',
    caption: 'まだ見ぬ、心地よい方角を思い描きます',
    reply:
      'ありがとう。過去・現在・未来の景色が、ひとつの地図の上に集まりました。正解ではなく、今のあなたから見えている景色として眺めてみましょう。',
    next: '',
    suggestions: ['自然の近くで暮らす', 'ゆっくり働く', '好きな人と過ごす'],
  },
]

function LeafMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? 'leaf-mark leaf-mark--small' : 'leaf-mark'} aria-hidden="true">
      <span />
      <span />
    </span>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 14-7-4.8 14-2.6-5.2L5 12Z" />
      <path d="m11.6 13.8 3.1-3.1" />
    </svg>
  )
}

function DoodleHero() {
  return (
    <svg
      className="doodle-hero"
      viewBox="0 0 620 430"
      role="img"
      aria-label="机に向かい、自分の過去と未来を思い描く人"
    >
      <g className="doodle-line">
        <path d="M281 58c-11-24-42-23-52-4-22-14-50 0-48 24-24 1-35 30-17 46-7 24 21 40 39 27 12 18 43 13 46-9 23-6 34-34 17-50 13-12 8-36-8-43Z" />
        <path d="M457 32c-11-17-34-17-45-2-17-12-41 1-39 22-20 2-27 28-11 39-5 21 21 32 35 20 11 14 35 8 36-10 17-7 23-30 11-43 9-12 3-28-8-35Z" />
        <path className="fill-blue" d="m188 117 29-37 17 20 15-13 31 35Z" />
        <path d="m188 117 29-37 17 20 15-13 31 35M202 117l18-17 10 8 10-7 19 16" />
        <path className="fill-yellow" d="M397 89c4-19 18-29 35-28 16 2 25 13 27 28Z" />
        <path d="M390 89h76M398 98h62M426 52V41M397 63l-9-8M454 62l9-8" />

        <path d="M337 149c3-30 29-48 61-41 27 6 40 31 33 56-3 12-12 23-22 28-9 5-21 6-31 4-28-5-44-22-41-47Z" />
        <path className="fill-hair" d="M342 147c-7-31 17-51 48-43 16 4 30 17 32 34-20 4-35-6-46-21-4 15-16 27-34 30Z" />
        <path d="M360 154c4 2 7 1 10-1M397 152c3 2 6 2 9 0M382 157c-1 5 0 8 4 10M371 178c11 6 22 5 31-2" />
        <path d="M388 103c-4-18 10-31 26-27 11 2 17 12 15 22-3 11-14 18-25 13" />
        <path d="M357 197c-14 12-25 30-27 54l-4 57h145l-7-67c-3-25-19-40-41-48" />
        <path d="M354 216c16 14 29 29 37 47M448 217c-16 12-27 29-34 50" />
        <path d="M391 263c-5 10-14 21-23 31M414 267c-4 8-8 17-13 27" />
        <path d="M365 294c10 5 23 5 36 0M329 308h169" />
        <path className="fill-paper" d="m339 308 66-18 72 19-65 25Z" />
        <path d="m339 308 66-18 72 19-65 25-73-26ZM405 290l7 44M356 307l44-11M420 298l41 11M366 315l33 8" />
        <path className="fill-yellow" d="m432 319 37-13 3 7-37 13Z" />
        <path d="m432 319 37-13 3 7-37 13ZM468 306l6-1-2 8" />

        <path d="M520 260v48M501 308h39M508 260h26l-4 28h-18Z" />
        <path className="fill-green" d="M514 260c-8-13 3-27 12-32 2 11-1 22-12 32ZM520 248c3-15 18-20 29-17-3 13-15 21-29 17Z" />
        <path d="M514 260c-8-13 3-27 12-32 2 11-1 22-12 32ZM520 248c3-15 18-20 29-17-3 13-15 21-29 17Z" />

        <path d="M272 256h43v31c0 13-9 21-21 21-13 0-22-9-22-21ZM315 266h8c12 0 13 19 1 21h-9" />
        <path d="M281 243c-8-10 8-13 1-23M299 243c-7-9 8-13 2-22" />
        <path d="M202 249v59M181 308h42M192 248h20l-4 26h-12Z" />
        <path className="fill-pink" d="M201 232c-14-5-12-22 1-21 5-14 22-8 18 4 14 5 9 21-3 20-4 13-20 11-20-1Z" />
        <path d="M201 232c-14-5-12-22 1-21 5-14 22-8 18 4 14 5 9 21-3 20-4 13-20 11-20-1ZM207 225h1" />

        <path d="M104 331h105M123 331l-13 60M187 331l11 60M129 351h52M132 351l-5 32M178 351l5 32" />
        <path className="fill-green" d="M127 308h55l8 22h-69Z" />
        <path d="M127 308h55l8 22h-69Z" />
        <path d="M104 318 75 297M80 300l-15 46M87 306l35-4M73 346h14M63 278l28 17M64 278l8-7M64 278l-2 10" />

        <path d="M97 111c-13-13-36-2-30 16-19 1-25 26-9 36-7 17 13 32 27 21 9 13 31 6 30-10 17-4 19-27 3-34 8-17-5-33-21-29Z" />
        <path d="M88 132c8 0 15 5 17 12-8 0-15 5-17 12-2-7-9-12-17-12 8-1 15-6 17-12Z" />
      </g>
      <g className="doodle-spark">
        <path d="M530 145v19M520 155h20M562 184v14M555 191h14M139 208v17M131 216h16" />
      </g>
      <path className="doodle-dash" d="M137 164c22 36 39 57 71 69M281 132c35 5 56 5 78 17M445 105c14 18 10 39-2 56" />
    </svg>
  )
}

function SceneIcon({ scene }: { scene: 'collect' | 'connect' | 'map' }) {
  if (scene === 'collect') {
    return (
      <svg viewBox="0 0 96 76" aria-hidden="true">
        <path className="soft-pink" d="M26 40C5 23 13 8 26 13c8-12 27-3 22 11-3 8-13 14-22 24Z" />
        <path d="M26 40C5 23 13 8 26 13c8-12 27-3 22 11-3 8-13 14-22 24ZM26 40v25M17 53c7 0 9 4 9 10M35 52c-7 1-9 5-9 11" />
        <path className="soft-yellow" d="M60 24h24v28H60z" />
        <path d="M60 24h24v28H60zM65 30h14M65 36h14M65 42h9M58 20h28" />
      </svg>
    )
  }
  if (scene === 'connect') {
    return (
      <svg viewBox="0 0 96 76" aria-hidden="true">
        <circle className="soft-pink" cx="28" cy="26" r="19" />
        <circle className="soft-green" cx="48" cy="31" r="20" />
        <circle className="soft-blue" cx="68" cy="26" r="19" />
        <path d="M14 56c11-8 22-8 32 0s23 8 36-1M28 26l-8 8M28 26l7 9M48 24v20M40 35l8-11 8 11M68 17v24M61 32l7 9 8-10" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 96 76" aria-hidden="true">
      <path className="soft-yellow" d="m11 20 24-8 28 9 22-8v43l-22 8-28-9-24 8Z" />
      <path d="m11 20 24-8 28 9 22-8v43l-22 8-28-9-24 8ZM35 12v43M63 21v43M21 44c10-13 19-13 28-3s16 9 27-5" />
      <path d="M74 17V4M74 5h12l-5 5 5 5H74" />
    </svg>
  )
}

function Welcome({ onStart }: { onStart: () => void }) {
  return (
    <main className="landing-page flyer-style">
      <header className="flyer-header">
        <button className="flyer-logo" type="button">
          <LeafMark small />
          <span>
            自分探検
            <small>AIと歩く、わたしの時間</small>
          </span>
        </button>
        <p>
          はじめての方へ
          <span />
          所要時間 15〜20分
        </p>
      </header>

      <section className="flyer-hero">
        <div className="flyer-hero__copy">
          <p className="eyebrow">AIとの対話で、</p>
          <h1>
            自分探検
            <br />
            <em>パーソナル</em>
          </h1>
          <p className="flyer-hero__tagline">
            「自分でも知らなかった自分」に
            <br />
            出会っていく、小さな旅。
          </p>
          <p className="flyer-lead">
            AIと話しながら、心の中にある「景色」を集め、
            <br className="desktop-break" />
            そのつながりを一緒に眺めていきます。
          </p>
          <div className="flyer-actions">
            <button className="primary-button" onClick={onStart}>
              探検をはじめる
              <ArrowIcon />
            </button>
            <p>
              ChatGPTを普段使っていなくても
              <br />
              大丈夫です
            </p>
          </div>
        </div>
        <div className="flyer-hero__art">
          <DoodleHero />
          <div className="speech-note">
            <span>AIは懐中電灯。</span>
            <br />
            あなたがナビゲーターです。
          </div>
        </div>
      </section>

      <section className="how-it-works" aria-labelledby="how-title">
        <div className="how-it-works__intro">
          <span>HOW IT WORKS</span>
          <h2 id="how-title">
            答えを探すのではなく、
            <br />
            <em>景色を集めて、つなげる。</em>
          </h2>
        </div>
        <div className="step-cards">
          <article className="step-card">
            <span className="step-card__number">1</span>
            <div className="step-card__icon">
              <SceneIcon scene="collect" />
            </div>
            <div>
              <small>COLLECT</small>
              <h3>景色を集める</h3>
              <p>「好き」「なんか気になる」そんな小さな感覚を、理由を決めずに集めます。</p>
            </div>
          </article>
          <article className="step-card">
            <span className="step-card__number">2</span>
            <div className="step-card__icon">
              <SceneIcon scene="connect" />
            </div>
            <div>
              <small>CONNECT</small>
              <h3>3つの時間を重ねる</h3>
              <p>過去・現在・未来に散らばる景色を、ゆっくり重ねて眺めます。</p>
            </div>
          </article>
          <article className="step-card">
            <span className="step-card__number">3</span>
            <div className="step-card__icon">
              <SceneIcon scene="map" />
            </div>
            <div>
              <small>DISCOVER</small>
              <h3>自分の地図をひらく</h3>
              <p>分析や診断ではなく、話しながら自分でつながりに気づいていきます。</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

function Explorer({
  messages,
  onSend,
  onBack,
  questionIndex,
  completed,
  isThinking,
  onShowSummary,
}: {
  messages: Message[]
  onSend: (text: string) => void
  onBack: () => void
  questionIndex: number
  completed: boolean
  isThinking: boolean
  onShowSummary: () => void
}) {
  const [value, setValue] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!value.trim() || isThinking || completed) return
    onSend(value.trim())
    setValue('')
  }

  const currentQuestion = questions[Math.min(questionIndex, questions.length - 1)]

  return (
    <main className="explorer">
      <aside className="journey">
        <button className="journey__brand" onClick={onBack} aria-label="最初の画面へ戻る">
          <LeafMark small />
          <span>
            自分探検
            <small>INNER JOURNEY</small>
          </span>
        </button>

        <div className="journey__body">
          <p className="journey__label">今日の探検</p>
          <h2>
            わたしの景色を
            <br />
            集める旅
          </h2>
          <ol className="journey__steps">
            <li className={questionIndex === 0 ? 'is-active' : 'is-done'}>
              <span>1</span>
              <p>
                過去の景色
                <small>記憶の中を歩く</small>
              </p>
            </li>
            <li className={questionIndex > 0 && questionIndex < 3 ? 'is-active' : questionIndex >= 3 ? 'is-done' : ''}>
              <span>2</span>
              <p>
                今の景色
                <small>心と身体を眺める</small>
              </p>
            </li>
            <li className={questionIndex === 3 || completed ? 'is-active' : ''}>
              <span>3</span>
              <p>
                未来の景色
                <small>まだ見ぬ方角へ</small>
              </p>
            </li>
          </ol>
        </div>

        <div className="journey__footer">
          <p>急がなくて、大丈夫。</p>
          <span>あなたの歩幅で進みましょう</span>
        </div>
      </aside>

      <section className="conversation">
        <header className="conversation__header">
          <button className="mobile-brand" onClick={onBack}>
            <LeafMark small />
            自分探検
          </button>
          <div className="guide-status">
            <span className="guide-status__light" />
            <p>
              森の案内人
              <small>あなたと一緒に歩いています</small>
            </p>
          </div>
          <div className="mobile-progress" aria-label={`探検の進み具合 ${questionIndex + 1}/4`}>
            <span>{completed ? 4 : questionIndex + 1} / 4</span>
            <i>
              <b style={{ width: `${(completed ? 4 : questionIndex + 1) * 25}%` }} />
            </i>
          </div>
          <button className="pause-button" type="button" onClick={onBack}>
            ひと休みする
          </button>
        </header>

        <div className="conversation__scroll">
          <div className="chapter">
            <span>SCENE {String(Math.min(questionIndex + 1, 4)).padStart(2, '0')} / 04</span>
            <h2>{currentQuestion.chapter}</h2>
            <p>{currentQuestion.caption}</p>
          </div>

          <div className="messages" aria-live="polite">
            {messages.map((message, index) => (
              <div
                className={`message message--${message.from}`}
                key={message.id}
                style={{ animationDelay: `${Math.min(index, 2) * 80}ms` }}
              >
                {message.from === 'guide' && (
                  <div className="message__avatar">
                    <LeafMark small />
                  </div>
                )}
                <div className="message__content">
                  {message.from === 'guide' && <span>森の案内人</span>}
                  <p>{message.text}</p>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="message message--guide message--thinking">
                <div className="message__avatar">
                  <LeafMark small />
                </div>
                <div className="message__content">
                  <span>森の案内人</span>
                  <div className="thinking-dots" aria-label="返事を考えています">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {completed ? (
          <div className="summary-cta">
            <div>
              <LeafMark small />
              <p>
                景色が集まりました
                <small>今のあなたの地図をひらいてみましょう</small>
              </p>
            </div>
            <button type="button" onClick={onShowSummary}>
              集まった景色を見る
              <ArrowIcon />
            </button>
          </div>
        ) : (
          <form className="composer" onSubmit={submit}>
            {messages[messages.length - 1]?.from === 'guide' && !isThinking && (
              <div className="quick-replies">
                {currentQuestion.suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => onSend(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            <div className="composer__box">
              <textarea
                aria-label="メッセージ"
                placeholder="浮かんだことを、そのまま聞かせてください"
                rows={1}
                value={value}
                disabled={isThinking}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    submit(event)
                  }
                }}
              />
              <button type="submit" aria-label="送信" disabled={!value.trim() || isThinking}>
                <SendIcon />
              </button>
            </div>
            <p>うまく言葉にできなくても大丈夫です</p>
          </form>
        )}
      </section>
    </main>
  )
}

function JourneyMap() {
  return (
    <svg className="journey-map" viewBox="0 0 360 210" role="img" aria-label="過去、現在、未来をつなぐ地図">
      <path className="map-paper" d="m22 49 88-24 70 24 74-25 84 25v125l-84 25-74-25-70 24-88-24Z" />
      <path d="m22 49 88-24 70 24 74-25 84 25v125l-84 25-74-25-70 24-88-24ZM110 25v173M180 49v125M254 24v175" />
      <path className="map-river" d="M174 43c-26 24 23 39-2 62-27 25 11 46-7 76" />
      <path d="M50 135c24-30 39-12 57-37s40-21 64 7 45 22 64-5 43-29 73-8" />
      <g className="map-tree">
        <path d="M67 81v28M57 102h20M67 79c-11 0-14-14-6-19 1-12 17-12 20-2 10 4 7 20-4 21Z" />
        <path d="M285 119v31M274 142h22M285 117c-12-1-15-15-6-21 1-12 18-13 21-2 10 5 7 21-5 22Z" />
      </g>
      <circle className="map-point map-point--past" cx="79" cy="131" r="7" />
      <circle className="map-point map-point--now" cx="180" cy="105" r="7" />
      <circle className="map-point map-point--future" cx="286" cy="78" r="7" />
      <path className="map-route" d="M79 131c35 13 68 4 101-26 37-33 66-37 106-27" />
      <path className="map-flag" d="M286 78V48h25l-9 9 9 9h-25" />
    </svg>
  )
}

function Summary({
  answers,
  onBack,
  onRestart,
}: {
  answers: string[]
  onBack: () => void
  onRestart: () => void
}) {
  const scenes = [
    {
      label: '過去',
      className: 'past',
      title: '心が動いていた時間',
      text: answers[0] || '好きだったことに夢中になる、まっすぐな時間。',
    },
    {
      label: '現在',
      className: 'now',
      title: '自然に惹かれるもの',
      text: answers[1] || '理由より先に、心と身体が向かっていくもの。',
    },
    {
      label: '身体',
      className: 'body',
      title: '歩幅を教えるサイン',
      text: answers[2] || '少し立ち止まった方がいい、と身体が教える瞬間。',
    },
    {
      label: '未来',
      className: 'future',
      title: '心地よさそうな方角',
      text: answers[3] || '急がず、自分の時間を大切にできる一日。',
    },
  ]

  return (
    <main className="result-page">
      <header className="result-header">
        <button onClick={onBack} aria-label="会話へ戻る">
          <span>←</span>
          会話へ戻る
        </button>
        <div>
          <LeafMark small />
          自分探検
        </div>
        <span>MY MAP</span>
      </header>

      <div className="result-scroll">
        <section className="result-intro">
          <p>YOUR INNER MAP</p>
          <h1>景色が集まりました</h1>
          <span>答えではなく、今のあなたから見えている景色です。</span>
          <JourneyMap />
        </section>

        <section className="collected-scenes">
          <div className="section-heading">
            <span>01</span>
            <div>
              <p>COLLECTED SCENES</p>
              <h2>集まった4つの景色</h2>
            </div>
          </div>
          <div className="scene-list">
            {scenes.map((scene) => (
              <article className={`scene-item scene-item--${scene.className}`} key={scene.label}>
                <span>{scene.label}</span>
                <div>
                  <h3>{scene.title}</h3>
                  <p>「{scene.text}」</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="map-message">
          <LeafMark small />
          <p>いま、地図から見えてくること</p>
          <blockquote>
            あなたの景色には、<em>自分の感覚を大切にしながら、無理のない歩幅で進みたい</em>
            という流れがありそうです。
          </blockquote>
          <span>
            これは診断や結論ではありません。
            <br />
            今日見つけた、ひとつの見方として持ち帰ってください。
          </span>
        </section>

        <div className="result-actions">
          <button className="primary-button" onClick={onRestart}>
            もう一度、探検する
            <ArrowIcon />
          </button>
          <button className="text-button" onClick={onBack}>
            会話を読み返す
          </button>
        </div>
      </div>
    </main>
  )
}

export default function App() {
  const [view, setView] = useState<View>('welcome')
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      from: 'guide',
      text: 'こんにちは。今日から私は、答えを教える先生ではなく、あなたの足元をそっと照らす懐中電灯になります。',
    },
    {
      id: 2,
      from: 'guide',
      text: firstQuestion,
    },
  ])

  function sendMessage(text: string) {
    if (isThinking || completed) return

    const id = Date.now()
    setMessages((current) => [...current, { id, from: 'user', text }])
    setAnswers((current) => [...current, text])
    setIsThinking(true)

    window.setTimeout(() => {
      const question = questions[questionIndex]
      const guideMessages: Message[] = [
        {
          id: id + 1,
          from: 'guide',
          text: question.reply,
        },
      ]

      if (question.next) {
        guideMessages.push({
          id: id + 2,
          from: 'guide',
          text: question.next,
        })
        setQuestionIndex((current) => current + 1)
      } else {
        setCompleted(true)
      }

      setMessages((current) => [...current, ...guideMessages])
      setIsThinking(false)
    }, 720)
  }

  function restartJourney() {
    setQuestionIndex(0)
    setAnswers([])
    setCompleted(false)
    setIsThinking(false)
    setMessages([
      {
        id: 1,
        from: 'guide',
        text: 'こんにちは。今日から私は、答えを教える先生ではなく、あなたの足元をそっと照らす懐中電灯になります。',
      },
      {
        id: 2,
        from: 'guide',
        text: firstQuestion,
      },
    ])
    setView('explore')
  }

  if (view === 'welcome') {
    return <Welcome onStart={restartJourney} />
  }

  if (view === 'summary') {
    return (
      <Summary
        answers={answers}
        onBack={() => setView('explore')}
        onRestart={restartJourney}
      />
    )
  }

  return (
    <Explorer
      messages={messages}
      onSend={sendMessage}
      onBack={() => setView('welcome')}
      questionIndex={questionIndex}
      completed={completed}
      isThinking={isThinking}
      onShowSummary={() => setView('summary')}
    />
  )
}
