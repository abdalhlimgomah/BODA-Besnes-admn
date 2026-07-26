/* ===== Admin Buda Rewards Page ===== */
const SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
const budaSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var campaign = null;
var participants = [];
var referrals = [];
var rewards = [];
var assignments = [];
var messages = [];
var editingRewardId = null;
var editingParticipantId = null;
var searchTimeout = null;

/* ===== Toast ===== */
function showToast(msg, type) {
  type = type || 'info';
  var wrap = document.getElementById('contestToastWrap');
  if (!wrap) return;
  var t = document.createElement('div');
  t.className = 'contest-toast-item toast-' + type;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(function() { t.remove(); }, 3000);
}

/* ===== Tab System ===== */
function switchTab(tabId) {
  document.querySelectorAll('.admin-tab').forEach(function(t) {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-panel').forEach(function(p) {
    p.classList.toggle('active', p.id === 'tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1));
  });
}

document.querySelectorAll('.admin-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    switchTab(this.dataset.tab);
  });
});

/* ===== Data Loading ===== */
function loadCampaign() {
  return budaSupabase.from('contest_campaigns').select('*').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
}

function loadParticipants(campaignId) {
  return budaSupabase.from('contest_participants').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false });
}

function loadReferrals(campaignId) {
  return budaSupabase.from('referrals').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false });
}

function loadRewards(campaignId) {
  return budaSupabase.from('contest_rewards').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true });
}

function loadAssignments(campaignId) {
  return budaSupabase.from('reward_assignments').select('*, contest_rewards(*), contest_participants(*)').eq('campaign_id', campaignId).order('created_at', { ascending: false });
}

function loadMessages(campaignId) {
  return budaSupabase.from('contest_messages').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: false });
}

/* ===== Init ===== */
document.addEventListener('DOMContentLoaded', function() {
  loadCampaign().then(function(res) {
    if (res.error || !res.data) {
      showToast('لا توجد مسابقة نشطة حالياً', 'error');
      return;
    }
    campaign = res.data;
    loadAll(campaign.id);
  }).catch(function(err) {
    showToast('خطأ في تحميل بيانات المسابقة', 'error');
    console.error(err);
  });

  /* Reward modal */
  document.getElementById('addRewardBtn').addEventListener('click', function() { openRewardModal(null); });
  document.getElementById('saveRewardBtn').addEventListener('click', saveReward);

  /* Send message */
  document.getElementById('sendMessageBtn').addEventListener('click', openMessageModal);
  document.getElementById('sendMsgBtn').addEventListener('click', sendMessage);
});

function loadAll(campaignId) {
  Promise.all([
    loadParticipants(campaignId),
    loadReferrals(campaignId),
    loadRewards(campaignId),
    loadAssignments(campaignId),
    loadMessages(campaignId)
  ]).then(function(results) {
    var pRes = results[0], rRes = results[1], rwRes = results[2], aRes = results[3], mRes = results[4];

    if (!pRes.error) participants = pRes.data || [];
    if (!rRes.error) referrals = rRes.data || [];
    if (!rwRes.error) rewards = rwRes.data || [];
    if (!aRes.error) assignments = aRes.data || [];
    if (!mRes.error) messages = mRes.data || [];

    renderParticipants();
    renderReferrals();
    renderStats();
    renderRewards();
    renderWinners();
    renderMessages();
    renderSettings();
  }).catch(function(err) {
    console.error('Error loading data:', err);
    showToast('خطأ في تحميل البيانات', 'error');
  });
}

