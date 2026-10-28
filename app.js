"use strict";
(() => {
  const KEY = "jibun-tanken-v1";
  const $ = id => document.getElementById(id);
  const questions = [
    { era: "過去", title: "心に残る景色", text: "これまでの中で、ふと心に浮かぶ場面はありますか？ 小さな出来事でも、好きだった時間でも。" },
    { era: "過去", title: "大切だったこと", text: "その頃、大切にしていたことや、好きだったことはありますか？ 思い出せる範囲で大丈夫です。" },
    { era: "現在", title: "いまの気持ち", text: "いまの毎日を眺めてみると、どんな気持ちが浮かびますか？" },
    { era: "現在", title: "自分に戻る時間", text: "最近、自分らしくいられると感じた時間や場所はありますか？ 浮かばなければ、スキップして大丈夫です。" },
    { era: "未来", title: "これからの景色", text: "これから、どんな時間を過ごせたらいいなと思いますか？ はっきりした目標でなくても大丈夫です。" },
    { era: "未来", title: "小さな一歩", text: "その景色に向けて、試してみたいことはありますか？ まだ決めずに、ここで休んでも大丈夫です。" }
  ];
  const fresh = () => ({ version: 1, started: false, answers: [], draft: "" });
  let state = fresh();
  let storageBroken = false;
  let busy = false;
  let replyTimer;
  let viewportFrame;
  let scrollFrame;
  let recoveryTimers = [];
  let followingLatest = true;
  let deleteOpener;
  const complete = () => state.answers.length === questions.length;
  function notify(text) { $("storage-notice").textContent = text; $("storage-notice").hidden = false; }
  function valid(data) {
    return data && data.version === 1 && typeof data.started === "boolean" && Array.isArray(data.answers) && data.answers.length <= 6 && data.answers.every(a => a === null || (typeof a === "string" && a.trim() && a.length <= 2000)) && typeof data.draft === "string" && data.draft.length <= 2000 && (data.started || (!data.answers.length && !data.draft));
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      try { const saved = JSON.parse(raw); if (!valid(saved)) throw Error(); state = saved; }
      catch { storageBroken = true; notify("保存された記録を読み込めませんでした。元の記録を上書きせず、今回は保存なしで進めます。記録を削除すると保存を再開できます。"); }
    }
  } catch { storageBroken = true; notify("このブラウザでは保存を利用できません。画面を閉じると今回の記録は失われます。"); }
  function save() {
    if (storageBroken) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { storageBroken = true; notify("記録を保存できませんでした。画面を閉じると最新の言葉が失われる可能性があります。"); }
  }
  function node(tag, cls, text) { const el = document.createElement(tag); if (cls) el.className = cls; if (text !== undefined) el.textContent = text; return el; }
  function leaf() { const el = node("span", "leaf-mark leaf-mark--small"); el.setAttribute("aria-hidden", "true"); el.append(node("span"), node("span")); return el; }
  function addMessage(text, who, animate = false) {
    const el = node("div", "message message--" + who + (animate ? " is-new" : ""));
    if (who === "guide") { const avatar = node("div", "message__avatar"); avatar.append(leaf()); el.append(avatar); }
    const content = node("div", "message__content");
    if (who === "guide") content.append(node("span", "", "森の案内人"));
    content.append(node("p", "", text)); el.append(content); $("messages").append(el); return el;
  }
  function follow() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if ($("chat").hidden) return;
      const area = $("conversation-scroll");
      area.scrollTop = Math.max(0, area.scrollHeight - area.clientHeight);
      followingLatest = true;
    });
  }
  function fitViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      if ($("chat").hidden) return;
      const vv = window.visualViewport;
      const height = Math.round(vv?.height || innerHeight);
      const layoutHeight = Math.max(document.documentElement.clientHeight, innerHeight);
      const keyboard = document.activeElement === $("answer") && layoutHeight - height > 100;
      const top = keyboard ? Math.max(0, Math.min(Math.round(vv?.offsetTop || 0), layoutHeight - height)) : 0;
      const changed = $("chat").style.height !== height + "px";
      $("chat").style.height = height + "px"; $("chat").style.top = top + "px";
      if (changed && followingLatest) follow();
    });
  }
  window.visualViewport?.addEventListener("resize", fitViewport);
  window.visualViewport?.addEventListener("scroll", fitViewport);
  window.addEventListener("resize", fitViewport);
  function cancelRecovery() { recoveryTimers.forEach(clearTimeout); recoveryTimers = []; }
  function restoreAfterKeyboard() {
    cancelRecovery(); document.body.classList.remove("keyboard-open");
    const restore = () => { if ($("chat").hidden || document.activeElement === $("answer")) return; if (scrollY || scrollX) window.scrollTo({ top: 0, left: 0, behavior: "instant" }); fitViewport(); };
    restore(); recoveryTimers = [120, 350, 700].map(ms => setTimeout(restore, ms));
  }
  $("answer").addEventListener("focus", () => { cancelRecovery(); document.body.classList.add("keyboard-open"); fitViewport(); });
  $("answer").addEventListener("blur", restoreAfterKeyboard);
  window.addEventListener("pageshow", () => { if (document.activeElement !== $("answer")) restoreAfterKeyboard(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && document.activeElement !== $("answer")) restoreAfterKeyboard(); });
  $("conversation-scroll").addEventListener("scroll", () => { const el = $("conversation-scroll"); followingLatest = el.scrollHeight - el.clientHeight - el.scrollTop < 40; }, { passive: true });
  let pointer;
  $("conversation-scroll").addEventListener("pointerdown", e => { pointer = { x: e.clientX, y: e.clientY }; });
  $("conversation-scroll").addEventListener("pointerup", e => { if (pointer && !e.target.closest("button") && Math.hypot(pointer.x - e.clientX, pointer.y - e.clientY) < 10 && !window.getSelection()?.toString()) $("answer").blur(); pointer = null; });
  $("conversation-scroll").addEventListener("pointercancel", () => { pointer = null; });
  let touchY;
  document.addEventListener("touchstart", e => { touchY = e.touches.length === 1 ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener("touchmove", e => {
    if ($("chat").hidden || touchY == null || e.touches.length !== 1) return;
    const delta = e.touches[0].clientY - touchY; touchY = e.touches[0].clientY;
    const area = e.target.closest("#conversation-scroll, #answer, #storage-notice, dialog");
    if (area) { const bottom = area.scrollHeight - area.clientHeight; if (bottom > 1 && ((delta < 0 && area.scrollTop < bottom - 1) || (delta > 0 && area.scrollTop > 1))) return; }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  for (const type of ["touchend", "touchcancel"]) document.addEventListener(type, () => { touchY = null; }, { passive: true });
  function resizeInput() { $("answer").style.height = "44px"; $("answer").style.height = Math.min(110, $("answer").scrollHeight) + "px"; }
  function updateControls() { $("send").disabled = busy || complete() || !$("answer").value.trim(); $("skip").disabled = busy; }
  function updateProgress() {
    const index = Math.min(state.answers.length, 5); const era = Math.floor(index / 2);
    $("step-label").textContent = (complete() ? 6 : index + 1) + " / 6";
    $("progress-bar").style.width = (complete() ? 100 : (index + 1) / 6 * 100) + "%";
    $("chapter-number").textContent = "SCENE " + String(index + 1).padStart(2, "0") + " / 06";
    $("chat-title").textContent = complete() ? "集まった景色を振り返る" : questions[index].era + "の景色";
    $("chapter-caption").textContent = ["記憶に残っている、小さな道を歩きます", "いまの心と、自分の時間を眺めます", "まだ見ぬ、心地よい方角を思い描きます"][era];
    document.querySelectorAll("[data-era]").forEach((el, i) => { el.classList.toggle("is-active", i === era); el.classList.toggle("is-done", complete() || i < era); });
    $("answer-form").hidden = complete(); $("summary-cta").hidden = !complete(); $("skip").hidden = complete(); updateControls();
  }
  function renderChat() {
    $("messages").replaceChildren();
    addMessage("こんにちは。ここでは、あなたの足元をそっと照らす懐中電灯のように、景色集めを案内します。ひと言でも、思いつくままでも。答えにくい問いはスキップして大丈夫です。", "guide");
    state.answers.forEach((answer, i) => { addMessage(questions[i].text, "guide"); addMessage(answer === null ? "この問いは、ひとまずスキップ" : answer, "user"); });
    if (complete()) addMessage("景色が集まりました😊", "guide");
    else addMessage(questions[state.answers.length].text, "guide");
    $("answer").value = state.draft; $("count").textContent = state.draft.length + " / 2000";
    resizeInput(); updateProgress(); follow();
  }
  function renderResult() {
    $("cards").replaceChildren(); $("scene-fragments").replaceChildren();
    ["過去", "現在", "未来"].forEach((era, index) => {
      const card = node("article", "scene-item scene-item--" + ["past", "now", "future"][index]);
      card.append(node("span", "", era)); const content = node("div");
      questions.forEach((q, i) => { if (q.era !== era) return; content.append(node("h3", "", q.title), node("p", "words", state.answers[i] === null ? "この景色は、まだ余白のまま。" : state.answers[i])); });
      card.append(content); $("cards").append(card);
    });
    state.answers.forEach((answer, i) => { if (answer === null) return; const fragment = node("span", "collection-fragment", answer.length > 30 ? answer.slice(0, 30) + "…" : answer); fragment.style.setProperty("--order", i); $("scene-fragments").append(fragment); });
    const empty = state.answers.every(a => a === null);
    $("result-title").textContent = empty ? "今日は、余白を持ち帰ろう。" : "景色が集まりました😊";
    if (empty) $("scene-fragments").append(node("p", "", "言葉が浮かばない日も、そのままで大丈夫。"));
  }
  function show(view, focus = true) {
    if (view !== "chat") {
      // 送信直後に休憩しても、保存済み回答から再構築できる。古い返答タイマーは残さない。
      clearTimeout(replyTimer); busy = false;
      $("answer").blur();
    }
    ["welcome", "chat", "result"].forEach(id => { $(id).hidden = id !== view; });
    document.body.classList.toggle("chatting", view === "chat"); document.documentElement.classList.toggle("chatting", view === "chat");
    if (view === "welcome") { $("start").firstChild.textContent = complete() ? "集まった景色を見る" : state.started ? "探検の続きを歩く" : "探検をはじめる"; $("home-record").hidden = !state.started && !storageBroken; if (focus) { $("start").focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); } }
    if (view === "chat") { fitViewport(); renderChat(); if (focus) $("chat-title").focus({ preventScroll: true }); }
    if (view === "result") { renderResult(); $("result-scroll").scrollTop = 0; if (focus) $("result-title").focus({ preventScroll: true }); }
  }
  function advance(answer) {
    if (busy || complete() || !state.started) return;
    state.answers.push(answer); state.draft = ""; save();
    busy = true; $("answer").value = ""; $("count").textContent = "0 / 2000"; resizeInput(); updateControls();
    addMessage(answer === null ? "この問いは、ひとまずスキップ" : answer, "user", true);
    const waiting = node("div", "thinking-dots waiting"); waiting.setAttribute("role", "status"); waiting.setAttribute("aria-label", "次の道しるべをひらいています"); waiting.append(node("i"), node("i"), node("i")); $("messages").append(waiting); follow();
    replyTimer = setTimeout(() => {
      waiting.remove(); busy = false;
      addMessage(complete() ? "景色が集まりました😊" : questions[state.answers.length].text, "guide", true);
      updateProgress(); follow();
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 50 : 500);
  }
  $("start").addEventListener("click", () => { state.started = true; save(); show(complete() ? "result" : "chat"); });
  document.querySelector(".flyer-logo").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.querySelectorAll("[data-home]").forEach(el => el.addEventListener("click", () => show("welcome")));
  $("result-home").addEventListener("click", () => show("welcome"));
  $("show-summary").addEventListener("click", () => show("result"));
  $("back-chat").addEventListener("click", () => show("chat"));
  $("answer").addEventListener("input", () => { state.draft = $("answer").value; $("answer").setCustomValidity(""); $("count").textContent = state.draft.length + " / 2000"; resizeInput(); updateControls(); save(); });
  $("answer-form").addEventListener("submit", event => { event.preventDefault(); const answer = $("answer").value.trim(); if (answer && answer.length <= 2000) advance(answer); });
  // IME確定のEnterや改行を送信と取り違えない。送信はボタン、またはCtrl/Cmd+Enter。
  $("answer").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); $("answer-form").requestSubmit(); } });
  $("skip").addEventListener("click", () => advance(null));
  for (const el of [$("skip"), $("send")]) el.addEventListener("pointerdown", e => { if (document.activeElement === $("answer")) e.preventDefault(); });
  function openDelete(e) { deleteOpener = e.currentTarget; $("answer").blur(); $("delete-error").hidden = true; $("delete-dialog").showModal(); $("cancel-delete").focus(); }
  document.querySelectorAll("[data-delete], #home-record").forEach(el => el.addEventListener("click", openDelete));
  $("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
  $("delete-dialog").addEventListener("close", () => { if (deleteOpener && !deleteOpener.closest("[hidden]")) deleteOpener.focus({ preventScroll: true }); });
  $("confirm-delete").addEventListener("click", () => {
    try { localStorage.removeItem(KEY); }
    catch { $("delete-error").textContent = "保存領域にアクセスできず、削除を確認できませんでした。ブラウザの設定からこのサイトのデータを削除してください。"; $("delete-error").hidden = false; return; }
    clearTimeout(replyTimer); cancelRecovery(); busy = false; state = fresh(); storageBroken = false; deleteOpener = null;
    $("answer").value = ""; $("messages").replaceChildren(); $("cards").replaceChildren(); $("scene-fragments").replaceChildren(); $("storage-notice").hidden = true;
    $("delete-dialog").close(); show("welcome");
  });
  show(state.started ? complete() ? "result" : "chat" : "welcome", false);
})();
