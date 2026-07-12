/**
 * ============================================================
 *  Buda Admin — Support Chat Dashboard Controller
 *  WhatsApp Web / Noon Support inspired professional UI
 * ============================================================
 */
(function () {
  "use strict";

  /* ----------------------------------------------------------
     Supabase Client Setup (same pattern as all other admin pages)
  ---------------------------------------------------------- */
  const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";

  if (!window.supabase) {
    console.error("[Support Admin] Supabase SDK not loaded.");
    return;
  }
  const { createClient } = window.supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  /* ----------------------------------------------------------
     State
  ---------------------------------------------------------- */
  let conversations     = [];        // All fetched conversations
  let activeConv        = null;      // Currently open conversation
  let messages          = [];        // Messages in active conv
  let onlineUsers       = new Set(); // user_ids currently online
  let typingTimers      = {};        // conversationId -> clearTimeout handle
  let typingConvIds     = new Set(); // conversations where user is typing

  let isSending         = false;
  let loadingMsgs       = false;
  let hasMoreMsgs       = true;
  let msgsPage          = 0;
  const PAGE_SIZE       = 30;

  let subMessages       = null;
  let subConversations  = null;
  let presenceCh        = null;
  let typingCh          = null;

  let activeFilter      = "all";
  let searchQuery       = "";

  /* ----------------------------------------------------------
     DOM References
  ---------------------------------------------------------- */
  const $ = id => document.getElementById(id);

  const offlineBanner      = $("offline-banner");
  const searchInput        = $("chat-search");
  const convList           = $("conversations-list");
  const chatContainer      = $("chat-container");
  const chatPlaceholder    = $("chat-placeholder");
  const activeChatContent  = $("active-chat-content");
  const messagesArea       = $("chat-messages-area");
  const chatBackBtn        = $("chat-back");

  // Header
  const hdrAvatar          = $("active-user-avatar");
  const hdrName            = $("active-user-name");
  const hdrStatus          = $("active-user-status");
  const hdrMsgCount        = $("active-ticket-msg-count");
  const hdrAvgResp         = $("active-avg-response");
  const hdrTicketId        = $("active-ticket-id");
  // Input
  const emojiBtn           = $("emoji-trigger-btn");
  const emojiPanel         = $("emoji-picker");
  const attachBtn          = $("attachment-btn");
  const fileInput          = $("chat-file-input");
  const textInput          = $("chat-text-input");
  const sendBtn            = $("chat-send-btn");

  // Lightbox
  const lightbox           = $("image-lightbox");
  const lightboxImg        = $("lightbox-img");
  const lightboxClose      = $("lightbox-close");

  /* ----------------------------------------------------------
     Utility Helpers
  ---------------------------------------------------------- */
  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function avatarLetters(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  function fmtConvTime(ts) {
    if (!ts) return "";
    try {
      const d   = new Date(ts);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
      }
      const diff = Math.floor((now - d) / 86400000);
      if (diff === 1) return "الأمس";
      if (diff < 7)   return d.toLocaleDateString("ar-EG", { weekday: "long" });
      return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
    } catch (_) { return ""; }
  }

  function fmtMsgTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
    } catch (_) { return ""; }
  }

  function friendlyDay(d) {
    const now = new Date();
    const yes = new Date(); yes.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "اليوم";
    if (d.toDateString() === yes.toDateString()) return "الأمس";
    return d.toLocaleDateString("ar-EG", { weekday: "long", month: "long", day: "numeric" });
  }

  function msgPreview(msg, type) {
    if (type === "image") return "🖼 صورة";
    if (type === "pdf")   return "📄 ملف PDF";
    if (type === "word")  return "📄 ملف Word";
    return msg || "";
  }

  /* ----------------------------------------------------------
     Audio Notification (Web Audio API synthesised beep)
  ---------------------------------------------------------- */
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [[0, 580, 0.12], [0.11, 720, 0.18]].forEach(([delay, freq, dur]) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        gain.gain.setValueAtTime(0.07, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + dur);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + dur);
      });
    } catch (_) {}
  }

  /* ----------------------------------------------------------
     Toast Notification
  ---------------------------------------------------------- */
  function showToast(userName, preview) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    const toast = document.createElement("div");
    toast.className = "toast-item toast-info";
    toast.innerHTML = `
      <div style="font-weight:700;margin-bottom:3px;display:flex;align-items:center;gap:6px;">
        <i class="fa-solid fa-bell" style="color:#ffc107;"></i>
        رسالة جديدة من ${escHtml(userName || "عميل")}
      </div>
      <div style="font-size:0.78rem;opacity:.9;">${escHtml(preview)}</div>
    `;
    wrap.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-6px)";
      setTimeout(() => toast.remove(), 220);
    }, 3500);
  }

  /* ----------------------------------------------------------
     Connection Status Banner
  ---------------------------------------------------------- */
  function updateBanner() {
    offlineBanner.classList.toggle("visible", !navigator.onLine);
  }
  window.addEventListener("online",  updateBanner);
  window.addEventListener("offline", updateBanner);
  updateBanner();

  /* ----------------------------------------------------------
     Init
  ---------------------------------------------------------- */
  function init() {
    renderSkeleton();
    loadConversations();
    setupRealtime();
    bindEvents();
  }

  /* ----------------------------------------------------------
     Conversations — Load & Render
  ---------------------------------------------------------- */
  async function loadConversations() {
    try {
      const { data, error } = await client
        .from("support_conversations")
        .select("*")
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      conversations = data || [];
      renderConversations();
    } catch (err) {
      console.error("[Support Admin] loadConversations:", err);
    }
  }

  function renderSkeleton() {
    convList.innerHTML = Array.from({ length: 4 }, () => `
      <div class="skeleton-card">
        <div class="skeleton-avatar skeleton-anim"></div>
        <div class="skeleton-details">
          <div class="skeleton-title skeleton-anim"></div>
          <div class="skeleton-text skeleton-anim"></div>
        </div>
      </div>
    `).join("");
  }

  function renderConversations() {
    // Apply filter + search
    const filtered = conversations.filter(conv => {
      if (activeFilter === "open"    && conv.status !== "open")    return false;
      if (activeFilter === "pending" && conv.status !== "pending") return false;
      if (activeFilter === "closed"  && conv.status !== "closed")  return false;
      if (activeFilter === "unread"  && !(conv.unread_admin_count > 0)) return false;
      if (searchQuery) {
        const hay = `${conv.user_name || ""} ${conv.user_email || ""} ${conv.id || ""}`.toLowerCase();
        if (!hay.includes(searchQuery)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      convList.innerHTML = `
        <div class="conv-empty-state">
          <i class="fa-solid fa-comments"></i>
          <h4 class="conv-empty-title">لا توجد محادثات</h4>
          <p style="font-size:.78rem;margin-top:4px;">جرّب تعديل الفلاتر أو مربع البحث</p>
        </div>`;
      return;
    }

    convList.innerHTML = "";
    filtered.forEach(conv => {
      const isOnline  = onlineUsers.has(String(conv.user_id));
      const unread    = conv.unread_admin_count || 0;
      const isActive  = activeConv && activeConv.id === conv.id;
      const isTyping  = typingConvIds.has(conv.id);

      const card = document.createElement("div");
      card.className = `conv-card${isActive ? " active" : ""}${unread > 0 ? " unread" : ""}`;
      card.dataset.id = conv.id;
      card.innerHTML = `
        <div class="conv-avatar-wrap">
          <div class="conv-avatar">${escHtml(avatarLetters(conv.user_name))}</div>
          ${isOnline ? '<div class="online-dot" title="متصل الآن"></div>' : ""}
        </div>
        <div class="conv-details">
          <div class="conv-meta-row">
            <span class="conv-name">${escHtml(conv.user_name || "عميل")}</span>
            <span class="conv-time">${fmtConvTime(conv.last_message_at)}</span>
          </div>
          <div class="conv-msg-preview-row">
            <span class="conv-msg-preview">
              ${isTyping
                ? '<strong style="color:#22c55e;">يكتب الآن...</strong>'
                : escHtml(msgPreview(conv.last_message, conv.last_message_type))}
            </span>
            <span class="conv-status-badge status-${conv.status}">
              ${conv.status === "open" ? "مفتوحة" : conv.status === "pending" ? "مراجعة" : "مغلقة"}
            </span>
            ${unread > 0 ? `<span class="conv-unread-badge">${unread > 99 ? "99+" : unread}</span>` : ""}
          </div>
        </div>`;
      card.addEventListener("click", () => openConversation(conv));
      convList.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     Open / Active Conversation
  ---------------------------------------------------------- */
  async function openConversation(conv) {
    activeConv = conv;

    // Mobile slide-in
    chatContainer.classList.add("chat-view-active");

    // Show chat UI
    chatPlaceholder.style.display  = "none";
    activeChatContent.style.display = "flex";

    // Populate header
    hdrAvatar.textContent   = avatarLetters(conv.user_name);
    hdrName.textContent     = conv.user_name || "عميل";
    hdrTicketId.textContent = `تذكرة: ${conv.id.substring(0, 8).toUpperCase()}`;
    updateHeaderStatus(conv);

    // Reset message state
    messages  = [];
    msgsPage  = 0;
    hasMoreMsgs = true;

    // Show skeleton while loading
    messagesArea.innerHTML = `
      <div class="skeleton-msg-box skeleton-msg-left">
        <div class="skeleton-msg-bubble skeleton-anim" style="height:42px;border-radius:12px;width:180px;"></div>
      </div>
      <div class="skeleton-msg-box skeleton-msg-right" style="align-self:flex-end">
        <div class="skeleton-msg-bubble skeleton-anim" style="height:42px;border-radius:12px;width:220px;"></div>
      </div>
      <div class="skeleton-msg-box skeleton-msg-left">
        <div class="skeleton-msg-bubble skeleton-anim" style="height:56px;border-radius:12px;width:260px;"></div>
      </div>`;

    await markAsRead(conv.id);
    await fetchMessages();
    renderConversations(); // Refresh unread badges
    calcAvgResponseTime();
  }

  function updateHeaderStatus(conv) {
    const isOnline = onlineUsers.has(String(conv.user_id));
    const indicator = document.getElementById("active-online-indicator");
    if (indicator) indicator.style.display = isOnline ? "inline-block" : "none";

    if (isOnline) {
      hdrStatus.textContent  = "متصل الآن";
      hdrStatus.style.color  = "#22c55e";
    } else {
      hdrStatus.style.color  = "#64748b";
      hdrStatus.textContent  = conv.last_message_at
        ? `آخر ظهور ${fmtConvTime(conv.last_message_at)}`
        : "غير متصل";
    }
  }

  async function markAsRead(convId) {
    try {
      // Update local array
      const idx = conversations.findIndex(c => c.id === convId);
      if (idx !== -1) conversations[idx].unread_admin_count = 0;

      await client
        .from("support_conversations")
        .update({ unread_admin_count: 0 })
        .eq("id", convId);

      await client
        .from("support_messages")
        .update({ is_read: true })
        .eq("conversation_id", convId)
        .eq("sender_type", "user")
        .eq("is_read", false);
    } catch (err) {
      console.error("[Support Admin] markAsRead:", err);
    }
  }

  /* ----------------------------------------------------------
     Messages — Fetch (paginated) & Render
  ---------------------------------------------------------- */
  async function fetchMessages() {
    if (loadingMsgs || !activeConv) return;
    loadingMsgs = true;

    try {
      const start = msgsPage * PAGE_SIZE;
      const end   = start + PAGE_SIZE - 1;

      const { data, error } = await client
        .from("support_messages")
        .select("*")
        .eq("conversation_id", activeConv.id)
        .order("created_at", { ascending: false })
        .range(start, end);

      if (error) throw error;

      if (!data || data.length < PAGE_SIZE) hasMoreMsgs = false;

      // data is newest-first; reverse for display
      const older = (data || []).reverse();
      const scrollH = messagesArea.scrollHeight;
      const scrollT = messagesArea.scrollTop;

      messages = [...older, ...messages];
      msgsPage++;

      renderMessages();

      // Maintain scroll anchor when paginating
      if (msgsPage > 1) {
        messagesArea.scrollTop = messagesArea.scrollHeight - scrollH + scrollT;
      } else {
        messagesArea.scrollTop = messagesArea.scrollHeight;
      }
    } catch (err) {
      console.error("[Support Admin] fetchMessages:", err);
    } finally {
      loadingMsgs = false;
    }
  }

  function renderMessages() {
    messagesArea.innerHTML = "";

    // Update header count
    hdrMsgCount.textContent = `${messages.length} رسالة`;

    // Scroll-up pagination loader
    if (hasMoreMsgs) {
      const loader = document.createElement("div");
      loader.className = "chat-pagination-loader";
      loader.innerHTML = '<div class="spinner-support"></div><span>تحميل رسائل سابقة...</span>';
      messagesArea.appendChild(loader);
    }

    let lastDate = "";
    messages.forEach(msg => {
      const d       = new Date(msg.created_at);
      const dateKey = d.toDateString();

      // Date separator
      if (dateKey !== lastDate) {
        const sep = document.createElement("div");
        sep.className = "chat-date-separator";
        sep.textContent = friendlyDay(d);
        messagesArea.appendChild(sep);
        lastDate = dateKey;
      }

      const isAdmin = msg.sender_type === "admin";
      const row = document.createElement("div");
      row.className = `chat-msg-row ${isAdmin ? "admin" : "client"}`;
      row.dataset.id = msg.id;

      // Message body
      let body = "";
      if (msg.message_type === "image") {
        body = `
          <div class="chat-msg-image-wrap" onclick="adminSupportOpenLightbox('${escHtml(msg.message)}')">
            <img class="chat-msg-image" src="${escHtml(msg.message)}" alt="مرفق" loading="lazy"/>
          </div>`;
      } else if (msg.message_type === "pdf") {
        body = `
          <a class="chat-msg-file-btn" href="${escHtml(msg.message)}" target="_blank" rel="noopener">
            <i class="fa-solid fa-file-pdf chat-msg-file-icon" style="color:#ef4444;"></i>
            <span>ملف PDF</span>
            <i class="fa-solid fa-download" style="font-size:.8rem;margin-right:auto;"></i>
          </a>`;
      } else if (msg.message_type === "word") {
        body = `
          <a class="chat-msg-file-btn" href="${escHtml(msg.message)}" target="_blank" rel="noopener">
            <i class="fa-solid fa-file-word chat-msg-file-icon" style="color:#3b82f6;"></i>
            <span>ملف Word</span>
            <i class="fa-solid fa-download" style="font-size:.8rem;margin-right:auto;"></i>
          </a>`;
      } else {
        body = `<div>${escHtml(msg.message)}</div>`;
      }

      // Double-tick read receipt (only for admin messages)
      const ticks = isAdmin
        ? `<span class="chat-read-ticks ${msg.is_read ? "read" : ""}" title="${msg.is_read ? "تم القراءة" : "تم الإرسال"}">✓✓</span>`
        : "";

      row.innerHTML = `
        <div class="chat-msg-bubble">
          ${body}
          <div class="chat-msg-footer">
            <span>${fmtMsgTime(msg.created_at)}</span>
            ${ticks}
          </div>
        </div>`;

      messagesArea.appendChild(row);
    });
  }

  function calcAvgResponseTime() {
    let total = 0, count = 0;
    for (let i = 1; i < messages.length; i++) {
      const p = messages[i - 1], c = messages[i];
      if (p.sender_type === "user" && c.sender_type === "admin") {
        const diff = new Date(c.created_at) - new Date(p.created_at);
        if (diff > 0 && diff < 30 * 60 * 1000) { total += diff; count++; }
      }
    }
    if (count > 0) {
      const avg = Math.max(1, Math.round(total / count / 60000));
      hdrAvgResp.textContent = `متوسط الرد: ${avg} دقيقة`;
      hdrAvgResp.style.display = "inline-block";
    } else {
      hdrAvgResp.style.display = "none";
    }
  }

  /* ----------------------------------------------------------
     Send Message (text or attachment URL)
  ---------------------------------------------------------- */
  async function sendMessage(content, type) {
    // When called from send button / Enter key, read from the textarea
    if (content === undefined || content === null) {
      type    = "text";
      content = textInput.value.trim();
    }

    // Guard: nothing to send, no active conversation, or already sending
    if (!content || !activeConv || isSending) return;
    isSending = true;

    // Clear text input for text messages
    if (type === "text") {
      textInput.value = "";
      textInput.style.height = "auto";
    }


    // Optimistic render
    const tempId = "opt-" + Date.now();
    const optMsg = {
      id: tempId, conversation_id: activeConv.id,
      sender_type: "admin", message: content,
      message_type: type, is_read: false,
      created_at: new Date().toISOString()
    };
    messages.push(optMsg);
    renderMessages();
    messagesArea.scrollTop = messagesArea.scrollHeight;

    try {
      const { data: inserted, error: msgErr } = await client
        .from("support_messages")
        .insert([{ conversation_id: activeConv.id, sender_type: "admin", message: content, message_type: type, is_read: false }])
        .select().single();
      if (msgErr) throw msgErr;

      // Replace optimistic
      const idx = messages.findIndex(m => m.id === tempId);
      if (idx !== -1) messages[idx] = inserted;
      renderMessages();

      // Update conversation summary
      const convUpdate = {
        last_message:      content,
        last_message_type: type,
        last_message_at:   new Date().toISOString(),
        updated_at:        new Date().toISOString(),
        unread_user_count: (activeConv.unread_user_count || 0) + 1
      };
      const { error: convErr } = await client
        .from("support_conversations").update(convUpdate).eq("id", activeConv.id);
      if (convErr) throw convErr;

      // Bubble conversation to top locally
      const ci = conversations.findIndex(c => c.id === activeConv.id);
      if (ci !== -1) {
        const [target] = conversations.splice(ci, 1);
        Object.assign(target, convUpdate);
        conversations.unshift(target);
        Object.assign(activeConv, convUpdate);
      }
      renderConversations();
      calcAvgResponseTime();

    } catch (err) {
      console.error("[Support Admin] sendMessage:", err);
      messages = messages.filter(m => m.id !== tempId);
      renderMessages();
    } finally {
      isSending = false;
    }
  }

  /* ----------------------------------------------------------
     File Upload
  ---------------------------------------------------------- */
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    fileInput.value = "";
    if (!file || !activeConv) return;

    const ext = file.name.split(".").pop().toLowerCase();
    let msgType;
    if (["jpg","jpeg","png","webp","gif"].includes(ext)) msgType = "image";
    else if (ext === "pdf")                              msgType = "pdf";
    else if (["doc","docx"].includes(ext))              msgType = "word";
    else { alert("نوع الملف غير مدعوم. يدعم الصور، PDF، وWord فقط."); return; }

    // Placeholder bubble while uploading
    const tempId  = "upload-" + Date.now();
    const tempMsg = { id: tempId, conversation_id: activeConv.id, sender_type: "admin", message: "⏳ جاري رفع الملف...", message_type: "text", is_read: false, created_at: new Date().toISOString() };
    messages.push(tempMsg);
    renderMessages();
    messagesArea.scrollTop = messagesArea.scrollHeight;

    try {
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await client.storage
        .from("support_files")
        .upload(`attachments/${fileName}`, file);
      if (uploadErr) throw uploadErr;

      const { data: { publicUrl } } = client.storage.from("support_files").getPublicUrl(`attachments/${fileName}`);
      messages = messages.filter(m => m.id !== tempId);
      await sendMessage(publicUrl, msgType);

    } catch (err) {
      console.error("[Support Admin] upload:", err);
      messages = messages.filter(m => m.id !== tempId);
      renderMessages();
      alert("فشل رفع الملف. تحقق من الاتصال ثم حاول مجدداً.");
    }
  }

  /* ----------------------------------------------------------
     Realtime Subscriptions
  ---------------------------------------------------------- */
  function setupRealtime() {
    // ── New / updated messages
    subMessages = client.channel("admin-msgs-ch")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, onNewMessage)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages" }, onUpdateMessage)
      .subscribe();

    // ── Conversation changes
    subConversations = client.channel("admin-convs-ch")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_conversations" }, onConvChange)
      .subscribe();

    // ── Presence (online indicators)
    presenceCh = client.channel("support-presence");
    presenceCh
      .on("presence", { event: "sync" }, () => {
        const state = presenceCh.presenceState();
        onlineUsers.clear();
        Object.values(state).forEach(list => {
          if (list[0]?.user_id) onlineUsers.add(String(list[0].user_id));
        });
        renderConversations();
        if (activeConv) updateHeaderStatus(activeConv);
      })
      .subscribe();

    // ── Typing broadcast
    typingCh = client.channel("support-typing-ch");
    typingCh
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { conversation_id, typing } = payload || {};
        if (!conversation_id) return;

        if (typing) {
          clearTimeout(typingTimers[conversation_id]);
          typingConvIds.add(conversation_id);
          typingTimers[conversation_id] = setTimeout(() => {
            typingConvIds.delete(conversation_id);
            renderConversations();
            setHeaderTyping(conversation_id, false);
          }, 3000);
          renderConversations();
          setHeaderTyping(conversation_id, true);
        } else {
          clearTimeout(typingTimers[conversation_id]);
          typingConvIds.delete(conversation_id);
          renderConversations();
          setHeaderTyping(conversation_id, false);
        }
      })
      .subscribe();
  }

  function setHeaderTyping(convId, isTyping) {
    if (!activeConv || activeConv.id !== convId) return;
    if (isTyping) {
      hdrStatus.textContent = "يكتب الآن...";
      hdrStatus.style.color = "#22c55e";
    } else {
      updateHeaderStatus(activeConv);
    }
  }

  function onNewMessage(payload) {
    const msg = payload.new;
    if (msg.sender_type === "admin") return; // Already handled optimistically

    if (activeConv && msg.conversation_id === activeConv.id) {
      if (!messages.some(m => m.id === msg.id)) {
        messages.push(msg);
        renderMessages();
        messagesArea.scrollTop = messagesArea.scrollHeight;
        // Mark as read immediately
        client.from("support_messages").update({ is_read: true }).eq("id", msg.id).then(() => {});
        client.from("support_conversations").update({ unread_admin_count: 0 }).eq("id", activeConv.id).then(() => {});
      }
    } else {
      // Not in active chat — notify
      playBeep();
      const conv = conversations.find(c => c.id === msg.conversation_id);
      showToast(conv ? conv.user_name : "عميل", msgPreview(msg.message, msg.message_type));
    }
  }

  function onUpdateMessage(payload) {
    const updated = payload.new;
    if (!activeConv || updated.conversation_id !== activeConv.id) return;
    const idx = messages.findIndex(m => m.id === updated.id);
    if (idx !== -1) { messages[idx] = updated; renderMessages(); }
  }

  function onConvChange(payload) {
    const changed = payload.new || {};
    const ci = conversations.findIndex(c => c.id === changed.id);

    if (ci !== -1) {
      const [target] = conversations.splice(ci, 1);
      Object.assign(target, changed);
      const newMsg = new Date(changed.last_message_at || 0);
      const oldMsg = new Date(conversations[0]?.last_message_at || 0);
      // Float to top when newer message arrived
      if (newMsg >= oldMsg) conversations.unshift(target);
      else conversations.splice(ci, 0, target);
    } else {
      conversations.unshift(changed);
    }

    renderConversations();
    if (activeConv && activeConv.id === changed.id) {
      Object.assign(activeConv, changed);
    }
  }

  /* ----------------------------------------------------------
     Event Binding
  ---------------------------------------------------------- */
  function bindEvents() {
    // Search
    searchInput.addEventListener("input", function () {
      searchQuery = this.value.trim().toLowerCase();
      renderConversations();
    });

    // Filter tabs
    document.querySelectorAll(".chat-tab").forEach(tab => {
      tab.addEventListener("click", function () {
        document.querySelectorAll(".chat-tab").forEach(t => t.classList.remove("active"));
        this.classList.add("active");
        activeFilter = this.dataset.filter;
        renderConversations();
      });
    });

    // Back (mobile)
    chatBackBtn.addEventListener("click", () => {
      chatContainer.classList.remove("chat-view-active");
      activeConv = null;
    });

    // Emoji toggle
    emojiBtn.addEventListener("click", e => { e.stopPropagation(); emojiPanel.classList.toggle("visible"); });
    document.addEventListener("click", () => emojiPanel.classList.remove("visible"));
    document.querySelectorAll(".emoji-item").forEach(item => {
      item.addEventListener("click", e => {
        e.stopPropagation();
        textInput.value += item.textContent;
        emojiPanel.classList.remove("visible");
        textInput.focus();
      });
    });

    // Attachment
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", handleFileUpload);

    // Auto-grow textarea
    textInput.addEventListener("input", function () {
      this.style.height = "auto";
      this.style.height = Math.min(this.scrollHeight, 120) + "px";
    });

    // Keyboard shortcuts
    textInput.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    sendBtn.addEventListener("click", () => sendMessage());

    // Scroll-up for older messages
    messagesArea.addEventListener("scroll", function () {
      if (this.scrollTop === 0 && hasMoreMsgs && !loadingMsgs) fetchMessages();
    });

    // Lightbox
    window.adminSupportOpenLightbox = function (src) {
      lightboxImg.src = src;
      lightbox.classList.add("open");
    };
    const closeLB = () => { lightbox.classList.remove("open"); setTimeout(() => { lightboxImg.src = ""; }, 260); };
    lightboxClose.addEventListener("click", closeLB);
    lightbox.addEventListener("click", closeLB);
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeLB(); });
  }

  /* ----------------------------------------------------------
     Cleanup
  ---------------------------------------------------------- */
  window.addEventListener("beforeunload", () => {
    [subMessages, subConversations, presenceCh, typingCh].forEach(ch => ch && ch.unsubscribe());
  });

  /* ----------------------------------------------------------
     Boot
  ---------------------------------------------------------- */
  init();

})();
