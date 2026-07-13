var paClient = window.supabase.createClient(
  "https://msgqzgzoslearaprgiqq.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE"
);

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

async function loadPartnerAccounts() {
  var holder = document.getElementById("partnerAccountsList");
  if (!holder) return;
  holder.innerHTML = "<p class='muted'>جار التحميل...</p>";

  var money = new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 });

  // 1. Get existing partner_accounts + orders + profiles in parallel
  var [accRes, ordRes, profRes] = await Promise.all([
    paClient.from("partner_accounts").select("id, user_id, email, full_name, avatar_url, status, total_fees, total_tax, total_amount, created_at").order("created_at", { ascending: false }),
    paClient.from("orders").select("type").limit(5000),
    paClient.from("profiles").select("id, email, full_name, avatar_url")
  ]);

  var accounts = accRes.data || [];
  var orders = ordRes.data || [];
  var profiles = profRes.data || [];

  // 2. Map accounts by email
  var accountsByEmail = {};
  accounts.forEach(function(a) { accountsByEmail[a.email.toLowerCase()] = a; });

  // 3. Extract seller emails from orders
  var profileMap = {};
  profiles.forEach(function(p) { profileMap[p.email.toLowerCase()] = p; });

  var discoveredMap = {}; // email -> { name, ... }
  orders.forEach(function(row) {
    try {
      var td = typeof row.type === "string" ? JSON.parse(row.type) : (row.type || {});
      if (td && td.seller_email) {
        var e = td.seller_email.toLowerCase().trim();
        if (e) discoveredMap[e] = discoveredMap[e] || { name: td.seller_name || "" };
      }
    } catch(ex) {}
  });

  // 4. Merge: existing accounts first, then discovered (not in accounts)
  var allPartners = [];
  accounts.forEach(function(a) { allPartners.push(a); });

  Object.keys(discoveredMap).forEach(function(email) {
    if (accountsByEmail[email]) return;
    var profile = profileMap[email];
    var info = discoveredMap[email];
    allPartners.push({
      id: null,
      user_id: profile ? profile.id : "00000000-0000-0000-0000-000000000000",
      email: email,
      full_name: (profile && profile.full_name) || info.name || email.split("@")[0],
      avatar_url: (profile && profile.avatar_url) || "",
      status: "active",
      total_fees: 0,
      total_tax: 0,
      total_amount: 0
    });
  });

  if (!allPartners.length) {
    holder.innerHTML = "<p class='muted'>لا يوجد شركاء بعد.</p>";
    return;
  }

  holder.innerHTML = '<div class="partner-accounts-grid">' +
    allPartners.map(function(acc) {
      var initial = (acc.full_name || acc.email || "?").charAt(0).toUpperCase();
      var avatarHtml = acc.avatar_url
        ? '<img class="partner-avatar" src="' + escapeHtml(acc.avatar_url) + '" alt="" loading="lazy">'
        : '<span class="partner-avatar-fallback">' + escapeHtml(initial) + '</span>';
      var statusClass = "status-" + (acc.status || "active");
      var statusLabel = acc.status === "suspended" ? "معلق" : acc.status === "flagged" ? "مُبلّغ" : "نشط";
      return '<article class="partner-account-card" onclick="window.location.href=\'admin-partner-detail.html?user_id=' + encodeURIComponent(acc.user_id) + '&email=' + encodeURIComponent(acc.email) + '\'">' +
        avatarHtml +
        '<div class="partner-account-info">' +
          '<strong>' + escapeHtml(acc.full_name || acc.email) + '</strong>' +
          '<small>' + escapeHtml(acc.email) + '</small>' +
          '<div class="partner-account-meta">' +
            '<span><small>الرسوم</small> ' + money.format(acc.total_fees || 0) + '</span>' +
            '<span><small>الضريبة</small> ' + money.format(acc.total_tax || 0) + '</span>' +
            '<span><small>الإجمالي</small> ' + money.format(acc.total_amount || 0) + '</span>' +
          '</div>' +
        '</div>' +
        '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>' +
      '</article>';
    }).join("") + '</div>';
}

document.addEventListener("DOMContentLoaded", loadPartnerAccounts);
