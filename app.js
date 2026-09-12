(function () {
  "use strict";

  var STORAGE_KEY = "imessage_journal_conversations_v1";
  var GROUP_GAP_MS = 60 * 1000;        // messages within this gap render tightly grouped
  var HEADER_GAP_MS = 60 * 60 * 1000;  // a new date/time header appears after this much silence

  var AVATAR_PALETTE = ["#FF9500", "#FF3B30", "#34C759", "#5AC8FA", "#AF52DE", "#FF2D55", "#5856D6", "#FFCC00"];

  /* ---------------- state ---------------- */
  var conversations = loadConversations();
  var currentConversationId = null;
  var editMode = false;
  var pendingDeleteId = null;
  var draftNewConversation = null; // { name, avatarColor } while composing a brand-new thread

  /* ---------------- storage ---------------- */
  function loadConversations() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Failed to load conversations", e);
      return [];
    }
  }

  function saveConversations() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    } catch (e) {
      console.error("Failed to save conversations", e);
      alert("Couldn't save — your browser storage may be full.");
    }
  }

  /* ---------------- helpers ---------------- */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function hashColor(name) {
    var sum = 0;
    for (var i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    return AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
  }

  function isSameDay(a, b) {
    return a.toDateString() === b.toDateString();
  }

  function findConversationByNameCI(name) {
    var lower = name.trim().toLowerCase();
    for (var i = 0; i < conversations.length; i++) {
      if (conversations[i].name.trim().toLowerCase() === lower) return conversations[i];
    }
    return null;
  }

  function getConversationById(id) {
    for (var i = 0; i < conversations.length; i++) {
      if (conversations[i].id === id) return conversations[i];
    }
    return null;
  }

  function formatListTime(ts) {
    var d = new Date(ts), now = new Date();
    if (isSameDay(d, now)) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return "Yesterday";
    var diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
  }

  function formatThreadHeader(ts) {
    var d = new Date(ts), now = new Date();
    var time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (isSameDay(d, now)) return "Today " + time;
    var yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return "Yesterday " + time;
    var diffDays = Math.floor((now - d) / 86400000);
    if (diffDays < 6) return d.toLocaleDateString([], { weekday: "long" }) + " " + time;
    var opts = { month: "short", day: "numeric" };
    if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString([], opts) + " " + time;
  }

  function avatarInnerHTML(conv) {
    if (conv.avatarImage) return '<img src="' + conv.avatarImage + '" alt="" />';
    var initial = (conv.name || "?").trim().charAt(0).toUpperCase() || "?";
    return "<span>" + escapeHTML(initial) + "</span>";
  }

  function avatarStyle(conv) {
    return conv.avatarImage ? "" : ' style="background:' + (conv.avatarColor || hashColor(conv.name || "?")) + '"';
  }

  /* ---------------- navigation ---------------- */
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) { s.classList.remove("active"); });
    document.getElementById(id).classList.add("active");
  }

  /* ---------------- inbox rendering ---------------- */
  var listEl = document.getElementById("conversation-list");
  var emptyStateEl = document.getElementById("empty-state");
  var emptyTitleEl = document.getElementById("empty-title");
  var emptySubEl = document.getElementById("empty-sub");
  var searchInput = document.getElementById("search-input");
  var fabComposeBtn = document.getElementById("fab-compose-btn");

  function highlightMatch(text, query) {
    if (!query) return escapeHTML(text);
    var lower = text.toLowerCase();
    var idx = lower.indexOf(query);
    if (idx === -1) return escapeHTML(text);
    return escapeHTML(text.slice(0, idx)) + "<mark>" + escapeHTML(text.slice(idx, idx + query.length)) + "</mark>" + escapeHTML(text.slice(idx + query.length));
  }

  function renderInbox() {
    var filter = searchInput.value.trim().toLowerCase();
    var sorted = conversations.slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });

    // Totally new user: no conversations exist at all yet.
    if (conversations.length === 0) {
      editMode = false;
      editBtn.hidden = true;
      editBtn.textContent = "Edit";
      fabComposeBtn.hidden = false;
      emptyTitleEl.textContent = "No Messages";
      emptySubEl.innerHTML = 'Tap <span class="empty-icon">✎</span> to start writing.';
      emptyStateEl.hidden = false;
      listEl.innerHTML = "";
      return;
    }
    editBtn.hidden = false;
    fabComposeBtn.hidden = true;

    // Build result set — searches conversation names AND message content.
    var results = sorted.map(function (conv) {
      if (!filter) return { conv: conv, matchMsg: null };
      var nameMatch = conv.name.toLowerCase().indexOf(filter) !== -1;
      if (nameMatch) return { conv: conv, matchMsg: null };
      for (var i = conv.messages.length - 1; i >= 0; i--) {
        if (conv.messages[i].text.toLowerCase().indexOf(filter) !== -1) {
          return { conv: conv, matchMsg: conv.messages[i] };
        }
      }
      return null;
    }).filter(Boolean);

    if (filter && results.length === 0) {
      emptyTitleEl.textContent = "No Results";
      emptySubEl.innerHTML = "No conversations or messages match \u201c" + escapeHTML(searchInput.value.trim()) + "\u201d.";
      emptyStateEl.hidden = false;
      listEl.innerHTML = "";
      return;
    }
    emptyStateEl.hidden = true;

    listEl.innerHTML = results.map(function (r) {
      var conv = r.conv;
      var displayMsg = r.matchMsg || conv.messages[conv.messages.length - 1];
      var previewRaw = displayMsg ? displayMsg.text : "";
      var preview = filter && r.matchMsg ? highlightMatch(previewRaw, filter) : escapeHTML(previewRaw);
      var time = displayMsg ? formatListTime(displayMsg.timestamp) : "";
      var minus = editMode
        ? '<div class="conv-row-minus" data-delete="' + conv.id + '">&minus;</div>'
        : "";
      var chevron = editMode ? "" : '<div class="conv-row-chevron">&rsaquo;</div>';
      return (
        '<div class="conv-row" data-id="' + conv.id + '">' +
          minus +
          '<div class="avatar"' + avatarStyle(conv) + ">" + avatarInnerHTML(conv) + "</div>" +
          '<div class="conv-row-body">' +
            '<div class="conv-row-top">' +
              '<div class="conv-row-name">' + escapeHTML(conv.name) + "</div>" +
              '<div class="conv-row-time">' + time + "</div>" +
            "</div>" +
            '<div class="conv-row-preview">' + preview + "</div>" +
          "</div>" +
          chevron +
        "</div>"
      );
    }).join("");
  }

  document.getElementById("search-input").addEventListener("input", renderInbox);
  fabComposeBtn.addEventListener("click", function () { composeBtn.click(); });

  listEl.addEventListener("click", function (e) {
    var minus = e.target.closest("[data-delete]");
    if (minus) {
      openDeleteSheet(minus.getAttribute("data-delete"));
      return;
    }
    if (editMode) return;
    var row = e.target.closest(".conv-row");
    if (row) openConversation(row.getAttribute("data-id"));
  });

  var editBtn = document.getElementById("edit-btn");
  editBtn.addEventListener("click", function () {
    editMode = !editMode;
    editBtn.textContent = editMode ? "Done" : "Edit";
    editBtn.style.fontWeight = editMode ? "600" : "normal";
    renderInbox();
  });

  /* ---------------- generic confirm action sheet ---------------- */
  var confirmSheet = document.getElementById("confirm-sheet");
  var confirmSheetTitle = document.getElementById("confirm-sheet-title");
  var confirmSheetConfirmBtn = document.getElementById("confirm-sheet-confirm-btn");
  var confirmSheetAction = null;

  function openConfirmSheet(title, confirmLabel, onConfirm) {
    confirmSheetTitle.textContent = title;
    confirmSheetConfirmBtn.textContent = confirmLabel;
    confirmSheetAction = onConfirm;
    confirmSheet.hidden = false;
  }

  document.getElementById("confirm-sheet-cancel-btn").addEventListener("click", function () {
    confirmSheetAction = null;
    confirmSheet.hidden = true;
  });

  confirmSheetConfirmBtn.addEventListener("click", function () {
    var action = confirmSheetAction;
    confirmSheetAction = null;
    confirmSheet.hidden = true;
    if (action) action();
  });

  function openDeleteSheet(id) {
    var conv = getConversationById(id);
    if (!conv) return;
    openConfirmSheet('Delete conversation with ' + conv.name + "?", "Delete Conversation", function () {
      conversations = conversations.filter(function (c) { return c.id !== id; });
      saveConversations();
      renderInbox();
    });
  }

  /* ---------------- thread rendering (shared by conversation + new-message preview) ---------------- */
  function renderThreadInto(container, messages) {
    var html = "";
    var lastTs = null;
    messages.forEach(function (msg, i) {
      var needsHeader = lastTs === null ||
        (msg.timestamp - lastTs > HEADER_GAP_MS) ||
        !isSameDay(new Date(lastTs), new Date(msg.timestamp));
      if (needsHeader) {
        html += '<div class="thread-header">' + formatThreadHeader(msg.timestamp) + "</div>";
      }
      var groupStart = needsHeader || (msg.timestamp - lastTs > GROUP_GAP_MS);
      var next = messages[i + 1];
      var isLastInGroup = !next || (next.timestamp - msg.timestamp > GROUP_GAP_MS);
      var isLastOverall = i === messages.length - 1;

      html += '<div class="bubble-row' + (groupStart ? " group-start" : "") + '">' +
        '<div class="bubble' + (isLastInGroup ? " tail" : "") + '" data-msg-id="' + msg.id + '">' +
          escapeHTML(msg.text) +
        "</div>" +
      "</div>";

      if (isLastOverall && msg.status) {
        html += '<div class="status-label" data-msg-id="' + msg.id + '">' +
          (msg.status === "read" ? "Read" : "Delivered") + "</div>";
      }
      lastTs = msg.timestamp;
    });
    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  /* ---------------- conversation screen ---------------- */
  var threadBody = document.getElementById("thread-body");
  var convAvatarEl = document.getElementById("convo-avatar");
  var convNameEl = document.getElementById("convo-name");
  var messageInput = document.getElementById("message-input");
  var sendBtn = document.getElementById("send-btn");

  function openConversation(id) {
    var conv = getConversationById(id);
    if (!conv) return;
    currentConversationId = id;
    convAvatarEl.setAttribute("style", conv.avatarImage ? "" : "background:" + (conv.avatarColor || hashColor(conv.name)));
    convAvatarEl.innerHTML = avatarInnerHTML(conv);
    convNameEl.textContent = conv.name;
    renderThreadInto(threadBody, conv.messages);
    messageInput.value = "";
    autoGrow(messageInput);
    updateSendState(messageInput, sendBtn);
    showScreen("conversation-screen");
  }

  document.getElementById("back-btn").addEventListener("click", function () {
    currentConversationId = null;
    showScreen("inbox-screen");
    renderInbox();
  });

  threadBody.addEventListener("click", function (e) {
    var target = e.target.closest("[data-msg-id]");
    if (!target) return;
    var conv = getConversationById(currentConversationId);
    if (!conv) return;
    var msg = conv.messages[conv.messages.length - 1];
    if (!msg || msg.id !== target.getAttribute("data-msg-id")) return; // only the last message toggles
    msg.status = msg.status === "read" ? "delivered" : "read";
    saveConversations();
    renderThreadInto(threadBody, conv.messages);
  });

  function autoGrow(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 110) + "px";
  }

  function updateSendState(inputEl, btnEl) {
    btnEl.disabled = inputEl.value.trim().length === 0;
  }

  messageInput.addEventListener("input", function () {
    autoGrow(messageInput);
    updateSendState(messageInput, sendBtn);
  });

  function sendToCurrentConversation() {
    var text = messageInput.value.trim();
    if (!text) return;
    var conv = getConversationById(currentConversationId);
    if (!conv) return;
    conv.messages.push({ id: uid(), text: text, timestamp: Date.now(), status: "delivered" });
    conv.updatedAt = Date.now();
    saveConversations();
    messageInput.value = "";
    autoGrow(messageInput);
    updateSendState(messageInput, sendBtn);
    renderThreadInto(threadBody, conv.messages);
  }

  sendBtn.addEventListener("click", sendToCurrentConversation);
  messageInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { // cmd/ctrl+Enter also sends, for desktop testing
      e.preventDefault();
      sendToCurrentConversation();
    }
  });

  /* ---------------- contact edit modal ---------------- */
  var contactModal = document.getElementById("contact-modal");
  var modalAvatarPreview = document.getElementById("modal-avatar-preview");
  var modalNameInput = document.getElementById("modal-name-input");
  var photoInput = document.getElementById("photo-input");
  var pendingAvatarImage = null;

  document.getElementById("convo-header").addEventListener("click", function () {
    var conv = getConversationById(currentConversationId);
    if (!conv) return;
    pendingAvatarImage = conv.avatarImage || null;
    modalNameInput.value = conv.name;
    modalAvatarPreview.setAttribute("style", conv.avatarImage ? "" : "background:" + (conv.avatarColor || hashColor(conv.name)));
    modalAvatarPreview.innerHTML = avatarInnerHTML(conv);
    contactModal.hidden = false;
  });

  photoInput.addEventListener("change", function () {
    var file = photoInput.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      pendingAvatarImage = reader.result;
      modalAvatarPreview.setAttribute("style", "");
      modalAvatarPreview.innerHTML = '<img src="' + pendingAvatarImage + '" alt="" />';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById("modal-cancel-btn").addEventListener("click", function () {
    contactModal.hidden = true;
    photoInput.value = "";
  });

  document.getElementById("modal-save-btn").addEventListener("click", function () {
    var conv = getConversationById(currentConversationId);
    if (!conv) return;
    var newName = modalNameInput.value.trim();
    if (newName) conv.name = newName;
    conv.avatarImage = pendingAvatarImage;
    saveConversations();
    convAvatarEl.setAttribute("style", conv.avatarImage ? "" : "background:" + (conv.avatarColor || hashColor(conv.name)));
    convAvatarEl.innerHTML = avatarInnerHTML(conv);
    convNameEl.textContent = conv.name;
    contactModal.hidden = true;
    photoInput.value = "";
  });

  /* ---------------- new message screen ---------------- */
  var composeBtn = document.getElementById("compose-btn");
  var toInput = document.getElementById("to-input");
  var toSuggestions = document.getElementById("to-suggestions");
  var newThreadBody = document.getElementById("new-thread-body");
  var newMessageInput = document.getElementById("new-message-input");
  var newSendBtn = document.getElementById("new-send-btn");

  composeBtn.addEventListener("click", function () {
    toInput.value = "";
    newMessageInput.value = "";
    autoGrow(newMessageInput);
    updateSendState(newMessageInput, newSendBtn);
    newThreadBody.innerHTML = "";
    toSuggestions.hidden = true;
    showScreen("new-message-screen");
    setTimeout(function () { toInput.focus(); }, 50);
  });

  document.getElementById("cancel-new-btn").addEventListener("click", function () {
    showScreen("inbox-screen");
    renderInbox();
  });

  toInput.addEventListener("input", function () {
    var val = toInput.value.trim().toLowerCase();
    if (!val) { toSuggestions.hidden = true; toSuggestions.innerHTML = ""; return; }
    var matches = conversations.filter(function (c) { return c.name.toLowerCase().indexOf(val) !== -1; }).slice(0, 5);
    if (matches.length === 0) { toSuggestions.hidden = true; toSuggestions.innerHTML = ""; return; }
    toSuggestions.innerHTML = matches.map(function (c) {
      return '<div class="to-suggestion" data-id="' + c.id + '">' +
        '<div class="avatar"' + avatarStyle(c) + ">" + avatarInnerHTML(c) + "</div>" +
        '<div class="to-suggestion-name">' + escapeHTML(c.name) + "</div>" +
      "</div>";
    }).join("");
    toSuggestions.hidden = false;
  });

  toSuggestions.addEventListener("click", function (e) {
    var row = e.target.closest("[data-id]");
    if (!row) return;
    showScreen("inbox-screen");
    openConversation(row.getAttribute("data-id"));
  });

  newMessageInput.addEventListener("input", function () {
    autoGrow(newMessageInput);
    updateSendState(newMessageInput, newSendBtn);
  });

  newSendBtn.addEventListener("click", function () {
    var name = toInput.value.trim();
    var text = newMessageInput.value.trim();
    if (!name || !text) return;

    var conv = findConversationByNameCI(name);
    if (!conv) {
      conv = {
        id: uid(),
        name: name,
        avatarImage: null,
        avatarColor: hashColor(name),
        messages: [],
        updatedAt: Date.now()
      };
      conversations.push(conv);
    }
    conv.messages.push({ id: uid(), text: text, timestamp: Date.now(), status: "delivered" });
    conv.updatedAt = Date.now();
    saveConversations();

    openConversation(conv.id);
  });

  /* ---------------- PIN lock ---------------- */
  var PIN_KEY = "imessage_journal_pin_v1";
  var SESSION_UNLOCK_KEY = "mj_unlocked";

  function loadPinSettings() {
    try {
      var raw = localStorage.getItem(PIN_KEY);
      return raw ? JSON.parse(raw) : { enabled: false, hash: null, salt: null };
    } catch (e) {
      return { enabled: false, hash: null, salt: null };
    }
  }
  function savePinSettings() { localStorage.setItem(PIN_KEY, JSON.stringify(pinSettings)); }

  var pinSettings = loadPinSettings();

  function randomSalt() {
    var bytes = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(bytes).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }

  function sha256Hex(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function isUnlockedThisSession() { return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "true"; }
  function setUnlockedThisSession(v) {
    if (v) sessionStorage.setItem(SESSION_UNLOCK_KEY, "true");
    else sessionStorage.removeItem(SESSION_UNLOCK_KEY);
  }

  // Lock again whenever the app is backgrounded — matches "closed and reopened" behavior.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && pinSettings.enabled) {
      setUnlockedThisSession(false);
    }
  });

  /* ---- PIN keypad UI (shared across unlock / create / change / remove / disable flows) ---- */
  var pinScreen = document.getElementById("lock-screen");
  var pinTitleEl = document.getElementById("pin-title");
  var pinErrorEl = document.getElementById("pin-error");
  var pinDotsEl = document.getElementById("pin-dots");
  var pinKeypadEl = document.getElementById("pin-keypad");
  var pinCancelBtn = document.getElementById("pin-cancel-btn");
  var pinForgotBtn = document.getElementById("pin-forgot-btn");

  var pinFlow = { mode: null, buffer: "", firstEntry: null };

  function pinDotsRender() {
    var dots = pinDotsEl.querySelectorAll(".pin-dot");
    dots.forEach(function (dot, i) { dot.classList.toggle("filled", i < pinFlow.buffer.length); });
  }

  function pinShakeAndClear(message) {
    pinErrorEl.textContent = message;
    pinDotsEl.classList.add("shake");
    setTimeout(function () {
      pinDotsEl.classList.remove("shake");
      pinFlow.buffer = "";
      pinDotsRender();
    }, 350);
  }

  function startPinFlow(mode) {
    pinFlow.mode = mode;
    pinFlow.buffer = "";
    pinFlow.firstEntry = null;
    pinErrorEl.textContent = "\u00a0";
    pinCancelBtn.hidden = (mode === "unlock");
    pinForgotBtn.hidden = (mode !== "unlock");
    pinTitleEl.textContent = pinFlowTitle(mode);
    pinDotsRender();
    showScreen("lock-screen");
  }

  function pinFlowTitle(mode) {
    switch (mode) {
      case "unlock": return "Enter Passcode";
      case "create-new": case "change-new": return "Enter New Passcode";
      case "create-confirm": case "change-confirm": return "Confirm Passcode";
      case "verify-before-change": return "Enter Current Passcode";
      case "verify-before-remove": return "Enter Passcode to Remove";
      case "verify-before-disable": return "Enter Passcode to Turn Off";
      default: return "Enter Passcode";
    }
  }

  function pinComplete() {
    var mode = pinFlow.mode;
    var entered = pinFlow.buffer;

    if (mode === "unlock") {
      sha256Hex(entered + pinSettings.salt).then(function (hash) {
        if (hash === pinSettings.hash) {
          setUnlockedThisSession(true);
          showScreen("inbox-screen");
          renderInbox();
        } else {
          pinShakeAndClear("Incorrect Passcode");
        }
      });
      return;
    }

    if (mode === "create-new" || mode === "change-new") {
      pinFlow.firstEntry = entered;
      pinFlow.buffer = "";
      pinFlow.mode = mode === "create-new" ? "create-confirm" : "change-confirm";
      pinTitleEl.textContent = pinFlowTitle(pinFlow.mode);
      pinErrorEl.textContent = "\u00a0";
      pinDotsRender();
      return;
    }

    if (mode === "create-confirm" || mode === "change-confirm") {
      if (entered !== pinFlow.firstEntry) {
        pinErrorEl.textContent = "Passcodes didn't match — try again";
        pinDotsEl.classList.add("shake");
        setTimeout(function () {
          pinDotsEl.classList.remove("shake");
          pinFlow.mode = mode === "create-confirm" ? "create-new" : "change-new";
          pinFlow.buffer = "";
          pinFlow.firstEntry = null;
          pinTitleEl.textContent = pinFlowTitle(pinFlow.mode);
          pinDotsRender();
        }, 350);
        return;
      }
      var salt = randomSalt();
      sha256Hex(entered + salt).then(function (hash) {
        pinSettings = { enabled: true, hash: hash, salt: salt };
        savePinSettings();
        setUnlockedThisSession(true);
        renderSettings();
        showScreen("settings-screen");
      });
      return;
    }

    if (mode === "verify-before-change" || mode === "verify-before-remove" || mode === "verify-before-disable") {
      sha256Hex(entered + pinSettings.salt).then(function (hash) {
        if (hash !== pinSettings.hash) {
          pinShakeAndClear("Incorrect Passcode");
          return;
        }
        if (mode === "verify-before-change") {
          startPinFlow("change-new");
        } else if (mode === "verify-before-remove") {
          pinSettings = { enabled: false, hash: null, salt: null };
          savePinSettings();
          renderSettings();
          showScreen("settings-screen");
        } else if (mode === "verify-before-disable") {
          pinSettings.enabled = false;
          savePinSettings();
          renderSettings();
          showScreen("settings-screen");
        }
      });
      return;
    }
  }

  pinKeypadEl.addEventListener("click", function (e) {
    var key = e.target.closest("[data-digit]");
    if (key && pinFlow.buffer.length < 4) {
      pinFlow.buffer += key.getAttribute("data-digit");
      pinDotsRender();
      if (pinFlow.buffer.length === 4) pinComplete();
    }
  });
  document.getElementById("pin-del-btn").addEventListener("click", function () {
    pinFlow.buffer = pinFlow.buffer.slice(0, -1);
    pinDotsRender();
  });
  pinCancelBtn.addEventListener("click", function () {
    showScreen("settings-screen");
  });
  pinForgotBtn.addEventListener("click", function () {
    openConfirmSheet(
      "Resetting erases your passcode AND all saved conversations on this device. This can't be undone.",
      "Erase Everything",
      function () {
        localStorage.clear();
        sessionStorage.clear();
        location.reload();
      }
    );
  });

  /* ---------------- settings screen ---------------- */
  var pinToggle = document.getElementById("pin-toggle");
  var changePinRow = document.getElementById("change-pin-row");
  var removePinRow = document.getElementById("remove-pin-row");

  function renderSettings() {
    pinToggle.checked = pinSettings.enabled;
    var hasPin = !!pinSettings.hash;
    changePinRow.classList.toggle("disabled", !hasPin);
    removePinRow.classList.toggle("disabled", !hasPin);
  }

  document.getElementById("settings-btn").addEventListener("click", function () {
    renderSettings();
    showScreen("settings-screen");
  });
  document.getElementById("settings-back-btn").addEventListener("click", function () {
    showScreen("inbox-screen");
    renderInbox();
  });

  pinToggle.addEventListener("change", function () {
    if (pinToggle.checked) {
      if (pinSettings.hash) {
        pinSettings.enabled = true;
        savePinSettings();
        renderSettings();
      } else {
        startPinFlow("create-new");
      }
    } else {
      pinToggle.checked = true; // stays visually on until verified
      startPinFlow("verify-before-disable");
    }
  });

  changePinRow.addEventListener("click", function () {
    if (!pinSettings.hash) return;
    startPinFlow("verify-before-change");
  });

  removePinRow.addEventListener("click", function () {
    if (!pinSettings.hash) return;
    startPinFlow("verify-before-remove");
  });

  /* ---------------- export to file ---------------- */
  // A minimal, dependency-free ZIP writer (STORE method, no compression).
  // Keeps the whole export local — no external library, no network call.
  var CRC_TABLE = (function () {
    var table = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function toDosTime(d) { return ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((Math.floor(d.getSeconds() / 2)) & 0x1F); }
  function toDosDate(d) { return (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F); }

  function buildZip(files) {
    var encoder = new TextEncoder();
    var parts = [];
    var centralParts = [];
    var offset = 0;
    var now = new Date();
    var dosTime = toDosTime(now), dosDate = toDosDate(now);

    files.forEach(function (file) {
      var nameBytes = encoder.encode(file.name);
      var dataBytes = encoder.encode(file.content);
      var crc = crc32(dataBytes);
      var size = dataBytes.length;

      var local = new Uint8Array(30 + nameBytes.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      parts.push(local, dataBytes);

      var central = new Uint8Array(46 + nameBytes.length);
      var cdv = new DataView(central.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint16(30, 0, true);
      cdv.setUint16(32, 0, true);
      cdv.setUint16(34, 0, true);
      cdv.setUint16(36, 0, true);
      cdv.setUint32(38, 0, true);
      cdv.setUint32(42, offset, true);
      central.set(nameBytes, 46);

      centralParts.push(central);
      offset += local.length + dataBytes.length;
    });

    var centralSize = centralParts.reduce(function (sum, p) { return sum + p.length; }, 0);
    var centralOffset = offset;

    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(4, 0, true);
    edv.setUint16(6, 0, true);
    edv.setUint16(8, files.length, true);
    edv.setUint16(10, files.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, centralOffset, true);
    edv.setUint16(20, 0, true);

    return new Blob(parts.concat(centralParts, [end]), { type: "application/zip" });
  }

  function sanitizeFilename(name) {
    var cleaned = name.trim().replace(/[^a-zA-Z0-9\-_. ]/g, "").replace(/\s+/g, "_");
    return cleaned || "contact";
  }

  function formatExportTimestamp(ts) {
    return new Date(ts).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function conversationToText(conv) {
    var lines = ["Conversation with " + conv.name, "Exported " + new Date().toLocaleString(), ""];
    conv.messages.forEach(function (m) {
      lines.push("[" + formatExportTimestamp(m.timestamp) + "]");
      lines.push(m.text);
      lines.push("");
    });
    return lines.join("\n");
  }

  document.getElementById("export-data-row").addEventListener("click", function () {
    if (conversations.length === 0) {
      alert("No conversations to export yet.");
      return;
    }
    var used = {};
    var files = conversations.map(function (conv) {
      var base = sanitizeFilename(conv.name);
      var name = base, n = 2;
      while (used[name]) { name = base + "_" + n; n++; }
      used[name] = true;
      return { name: name + ".txt", content: conversationToText(conv) };
    });
    var blob = buildZip(files);
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "messages-export-" + dateStr + ".zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  /* ---------------- dark mode ---------------- */
  var DARK_MODE_KEY = "imessage_journal_dark_mode_v1";
  var darkModeToggle = document.getElementById("dark-mode-toggle");

  function loadDarkModePref() {
    var raw = localStorage.getItem(DARK_MODE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    // No explicit choice yet — default to the system's own appearance setting.
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyDarkMode(on) {
    document.body.classList.toggle("dark", on);
    darkModeToggle.checked = on;
  }

  var darkModeOn = loadDarkModePref();
  applyDarkMode(darkModeOn);

  darkModeToggle.addEventListener("change", function () {
    darkModeOn = darkModeToggle.checked;
    localStorage.setItem(DARK_MODE_KEY, darkModeOn ? "true" : "false");
    applyDarkMode(darkModeOn);
  });

  /* ---------------- init ---------------- */
  if (pinSettings.enabled && pinSettings.hash && !isUnlockedThisSession()) {
    startPinFlow("unlock");
  } else {
    renderInbox();
    showScreen("inbox-screen");
  }
})();