/* ===== Participants Tab ===== */
function renderParticipants() {
  var skeleton = document.getElementById('participantSkeleton');
  var tbody = document.getElementById('participantsTableBody');
  var mobile = document.getElementById('participantsMobileCards');
  var empty = document.getElementById('participantsEmpty');
  var query = (document.getElementById('participantSearch').value || '').trim().toLowerCase();
  var filter = document.getElementById('participantFilter').value;

  if (skeleton) skeleton.style.display = 'none';

  var filtered = participants.filter(function(p) {
    if (query && p.full_name.toLowerCase().indexOf(query) === -1 &&
        p.email.toLowerCase().indexOf(query) === -1 &&
        p.phone.indexOf(query) === -1 &&
        p.referral_code.toLowerCase().indexOf(query) === -1 &&
        (p.city || '').toLowerCase().indexOf(query) === -1) return false;

    if (filter === 'has_referrals') {
      var count = referrals.filter(function(r) { return r.referrer_user_id === p.user_id; }).length;
      if (count === 0) return false;
    }
    if (filter === 'winner') {
      var won = assignments.filter(function(a) { return a.participant_id === p.id && a.status === 'won'; });
      if (won.length === 0) return false;
    }
    if (filter === 'contacted') {
      var c = assignments.filter(function(a) { return a.participant_id === p.id && a.status === 'contacted'; });
      if (c.length === 0) return false;
    }
    if (filter === 'not_contacted') {
      var c = assignments.filter(function(a) { return a.participant_id === p.id && (a.status === 'contacted' || a.status === 'fulfilled'); });
      if (c.length > 0) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    mobile.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  /* Desktop table */
  tbody.innerHTML = filtered.map(function(p) {
    var refCount = referrals.filter(function(r) { return r.referrer_user_id === p.user_id; }).length;
    var assignment = assignments.filter(function(a) { return a.participant_id === p.id; });
    var prizeLabel = assignment.length > 0 ? (assignment[0].contest_rewards ? assignment[0].contest_rewards.title : 'جائزة') : '—';
    var statusBadge = '';
    if (assignment.length > 0) {
      var s = assignment[0].status;
      statusBadge = '<span class="status-badge status-' + s + '">' + statusLabel(s) + '</span>';
    }
    return '<tr>' +
      '<td><a href="#" onclick="openDrawer(\'' + p.id + '\');return false;" style="color:#6D28D9;text-decoration:none;font-weight:700;">' + escapeHtml(p.full_name + ' ' + p.family_name) + '</a></td>' +
      '<td>' + escapeHtml(p.email) + '</td>' +
      '<td dir="ltr">' + escapeHtml(p.phone) + '</td>' +
      '<td>' + escapeHtml(p.city) + '</td>' +
      '<td style="direction:ltr;font-family:monospace;font-weight:700;color:#6D28D9;">' + escapeHtml(p.referral_code) + '</td>' +
      '<td style="text-align:center;font-weight:700;">' + refCount + '</td>' +
      '<td style="font-size:0.75rem;">' + formatDate(p.created_at) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td class="actions-cell">' +
      '<button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openDrawer(\'' + p.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
      '<button class="admin-btn admin-btn-primary admin-btn-sm" onclick="openWinnerModal(\'' + p.id + '\')"><i class="fa-solid fa-crown"></i></button>' +
      '</td></tr>';
  }).join('');

  /* Mobile cards */
  mobile.innerHTML = filtered.map(function(p) {
    var refCount = referrals.filter(function(r) { return r.referrer_user_id === p.user_id; }).length;
    return '<div class="mobile-card" onclick="openDrawer(\'' + p.id + '\')" style="cursor:pointer">' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الاسم</span><span class="mobile-card-value">' + escapeHtml(p.full_name + ' ' + p.family_name) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">البريد</span><span class="mobile-card-value">' + escapeHtml(p.email) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الهاتف</span><span class="mobile-card-value">' + escapeHtml(p.phone) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">كود الدعوة</span><span class="mobile-card-value" style="color:#6D28D9;font-family:monospace;">' + escapeHtml(p.referral_code) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الإحالات</span><span class="mobile-card-value">' + refCount + '</span></div>' +
      '</div>';
  }).join('');
}

/* Search with debounce */
document.getElementById('participantSearch').addEventListener('input', function() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(renderParticipants, 300);
});
document.getElementById('participantFilter').addEventListener('change', renderParticipants);

/* ===== Referrals Tab ===== */
function renderReferrals() {
  var tbody = document.getElementById('referralsTableBody');
  var mobile = document.getElementById('referralsMobileCards');
  var empty = document.getElementById('referralsEmpty');

  if (referrals.length === 0) {
    tbody.innerHTML = '';
    mobile.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  function getReferrerName(referrerUserId) {
    if (!referrerUserId) return '—';
    var p = participants.find(function(pp) { return pp.user_id === referrerUserId; });
    return p ? escapeHtml(p.full_name + ' ' + p.family_name) : String(referrerUserId);
  }

  tbody.innerHTML = referrals.map(function(r) {
    return '<tr>' +
      '<td>' + getReferrerName(r.referrer_user_id) + '</td>' +
      '<td style="direction:ltr;font-family:monospace;font-weight:700;color:#6D28D9;">' + escapeHtml(r.referral_code) + '</td>' +
      '<td>' + getReferredName(r.referred_user_id) + '</td>' +
      '<td><span class="status-badge status-' + r.status + '">' + statusLabel(r.status) + '</span></td>' +
      '<td style="font-size:0.75rem;">' + formatDate(r.created_at) + '</td></tr>';
  }).join('');

  mobile.innerHTML = referrals.map(function(r) {
    return '<div class="mobile-card">' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الداعي</span><span class="mobile-card-value">' + getReferrerName(r.referrer_user_id) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الكود</span><span class="mobile-card-value" style="color:#6D28D9;font-family:monospace;">' + escapeHtml(r.referral_code) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الحالة</span><span class="mobile-card-value"><span class="status-badge status-' + r.status + '">' + statusLabel(r.status) + '</span></span></div>' +
      '</div>';
  }).join('');
}

/* ===== Stats Tab ===== */
function renderStats() {
  var container = document.getElementById('statsMetrics');
  var skeleton = document.getElementById('statsSkeleton');
  if (skeleton) skeleton.style.display = 'none';

  var totalParticipants = participants.length;
  var totalReferrals = referrals.length;
  var qualifiedReferrals = referrals.filter(function(r) { return r.status === 'qualified'; }).length;
  var totalWon = assignments.filter(function(a) { return a.status === 'won' || a.status === 'contacted' || a.status === 'fulfilled'; }).length;
  var totalMessages = messages.length;
  var totalRewardsDistributed = assignments.filter(function(a) { return a.status !== 'pending' && a.status !== 'not_won'; }).length;
  var winnersWithPrizes = {};
  assignments.forEach(function(a) {
    if (a.status === 'won' || a.status === 'contacted' || a.status === 'fulfilled') {
      winnersWithPrizes[a.participant_id] = true;
    }
  });

  container.innerHTML = '' +
    '<div class="admin-metric"><span class="admin-metric-num">' + totalParticipants + '</span><span class="admin-metric-label">إجمالي المشاركين</span></div>' +
    '<div class="admin-metric"><span class="admin-metric-num">' + totalReferrals + '</span><span class="admin-metric-label">إجمالي الإحالات</span></div>' +
    '<div class="admin-metric"><span class="admin-metric-num">' + qualifiedReferrals + '</span><span class="admin-metric-label">الإحالات المؤهلة</span></div>' +
    '<div class="admin-metric"><span class="admin-metric-num">' + Object.keys(winnersWithPrizes).length + '</span><span class="admin-metric-label">عدد الفائزين</span></div>' +
    '<div class="admin-metric"><span class="admin-metric-num">' + totalRewardsDistributed + '</span><span class="admin-metric-label">الجوائز الموزعة</span></div>' +
    '<div class="admin-metric"><span class="admin-metric-num">' + totalMessages + '</span><span class="admin-metric-label">الرسائل المرسلة</span></div>';
}

/* ===== Rewards Tab ===== */
function renderRewards() {
  var grid = document.getElementById('rewardsGrid');
  var loading = document.getElementById('rewardsLoading');
  var empty = document.getElementById('rewardsEmpty');
  if (loading) loading.style.display = 'none';

  if (rewards.length === 0) {
    grid.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  var typeIcons = { cash: 'fa-money-bill-wave', product: 'fa-box', coupon: 'fa-tag' };
  var typeLabels = { cash: 'جائزة مالية', product: 'منتجات', coupon: 'كوبونات' };

  grid.innerHTML = rewards.map(function(r) {
    return '<div class="reward-admin-card">' +
      '<div class="reward-header">' +
      '<span class="reward-title"><i class="fa-solid ' + (typeIcons[r.reward_type] || 'fa-gift') + '" style="color:#6D28D9;margin-left:6px;"></i>' + escapeHtml(r.title) + '</span>' +
      '<div class="reward-actions">' +
      '<button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="openRewardModal(\'' + r.id + '\')"><i class="fa-solid fa-pen"></i></button>' +
      '<button class="admin-btn admin-btn-danger admin-btn-sm" onclick="deleteReward(\'' + r.id + '\')"><i class="fa-solid fa-trash"></i></button>' +
      '</div></div>' +
      '<div class="reward-body">' + escapeHtml(r.description || '') + '</div>' +
      '<div style="display:flex;gap:12px;font-size:0.8rem;">' +
      '<span style="font-weight:700;color:#6D28D9;">' + escapeHtml(r.value || '') + '</span>' +
      '<span style="color:#64748b;">العدد: ' + (r.quantity || 0) + '</span>' +
      '<span class="status-badge status-active" style="font-size:0.65rem;">' + (typeLabels[r.reward_type] || '') + '</span>' +
      '</div></div>';
  }).join('');
}

function openRewardModal(id) {
  editingRewardId = id || null;
  document.getElementById('rewardModalTitle').textContent = id ? 'تعديل جائزة' : 'إضافة جائزة';
  document.getElementById('rewardType').value = 'cash';
  document.getElementById('rewardTitle').value = '';
  document.getElementById('rewardDescription').value = '';
  document.getElementById('rewardValue').value = '';
  document.getElementById('rewardQuantity').value = '';
  document.getElementById('rewardImage').value = '';

  if (id) {
    var r = rewards.find(function(rw) { return rw.id === id; });
    if (r) {
      document.getElementById('rewardType').value = r.reward_type;
      document.getElementById('rewardTitle').value = r.title;
      document.getElementById('rewardDescription').value = r.description || '';
      document.getElementById('rewardValue').value = r.value || '';
      document.getElementById('rewardQuantity').value = r.quantity || 0;
      document.getElementById('rewardImage').value = r.image_url || '';
    }
  }

  document.getElementById('rewardModal').classList.add('open');
}

function closeRewardModal() {
  document.getElementById('rewardModal').classList.remove('open');
  editingRewardId = null;
}

function saveReward() {
  if (!campaign) { showToast('لا توجد حملة نشطة', 'error'); return; }
  var data = {
    campaign_id: campaign.id,
    reward_type: document.getElementById('rewardType').value,
    title: document.getElementById('rewardTitle').value.trim(),
    description: document.getElementById('rewardDescription').value.trim(),
    value: document.getElementById('rewardValue').value.trim(),
    quantity: parseInt(document.getElementById('rewardQuantity').value) || 0,
    image_url: document.getElementById('rewardImage').value.trim()
  };

  if (!data.title) { showToast('العنوان مطلوب', 'error'); return; }
  if (editingRewardId) data.id = editingRewardId;

  var method = editingRewardId ? 'update' : 'insert';
  var query = budaSupabase.from('contest_rewards').upsert([data]).select().single();

  query.then(function(res) {
    if (res.error) { showToast('خطأ في الحفظ: ' + res.error.message, 'error'); return; }
    showToast(editingRewardId ? 'تم تعديل الجائزة' : 'تم إضافة الجائزة', 'success');
    closeRewardModal();
    /* Reload rewards */
    loadRewards(campaign.id).then(function(r) {
      if (!r.error) rewards = r.data || [];
      renderRewards();
    });
  }).catch(function(err) {
    showToast('خطأ في الحفظ', 'error');
    console.error(err);
  });
}

function deleteReward(id) {
  if (!confirm('هل أنت متأكد من حذف هذه الجائزة؟')) return;
  budaSupabase.from('contest_rewards').delete().eq('id', id).then(function(res) {
    if (res.error) { showToast('خطأ في الحذف', 'error'); return; }
    showToast('تم حذف الجائزة', 'success');
    rewards = rewards.filter(function(r) { return r.id !== id; });
    renderRewards();
  });
}

/* ===== Winners Tab ===== */
function renderWinners() {
  var tbody = document.getElementById('winnersTableBody');
  var mobile = document.getElementById('winnersMobileCards');
  var empty = document.getElementById('winnersEmpty');
  var filter = document.getElementById('winnerFilter').value;

  var withAssignments = [];
  assignments.forEach(function(a) {
    if (filter !== 'all' && a.status !== filter) return;
    var p = participants.find(function(pp) { return pp.id === a.participant_id; });
    if (p) {
      withAssignments.push({ participant: p, assignment: a });
    }
  });

  if (withAssignments.length === 0) {
    tbody.innerHTML = '';
    mobile.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = withAssignments.map(function(item) {
    var p = item.participant;
    var a = item.assignment;
    var reward = a.contest_rewards || {};
    var refCount = referrals.filter(function(r) { return r.referrer_user_id === p.user_id; }).length;
    return '<tr>' +
      '<td><a href="#" onclick="openDrawer(\'' + p.id + '\');return false;" style="color:#6D28D9;text-decoration:none;font-weight:700;">' + escapeHtml(p.full_name + ' ' + p.family_name) + '</a></td>' +
      '<td>' + escapeHtml(p.email) + '</td>' +
      '<td dir="ltr">' + escapeHtml(p.phone) + '</td>' +
      '<td style="direction:ltr;font-family:monospace;color:#6D28D9;font-weight:700;">' + escapeHtml(p.referral_code) + '</td>' +
      '<td>' + escapeHtml(reward.title || '—') + '</td>' +
      '<td>' + (reward.reward_type || '—') + '</td>' +
      '<td><span class="status-badge status-' + a.status + '">' + statusLabel(a.status) + '</span></td>' +
      '<td class="actions-cell">' +
      '<button class="admin-btn admin-btn-primary admin-btn-sm" onclick="openDrawer(\'' + p.id + '\')"><i class="fa-solid fa-eye"></i></button>' +
      '<button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="updateAssignmentStatus(\'' + a.id + '\',\'contacted\')"><i class="fa-solid fa-phone"></i></button>' +
      '<button class="admin-btn admin-btn-secondary admin-btn-sm" onclick="updateAssignmentStatus(\'' + a.id + '\',\'fulfilled\')"><i class="fa-solid fa-check"></i></button>' +
      '</td></tr>';
  }).join('');

  mobile.innerHTML = withAssignments.map(function(item) {
    var p = item.participant;
    var a = item.assignment;
    var reward = a.contest_rewards || {};
    return '<div class="mobile-card">' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الاسم</span><span class="mobile-card-value">' + escapeHtml(p.full_name + ' ' + p.family_name) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الجائزة</span><span class="mobile-card-value">' + escapeHtml(reward.title || '—') + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الحالة</span><span class="mobile-card-value"><span class="status-badge status-' + a.status + '">' + statusLabel(a.status) + '</span></span></div>' +
      '</div>';
  }).join('');
}

document.getElementById('winnerFilter').addEventListener('change', renderWinners);

function updateAssignmentStatus(assignmentId, newStatus) {
  budaSupabase.from('reward_assignments').update({ status: newStatus }).eq('id', assignmentId).then(function(res) {
    if (res.error) { showToast('خطأ في تحديث الحالة', 'error'); return; }
    showToast('تم تحديث الحالة', 'success');
    var idx = assignments.findIndex(function(a) { return a.id === assignmentId; });
    if (idx !== -1) assignments[idx].status = newStatus;
    renderWinners();
    renderParticipants();
  });
}

/* ===== Winner Assignment Modal ===== */
function openWinnerModal(participantId) {
  editingParticipantId = participantId;
  var p = participants.find(function(pp) { return pp.id === participantId; });
  if (!p) return;

  var existing = assignments.find(function(a) { return a.participant_id === participantId; });

  var html = '<div class="modal-field"><label>المشارك</label><input type="text" value="' + escapeHtml(p.full_name + ' ' + p.family_name) + '" readonly /></div>';
  html += '<div class="modal-field"><label>الجائزة</label><select id="winnerRewardSelect">';
  rewards.forEach(function(r) {
    html += '<option value="' + r.id + '" ' + (existing && existing.reward_id === r.id ? 'selected' : '') + '>' + escapeHtml(r.title) + ' (' + escapeHtml(r.value || '') + ')</option>';
  });
  html += '</select></div>';
  html += '<div class="modal-field"><label>الحالة</label><select id="winnerStatusSelect">';
  ['pending', 'won', 'not_won', 'contacted', 'fulfilled'].forEach(function(s) {
    html += '<option value="' + s + '" ' + (existing && existing.status === s ? 'selected' : '') + '>' + statusLabel(s) + '</option>';
  });
  html += '</select></div>';

  document.getElementById('winnerModalBody').innerHTML = html;
  document.getElementById('winnerModal').classList.add('open');
}

function closeWinnerModal() {
  document.getElementById('winnerModal').classList.remove('open');
  editingParticipantId = null;
}

document.getElementById('saveWinnerBtn').addEventListener('click', function() {
  if (!editingParticipantId || !campaign) return;
  var rewardId = document.getElementById('winnerRewardSelect').value;
  var status = document.getElementById('winnerStatusSelect').value;

  var existing = assignments.find(function(a) { return a.participant_id === editingParticipantId; });

  var data = {
    campaign_id: campaign.id,
    participant_id: editingParticipantId,
    reward_id: rewardId,
    status: status,
    assigned_at: new Date().toISOString()
  };
  if (existing) data.id = existing.id;

  budaSupabase.from('reward_assignments').upsert([data]).select().single().then(function(res) {
    if (res.error) { showToast('خطأ في تعيين الجائزة', 'error'); return; }
    showToast('تم تعيين الجائزة', 'success');
    closeWinnerModal();

    /* Reload */
    loadAssignments(campaign.id).then(function(aRes) {
      if (!aRes.error) assignments = aRes.data || [];
      renderWinners();
      renderParticipants();
      renderStats();
    });
  }).catch(function(err) {
    showToast('خطأ في التعيين', 'error');
    console.error(err);
  });
});

/* ===== Messages Tab ===== */
function renderMessages() {
  var tbody = document.getElementById('messagesTableBody');
  var mobile = document.getElementById('messagesMobileCards');
  var empty = document.getElementById('messagesEmpty');

  if (messages.length === 0) {
    tbody.innerHTML = '';
    mobile.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  function getParticipantNameByUserId(uid) {
    if (!uid) return '—';
    var p = participants.find(function(pp) { return pp.user_id === uid; });
    return p ? escapeHtml(p.full_name + ' ' + p.family_name) : String(uid);
  }

  tbody.innerHTML = messages.map(function(m) {
    return '<tr>' +
      '<td style="font-weight:700;">' + escapeHtml(m.title) + '</td>' +
      '<td style="font-size:0.78rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(m.message) + '</td>' +
      '<td>' + getParticipantNameByUserId(m.user_id) + '</td>' +
      '<td>' + (m.reward_type || '—') + '</td>' +
      '<td>' + (m.is_read ? '<span style="color:#16a34a;font-weight:700;">مقروءة</span>' : '<span style="color:#6D28D9;font-weight:700;">جديدة</span>') + '</td>' +
      '<td style="font-size:0.75rem;">' + formatDate(m.created_at) + '</td></tr>';
  }).join('');

  mobile.innerHTML = messages.map(function(m) {
    return '<div class="mobile-card">' +
      '<div class="mobile-card-row"><span class="mobile-card-label">العنوان</span><span class="mobile-card-value">' + escapeHtml(m.title) + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">الحالة</span><span class="mobile-card-value">' + (m.is_read ? 'مقروءة' : 'جديدة') + '</span></div>' +
      '<div class="mobile-card-row"><span class="mobile-card-label">التاريخ</span><span class="mobile-card-value">' + formatDate(m.created_at) + '</span></div>' +
      '</div>';
  }).join('');
}

function openMessageModal() {
  var select = document.getElementById('msgUserId');
  select.innerHTML = '<option value="">اختر مستخدم...</option>';
  participants.forEach(function(p) {
    select.innerHTML += '<option value="' + p.user_id + '">' + escapeHtml(p.full_name + ' ' + p.family_name + ' (' + p.email + ')') + '</option>';
  });
  document.getElementById('msgTitle').value = '';
  document.getElementById('msgText').value = '';
  document.getElementById('msgRewardType').value = '';
  document.getElementById('messageModal').classList.add('open');
}

function closeMessageModal() {
  document.getElementById('messageModal').classList.remove('open');
}

function sendMessage() {
  var userId = document.getElementById('msgUserId').value;
  var title = document.getElementById('msgTitle').value.trim();
  var text = document.getElementById('msgText').value.trim();
  var rewardType = document.getElementById('msgRewardType').value;

  if (!userId || !title || !text) {
    showToast('جميع الحقول المطلوبة يجب أن تمتلئ', 'error');
    return;
  }
  if (!campaign) { showToast('لا توجد حملة نشطة', 'error'); return; }

  var data = {
    user_id: userId,
    campaign_id: campaign.id,
    title: title,
    message: text,
    reward_type: rewardType || null,
    is_read: false
  };

  budaSupabase.from('contest_messages').insert([data]).select().single().then(function(res) {
    if (res.error) { showToast('خطأ في إرسال الرسالة', 'error'); return; }
    showToast('تم إرسال الرسالة بنجاح', 'success');
    closeMessageModal();

    /* Reload */
    loadMessages(campaign.id).then(function(mRes) {
      if (!mRes.error) messages = mRes.data || [];
      renderMessages();
      renderStats();
    });
  }).catch(function(err) {
    showToast('خطأ في الإرسال', 'error');
    console.error(err);
  });
}

/* ===== Settings Tab ===== */
function renderSettings() {
  var container = document.getElementById('settingsForm');
  if (!container || !campaign) return;

  container.innerHTML = '' +
    '<div class="form-field"><label>اسم المسابقة</label><input type="text" id="setName" value="' + escapeHtml(campaign.name) + '" /></div>' +
    '<div class="form-field"><label>الوصف</label><textarea id="setDescription" rows="2">' + escapeHtml(campaign.description || '') + '</textarea></div>' +
    '<div class="form-field"><label>تاريخ البداية</label><input type="datetime-local" id="setStart" value="' + toDatetimeLocal(campaign.start_at) + '" /></div>' +
    '<div class="form-field"><label>تاريخ النهاية</label><input type="datetime-local" id="setEnd" value="' + toDatetimeLocal(campaign.end_at) + '" /></div>' +
    '<div class="form-field"><label>الحالة</label><select id="setStatus">' +
    '<option value="active" ' + (campaign.status === 'active' ? 'selected' : '') + '>نشطة</option>' +
    '<option value="draft" ' + (campaign.status === 'draft' ? 'selected' : '') + '>مسودة</option>' +
    '<option value="ended" ' + (campaign.status === 'ended' ? 'selected' : '') + '>منتهية</option>' +
    '</select></div>' +
    '<button class="admin-btn admin-btn-primary" onclick="saveSettings()" style="width:fit-content;"><i class="fa-solid fa-floppy-disk"></i> حفظ الإعدادات</button>';
}

function saveSettings() {
  if (!campaign) return;
  var data = {
    name: document.getElementById('setName').value.trim(),
    description: document.getElementById('setDescription').value.trim(),
    start_at: document.getElementById('setStart').value,
    end_at: document.getElementById('setEnd').value,
    status: document.getElementById('setStatus').value
  };

  if (!data.name) { showToast('اسم المسابقة مطلوب', 'error'); return; }

  budaSupabase.from('contest_campaigns').update(data).eq('id', campaign.id).then(function(res) {
    if (res.error) { showToast('خطأ في حفظ الإعدادات', 'error'); return; }
    showToast('تم حفظ الإعدادات', 'success');
    campaign = Object.assign(campaign, data);
  });
}

/* ===== Detail Drawer ===== */
function openDrawer(participantId) {
  var p = participants.find(function(pp) { return pp.id === participantId; });
  if (!p) return;

  var drawer = document.getElementById('detailDrawer');
  var body = document.getElementById('drawerBody');

  /* Profile */
  var profileHtml = '' +
    rowHtml('الاسم', escapeHtml(p.full_name + ' ' + p.family_name)) +
    rowHtml('البريد', escapeHtml(p.email)) +
    rowHtml('الهاتف', escapeHtml(p.phone)) +
    rowHtml('المدينة', escapeHtml(p.city)) +
    rowHtml('تاريخ الميلاد', p.birth_date || '—') +
    rowHtml('تاريخ التسجيل', formatDate(p.created_at));

  document.getElementById('drawerProfile').innerHTML = profileHtml;

  /* Referrals */
  var userReferrals = referrals.filter(function(r) { return r.referrer_user_id === p.user_id; });
  var qualifiedCnt = userReferrals.filter(function(r) { return r.status === 'qualified'; }).length;
  document.getElementById('drawerReferrals').innerHTML = '' +
    rowHtml('كود الدعوة', '<span style="direction:ltr;font-family:monospace;color:#6D28D9;font-weight:700;">' + escapeHtml(p.referral_code) + '</span>') +
    rowHtml('الرابط', '<span style="direction:ltr;font-size:0.72rem;word-break:break-all;">https://buda-rho.vercel.app/pages/contest.html?ref=' + encodeURIComponent(p.referral_code) + '</span>') +
    rowHtml('عدد الإحالات', userReferrals.length) +
    rowHtml('الإحالات المؤهلة', qualifiedCnt);

  /* Rewards */
  var userAssignments = assignments.filter(function(a) { return a.participant_id === p.id; });
  if (userAssignments.length === 0) {
    document.getElementById('drawerRewards').innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;">لا توجد جوائز</p>';
  } else {
    document.getElementById('drawerRewards').innerHTML = userAssignments.map(function(a) {
      var r = a.contest_rewards || {};
      return '<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
        rowHtml('الجائزة', escapeHtml(r.title || '—')) +
        rowHtml('القيمة', escapeHtml(r.value || '—')) +
        rowHtml('الحالة', '<span class="status-badge status-' + a.status + '">' + statusLabel(a.status) + '</span>') +
        '</div>';
    }).join('');
  }

  /* Messages */
  var userMessages = messages.filter(function(m) { return m.user_id === p.user_id; });
  if (userMessages.length === 0) {
    document.getElementById('drawerMessages').innerHTML = '<p style="color:#94a3b8;font-size:0.8rem;">لا توجد رسائل</p>';
  } else {
    document.getElementById('drawerMessages').innerHTML = userMessages.map(function(m) {
      return '<div style="padding:8px 0;border-bottom:1px solid #f1f5f9;">' +
        rowHtml('العنوان', escapeHtml(m.title)) +
        rowHtml('الرسالة', escapeHtml(m.message)) +
        rowHtml('التاريخ', formatDate(m.created_at)) +
        rowHtml('مقروءة', m.is_read ? 'نعم' : 'لا') +
        '</div>';
    }).join('');
  }

  drawer.classList.add('open');
}

function closeDrawer() {
  document.getElementById('detailDrawer').classList.remove('open');
}

/* Close drawer on Escape */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeDrawer();
    closeRewardModal();
    closeWinnerModal();
    closeMessageModal();
  }
});

/* Close modals on backdrop click */
document.querySelectorAll('.admin-modal-backdrop').forEach(function(el) {
  el.addEventListener('click', function(e) {
    if (e.target === this) {
      this.classList.remove('open');
    }
  });
});

/* ===== Utility Functions ===== */
function getReferredName(userId) {
  if (!userId) return '—';
  var p = participants.find(function(pp) { return pp.user_id === userId; });
  return p ? escapeHtml(p.full_name + ' ' + p.family_name) : userId.substring(0, 8) + '...';
}

function escapeHtml(str) {
  var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(str || '').replace(/[&<>"']/g, function(m) { return map[m]; });
}

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch(e) { return String(d); }
}

function toDatetimeLocal(d) {
  if (!d) return '';
  try {
    var date = new Date(d);
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var day = String(date.getDate()).padStart(2, '0');
    var h = String(date.getHours()).padStart(2, '0');
    var min = String(date.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + day + 'T' + h + ':' + min;
  } catch(e) { return ''; }
}

function rowHtml(label, value) {
  return '<div class="detail-row"><span class="detail-label">' + label + '</span><span class="detail-value">' + value + '</span></div>';
}

function statusLabel(s) {
  var labels = {
    pending: 'قيد الانتظار',
    qualified: 'مؤهل',
    rejected: 'مرفوض',
    won: 'فائز',
    not_won: 'غير فائز',
    contacted: 'تم التواصل',
    fulfilled: 'تم التسليم',
    draft: 'مسودة',
    active: 'نشط',
    ended: 'منتهي'
  };
  return labels[s] || s;
}
