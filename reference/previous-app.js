"use strict";
(() => {
  const KEY = "jibun-tanken-v1";
  const questions = [
    { era: "過去", title: "心に残る景色", text: "これまでの中で、ふと心に浮かぶ場面はありますか？ 小さな出来事でも、好きだった時間でも。" },
    { era: "過去", title: "大切だったこと", text: "その頃、大切にしていたことや、好きだったことはありますか？ 思い出せる範囲で大丈夫です。" },
    { era: "現在", title: "いまの気持ち", text: "いまの毎日を眺めてみると、どんな気持ちが浮かびますか？" },
    { era: "現在", title: "自分に戻る時間", text: "最近、自分らしくいられると感じた時間や場所はありますか？ 浮かばなければ、スキップして大丈夫です。" },
    { era: "未来", title: "これからの景色", text: "これから、どんな時間を過ごせたらいいなと思いますか？ はっきりした目標でなくても大丈夫です。" },
    { era: "未来", title: "小さな一歩", text: "その景色に向けて、試してみたいことはありますか？ まだ決めずに、ここで休んでも大丈夫です。" }
  ];
  const $ = id => document.getElementById(id);
  const skipButton = $("skip");
  const fresh = () => ({ version: 1, started: false, answers: [], draft: "" });
  let state = fresh();
  let storageBroken = false;
  let replying = false;
  let replyTimer;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function lockComposer(locked) {
    replying = locked;

    $("skip").disabled = locked;
    $("answer-form").querySelector("[type=submit]").disabled = locked;
  }
  function notice(text) { $("storage-notice").textContent = text; $("storage-notice").hidden = false; }
  function valid(data) {
    return data && data.version === 1 && typeof data.started === "boolean" && Array.isArray(data.answers) && data.answers.length <= questions.length && data.answers.every(a => a === null || (typeof a === "string" && a.length <= 2000 && a.trim().length > 0)) && typeof data.draft === "string" && data.draft.length <= 2000 && (data.started || (data.answers.length === 0 && data.draft === ""));
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== null) {
      try {
        const data = JSON.parse(raw);
        if (!valid(data)) throw new Error("Invalid record");
        state = data;
      } catch {
        storageBroken = true;
        notice("保存された記録を読み込めませんでした。元の記録を上書きしないよう、今回は保存せずに進めます。「記録をすべて削除」で保存を再開できます。");
      }
    }
  } catch { storageBroken = true; notice("このブラウザでは保存を利用できません。画面を閉じると今回の記録は失われます。"); }
  function save() {
    if (storageBroken) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch { storageBroken = true; notice("記録を保存できませんでした。画面を閉じると最新の回答が失われる可能性があります。この画面では探検を続けられます。"); }
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  let scrollFrame = 0;
  let viewportFrame = 0;
  let followingLatest = true;
  const deleteHome = $("delete").parentElement;
  function followConversation() {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if ($("chat").hidden) return;
      const messages = $("messages");
      // キーボードのアニメーションとページ全体のスムーズスクロールを競合させない。
      const bottom = messages.scrollHeight - messages.clientHeight;
      if (Math.abs(messages.scrollTop - bottom) > 1) messages.scrollTop = bottom;
      followingLatest = true;
    });
  }
  function fitChatViewport() {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(() => {
      if ($("chat").hidden) return;
      const viewport = window.visualViewport;
      const height = Math.round(viewport?.height || innerHeight);
      const layoutHeight = Math.max(document.documentElement.clientHeight, innerHeight);
      const keyboardVisible = document.activeElement === $("answer") && layoutHeight - height > 100;
      // キーボードで可視領域が縮み、上へパンした間だけ補正する。
      // フォーカスが外れた後や高さが戻った後の古いoffsetTopは採用しない。
      const top = keyboardVisible ? Math.max(0, Math.min(Math.round(viewport?.offsetTop || 0), layoutHeight - height)) : 0;
      const changed = $("chat").style.height !== height + "px";
      if (changed) $("chat").style.height = height + "px";
      if ($("chat").style.top !== top + "px") $("chat").style.top = top + "px";
      if (changed && followingLatest) followConversation();
    });
  }
  window.visualViewport?.addEventListener("resize", fitChatViewport);
  // resizeとscrollは順不同で届くため、毎回フォーカスと高さを合わせて判断する。
  window.visualViewport?.addEventListener("scroll", fitChatViewport);
  window.addEventListener("resize", fitChatViewport);
  let gestureY = null;
  document.addEventListener("touchstart", event => {
    gestureY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  document.addEventListener("touchmove", event => {
    if (!document.body.classList.contains("chatting") || gestureY === null || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    const delta = y - gestureY;
    gestureY = y;
    // スクロール可能な領域だけにジェスチャーを渡す。上下端から外側へは伝播させない。
    const scroller = event.target.closest("#messages, #answer, #storage-notice, dialog");
    if (scroller) {
      const bottom = scroller.scrollHeight - scroller.clientHeight;
      if (bottom > 1 && ((delta < 0 && scroller.scrollTop < bottom - 1) || (delta > 0 && scroller.scrollTop > 1))) return;
    }
    if (event.cancelable) event.preventDefault();
  }, { passive: false });
  document.addEventListener("touchend", () => { gestureY = null; }, { passive: true });
  document.addEventListener("touchcancel", () => { gestureY = null; }, { passive: true });
  $("messages").addEventListener("scroll", () => {
    const messages = $("messages");
    followingLatest = messages.scrollHeight - messages.clientHeight - messages.scrollTop < 40;
  }, { passive: true });
  // スワイプによる読み返しとタップを区別する。
  let touchStart;
  $("messages").addEventListener("pointerdown", event => { touchStart = { x: event.clientX, y: event.clientY }; });
  $("messages").addEventListener("pointerup", event => {
    if (!event.target.closest("button") && touchStart && Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) < 10 && !window.getSelection()?.toString()) $("answer").blur();
    touchStart = null;
  });
  $("messages").addEventListener("pointercancel", () => { touchStart = null; });
  function bubble(text, who, label, animate = false) {
    const el = element("div", "bubble " + who + (animate ? " bubble-enter" : ""));
    el.append(element("small", "", label), document.createTextNode(text));
    $("messages").append(el);
    $("messages").append(skipButton);
    return el;
  }
  function renderChat(focus) {
    $("messages").replaceChildren();
    bubble("こんにちは😊 ここでは、心に浮かぶ景色を少しずつ集めます。うまく話そうとしなくて大丈夫。答えにくい問いは、スキップできます。", "guide", "探検の道しるべ");
    state.answers.forEach((answer, i) => {
      bubble(questions[i].text, "guide", questions[i].era + "の景色");
      bubble(answer === null ? "この問いは、ひとまずスキップ" : answer, "user", "あなた");
    });
    const current = questions[state.answers.length];
    bubble(current.text, "guide", current.era + "の景色");
    updateProgress();
    $("answer").value = state.draft;
    $("count").textContent = state.draft.length + " / 2000";
    resizeInput();
    if (focus) $("chat-title").focus({ preventScroll: true });
    followConversation();
  }
  function updateProgress() {
    $("step-label").textContent = (state.answers.length + 1) + " / 6";
    $("progress").value = state.answers.length;
  }
  function renderCollection() {
    const collected = state.answers.filter(answer => answer !== null).length;
    $("arrival-summary").textContent = collected ? "あなたの言葉から、" + collected + "つの景色が見つかりました。" : "今日は、余白の景色を持ち帰りましょう。";
    $("scene-fragments").replaceChildren();
    $("cards").replaceChildren();
    const icons = ["❀", "✧", "☁", "♧", "☀", "✦"];
    questions.forEach((q, i) => {
      const answer = state.answers[i];
      if (answer !== null) {
        const fragment = element("span", "scene-fragment", answer.length > 28 ? answer.slice(0, 28) + "…" : answer);
        fragment.style.setProperty("--order", i);
        $("scene-fragments").append(fragment);
      }
      const scene = element("details", "scene-card era-" + Math.floor(i / 2));
      scene.style.setProperty("--order", i);
      const summary = element("summary", "");
      const icon = element("span", "scene-icon", icons[i]); icon.setAttribute("aria-hidden", "true");
      summary.append(element("span", "scene-era", q.era + " / " + String(i + 1).padStart(2, "0")), icon, element("h2", "", q.title), element("p", "scene-preview", answer === null ? "まだ余白のままの景色" : answer.length > 65 ? answer.slice(0, 65) + "…" : answer), element("span", "scene-open", "言葉をひらく ＋"));
      scene.append(summary, element("p", "scene-question", q.text), element("p", "words", answer === null ? "何も浮かばない日も、そのままで。ここには余白を残しました。" : answer));
      $("cards").append(scene);
    });
  }
  function render(focus = false) {
    const completed = state.answers.length === questions.length;
    $("welcome").hidden = state.started;
    $("chat").hidden = !state.started || completed;
    $("result").hidden = !state.started || !completed;
    $("arrival").hidden = !state.started || !completed;
    $("delete").hidden = !state.started && !storageBroken;
    const chatting = state.started && !completed;
    document.body.classList.toggle("chatting", chatting);
    document.documentElement.classList.toggle("chatting", chatting);
    if (chatting && window.scrollY !== 0) window.scrollTo({ top: 0, behavior: "instant" });
    (chatting ? $("settings-actions") : deleteHome).append($("delete"));
    if (chatting) fitChatViewport();
    if (!state.started) return;
    if (completed) {
      renderCollection();
      if (focus) { $("answer").blur(); $("arrival-title").focus({ preventScroll: true }); $("arrival").scrollIntoView({ block: "start", behavior: "instant" }); }
      return;
    }
    renderChat(focus);
  }

  $("start").addEventListener("click", () => { state.started = true; save(); render(true); });
  $("answer").addEventListener("input", () => {
    state.draft = $("answer").value;
    $("answer").setCustomValidity("");
    $("count").textContent = state.draft.length + " / 2000";
    resizeInput();
    save();
  });
  function resizeInput() {
    $("answer").style.height = "44px";
    $("answer").style.height = Math.min(88, $("answer").scrollHeight) + "px";
  }
  let keyboardRecoveryTimers = [];
  function cancelKeyboardRecovery() {
    keyboardRecoveryTimers.forEach(clearTimeout);
    keyboardRecoveryTimers = [];
  }
  function restoreChatAfterKeyboard() {
    cancelKeyboardRecovery();
    if ($("chat").hidden) return;
    document.body.classList.remove("keyboard-open");
    const restore = () => {
      if ($("chat").hidden || document.activeElement === $("answer")) return;
      // blur直後はSafariのキーボード終了アニメーション中なので、終了後も再確認する。
      // 会話欄のscrollTopと書きかけは変更しない。
      $("chat").style.top = "0px";
      if (window.scrollX || window.scrollY) window.scrollTo({ left: 0, top: 0, behavior: "instant" });
      fitChatViewport();
    };
    restore();
    keyboardRecoveryTimers = [120, 350, 700].map(delay => setTimeout(restore, delay));
  }
  $("answer").addEventListener("focus", () => {
    cancelKeyboardRecovery();
    document.body.classList.add("keyboard-open");
    fitChatViewport();
  });
  $("answer").addEventListener("blur", restoreChatAfterKeyboard);
  window.addEventListener("pageshow", () => {
    if (document.activeElement !== $("answer")) restoreChatAfterKeyboard();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.activeElement !== $("answer")) restoreChatAfterKeyboard();
  });
  // 入力欄の外をドラッグしてもページ全体のラバーバンドを起こさない。
  $("answer-form").addEventListener("touchmove", event => {
    if (event.target !== $("answer")) event.preventDefault();
  }, { passive: false });
  skipButton.addEventListener("pointerdown", event => {
    if (document.activeElement === $("answer")) event.preventDefault();
  });
  function advance(answer) {
    if (replying || !state.started || state.answers.length >= questions.length) return;
    state.answers.push(answer); state.draft = ""; $("answer").setCustomValidity(""); save();
    $("answer").value = ""; resizeInput(); $("count").textContent = "0 / 2000";
    lockComposer(true);
    bubble(answer === null ? "この問いは、ひとまずスキップ" : answer, "user", "あなた", true);
    const waiting = bubble("次の問いをひらいています …", "guide", "景色集め", true);
    waiting.classList.add("waiting");
    followConversation();
    replyTimer = window.setTimeout(() => {
      waiting.remove(); lockComposer(false);
      if (state.answers.length === questions.length) { render(true); return; }
      const current = questions[state.answers.length];
      bubble(current.text, "guide", current.era + "の景色", true);
      updateProgress(); followConversation();
    }, reducedMotion() ? 100 : 700);
  }

  $("answer-form").addEventListener("submit", event => {
    event.preventDefault();
    const answer = $("answer").value.trim();
    if (!answer) { $("answer").setCustomValidity("言葉を入力するか、スキップを選んでください。"); $("answer").reportValidity(); return; }
    advance(answer);
  });
  $("answer-form").querySelector("[type=submit]").addEventListener("pointerdown", event => {
    if (document.activeElement === $("answer")) event.preventDefault();
  });
  $("skip").addEventListener("click", () => advance(null));
  $("open-journal").addEventListener("click", () => {
    $("answer").blur();
    $("journal-scenes").replaceChildren();
    state.answers.forEach((answer, i) => {
      const scene = element("article", "journal-scene");
      scene.append(element("h3", "", questions[i].era + " · " + questions[i].title), element("p", "", answer === null ? "この景色は、まだ余白のまま。" : answer));
      $("journal-scenes").append(scene);
    });
    if (!state.answers.length) $("journal-scenes").append(element("p", "", "見つけた景色は、ここに少しずつ増えていきます。"));
    $("journal-dialog").showModal();
  });
  $("open-settings").addEventListener("click", () => { $("answer").blur(); $("settings-dialog").showModal(); });
  $("open-help").addEventListener("click", () => { $("answer").blur(); $("help-dialog").showModal(); });
  $("delete").addEventListener("click", () => { $("settings-dialog").close(); $("delete-error").hidden = true; $("delete-dialog").showModal(); $("cancel-delete").focus(); });
  $("cancel-delete").addEventListener("click", () => $("delete-dialog").close());
  $("confirm-delete").addEventListener("click", () => {
    try { localStorage.removeItem(KEY); }
    catch { $("delete-error").textContent = "ブラウザの保存領域にアクセスできず、削除を確認できませんでした。ブラウザの設定からサイトデータを削除してください。"; $("delete-error").hidden = false; return; }
    clearTimeout(replyTimer); lockComposer(false);
    state = fresh(); storageBroken = false;
    $("storage-notice").hidden = true;
    $("answer").value = ""; $("answer").setCustomValidity("");
    $("messages").replaceChildren(skipButton); $("cards").replaceChildren(); $("scene-fragments").replaceChildren();
    $("delete-dialog").close(); render(); $("start").focus();
  });
  render();
})();
