(function () {
  'use strict';

  var SUPABASE_URL = "https://msgqzgzoslearaprgiqq.supabase.co";
  var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ3F6Z3pvc2xlYXJhcHJnaXFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzk3MTIsImV4cCI6MjA4NTkxNTcxMn0.fQu1toCisGIly8FZqHy3yoEwnY-e7vthk8PCmkBMifE";
  var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  var editingCategoryId = null;
  var editingBranchId = null;
  var currentBranchCategoryId = null;
  var deleteTarget = null;
  var deleteType = 'category';

  /* ===== Toast ===== */
  function showToast(msg, type) {
    type = type || 'success';
    var existing = document.querySelector('.cat-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'cat-toast show ' + type;
    toast.innerHTML = '<i class="fa-solid fa-' + (type === 'success' ? 'check-circle' : 'exclamation-circle') + '"></i> ' + msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.classList.remove('show'); setTimeout(function () { toast.remove(); }, 300); }, 3000);
  }

  /* ===== Modal Controls ===== */
  window.openCatModal = function () { document.getElementById('catModal').classList.add('open'); };
  window.closeCatModal = function () {
    document.getElementById('catModal').classList.remove('open');
    document.getElementById('catForm').reset();
    document.getElementById('f_cat_active').checked = true;
    document.getElementById('catImgPreview').innerHTML = '<i class="fa-solid fa-image"></i><span>صورة القسم</span>';
    document.getElementById('catImgUrl').value = '';
    editingCategoryId = null;
    document.getElementById('catModalTitle').textContent = 'إضافة قسم جديد';
    document.getElementById('catSaveBtn').querySelector('span').textContent = 'حفظ القسم';
  };

  window.openBranchModal = function () { document.getElementById('branchModal').classList.add('open'); };
  window.closeBranchModal = function () {
    document.getElementById('branchModal').classList.remove('open');
    document.getElementById('branchForm').reset();
    document.getElementById('branchFormWrap').style.display = 'none';
    document.getElementById('branchImgPreview').innerHTML = '<i class="fa-solid fa-image"></i><span>صورة الفرع</span>';
    document.getElementById('branchImgUrl').value = '';
    editingBranchId = null;
    currentBranchCategoryId = null;
  };

  window.openDeleteModal = function () { document.getElementById('deleteModal').classList.add('open'); };
  window.closeDeleteModal = function () {
    document.getElementById('deleteModal').classList.remove('open');
    deleteTarget = null;
    deleteType = 'category';
  };

  /* ===== Category Image ===== */
  window.setCatImageFromUrl = function () {
    var url = document.getElementById('catImgUrl').value.trim();
    if (!url) return;
    document.getElementById('catImgPreview').innerHTML = '<img src="' + url + '" onerror="this.outerHTML=\'<i class=\\\'fa-solid fa-image\\\'></i><span>رابط غير صالح</span>\'" />';
  };

  window.uploadCatImage = async function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    try {
      var ext = file.name.split('.').pop() || 'jpg';
      var fileName = 'category_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
      var { data, error } = await supabase.storage.from('Buda').upload('categories/' + fileName, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      var { data: urlData } = supabase.storage.from('Buda').getPublicUrl('categories/' + fileName);
      var publicUrl = urlData.publicUrl;
      document.getElementById('catImgPreview').innerHTML = '<img src="' + publicUrl + '" />';
      document.getElementById('catImgUrl').value = publicUrl;
      showToast('تم رفع الصورة بنجاح', 'success');
    } catch (e) {
      showToast('فشل رفع الصورة: ' + (e.message || e), 'error');
    }
  };

  /* ===== Branch Image ===== */
  window.setBranchImageFromUrl = function () {
    var url = document.getElementById('branchImgUrl').value.trim();
    if (!url) return;
    document.getElementById('branchImgPreview').innerHTML = '<img src="' + url + '" onerror="this.outerHTML=\'<i class=\\\'fa-solid fa-image\\\'></i><span>رابط غير صالح</span>\'" />';
  };

  window.uploadBranchImage = async function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    try {
      var ext = file.name.split('.').pop() || 'jpg';
      var fileName = 'branch_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6) + '.' + ext;
      var { data, error } = await supabase.storage.from('Buda').upload('branches/' + fileName, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      var { data: urlData } = supabase.storage.from('Buda').getPublicUrl('branches/' + fileName);
      var publicUrl = urlData.publicUrl;
      document.getElementById('branchImgPreview').innerHTML = '<img src="' + publicUrl + '" />';
      document.getElementById('branchImgUrl').value = publicUrl;
      showToast('تم رفع الصورة بنجاح', 'success');
    } catch (e) {
      showToast('فشل رفع الصورة: ' + (e.message || e), 'error');
    }
  };

  /* ===== Load Categories ===== */
  async function loadCategories(searchTerm) {
    document.getElementById('catLoading').style.display = 'flex';
    document.getElementById('catTableBody').innerHTML = '';
    document.getElementById('catEmpty').style.display = 'none';

    try {
      var query = supabase.from('categories').select('*');
      if (searchTerm && searchTerm.trim()) {
        var term = searchTerm.trim();
        query = query.or('name.ilike.%' + term + '%,description.ilike.%' + term + '%');
      }
      query = query.order('sort_order', { ascending: true });

      var { data: categories, error } = await query;
      if (error) throw error;

      // Get branch counts
      var branchCounts = {};
      if (categories && categories.length) {
        var { data: branches } = await supabase.from('category_branches').select('category_id');
        if (branches) {
          branches.forEach(function (b) {
            branchCounts[b.category_id] = (branchCounts[b.category_id] || 0) + 1;
          });
        }
      }

      // Update stats
      var active = categories ? categories.filter(function (c) { return c.is_active; }).length : 0;
      var inactive = categories ? categories.length - active : 0;
      var totalBranches = Object.values(branchCounts).reduce(function (a, b) { return a + b; }, 0);
      document.getElementById('totalCategories').textContent = categories ? categories.length : 0;
      document.getElementById('activeCategories').textContent = active;
      document.getElementById('inactiveCategories').textContent = inactive;
      document.getElementById('totalBranches').textContent = totalBranches;

      document.getElementById('catLoading').style.display = 'none';

      if (!categories || !categories.length) {
        document.getElementById('catEmpty').style.display = 'flex';
        document.getElementById('catTableBody').innerHTML = '';
        return;
      }

      document.getElementById('catEmpty').style.display = 'none';
      document.getElementById('catTableBody').innerHTML = categories.map(function (cat, i) {
        var imgHtml = cat.image_url
          ? '<img class="cat-table-img" src="' + cat.image_url + '" onerror="this.outerHTML=\'<div class=\\\'cat-table-img-placeholder\\\'><i class=\\\'fa-solid fa-image\\\'></i></div>\'" />'
          : '<div class="cat-table-img-placeholder"><i class="fa-solid fa-image"></i></div>';
        var branchCount = branchCounts[cat.id] || 0;
        var statusHtml = cat.is_active
          ? '<span class="cat-badge cat-badge-active"><i class="fa-solid fa-check-circle"></i> نشط</span>'
          : '<span class="cat-badge cat-badge-inactive"><i class="fa-solid fa-circle-xmark"></i> غير نشط</span>';
        var slug = cat.slug || '';

        return '<tr>' +
          '<td style="color:var(--text-muted,#6b7280);font-weight:600;">' + (i + 1) + '</td>' +
          '<td>' + imgHtml + '</td>' +
          '<td><span class="cat-table-name">' + escapeHtml(cat.name) + '</span>' +
          (slug ? '<span class="cat-table-slug">' + escapeHtml(slug) + '</span>' : '') + '</td>' +
          '<td><span class="cat-badge cat-badge-count">' + (cat._productCount || 0) + '</span></td>' +
          '<td><span class="cat-badge cat-badge-count">' + branchCount + '</span></td>' +
          '<td>' + statusHtml + '</td>' +
          '<td><div class="cat-action-group">' +
          '<button class="cat-action-btn cat-action-edit" onclick="editCategory(\'' + cat.id + '\')"><i class="fa-solid fa-pen-to-square"></i> تعديل</button>' +
          '<button class="cat-action-btn cat-action-branches" onclick="openBranches(\'' + cat.id + '\',\'' + escapeHtml(cat.name) + '\')"><i class="fa-solid fa-code-branch"></i> إدارة الفروع</button>' +
          '<button class="cat-action-btn cat-action-delete" onclick="confirmDelete(\'' + cat.id + '\',\'category\',\'' + escapeHtml(cat.name) + '\')"><i class="fa-solid fa-trash-can"></i> حذف</button>' +
          '</div></td>' +
          '</tr>';
      }).join('');
    } catch (e) {
      document.getElementById('catLoading').style.display = 'none';
      document.getElementById('catTableBody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:#ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> خطأ في تحميل الأقسام: ' + (e.message || e) + '</td></tr>';
    }
  }

  /* ===== Add/Edit Category ===== */
  window.editCategory = async function (id) {
    try {
      var { data, error } = await supabase.from('categories').select('*').eq('id', id).single();
      if (error || !data) throw error || new Error('No data');

      editingCategoryId = id;
      document.getElementById('catModalTitle').textContent = 'تعديل القسم';
      document.getElementById('catSaveBtn').querySelector('span').textContent = 'تحديث القسم';
      document.getElementById('f_cat_name').value = data.name || '';
      document.getElementById('f_cat_slug').value = data.slug || '';
      document.getElementById('f_cat_sort').value = data.sort_order || 0;
      document.getElementById('f_cat_active').checked = data.is_active !== false;
      document.getElementById('f_cat_desc').value = data.description || '';
      document.getElementById('f_cat_keywords').value = (data.keywords || []).join('\n');
      updateActiveLabel('catActiveLabel', document.getElementById('f_cat_active').checked);

      if (data.image_url) {
        document.getElementById('catImgPreview').innerHTML = '<img src="' + data.image_url + '" />';
        document.getElementById('catImgUrl').value = data.image_url;
      }

      window.openCatModal();
    } catch (e) {
      showToast('خطأ في تحميل بيانات القسم: ' + (e.message || e), 'error');
    }
  };

  window.saveCategory = async function (e) {
    e.preventDefault();
    var name = document.getElementById('f_cat_name').value.trim();
    var slug = document.getElementById('f_cat_slug').value.trim();
    var sortOrder = parseInt(document.getElementById('f_cat_sort').value) || 0;
    var isActive = document.getElementById('f_cat_active').checked;
    var description = document.getElementById('f_cat_desc').value.trim();
    var keywordsRaw = document.getElementById('f_cat_keywords').value;
    var keywords = keywordsRaw.split('\n').map(function (k) { return k.trim(); }).filter(Boolean);
    var imageUrl = document.getElementById('catImgUrl').value.trim();

    if (!name) { showToast('يرجى إدخال اسم القسم', 'error'); return; }
    if (!slug) { showToast('يرجى إدخال الرابط المختصر (slug)', 'error'); return; }

    try {
      if (editingCategoryId) {
        var { error } = await supabase.from('categories').update({
          name: name,
          slug: slug,
          image_url: imageUrl,
          keywords: keywords,
          description: description,
          sort_order: sortOrder,
          is_active: isActive
        }).eq('id', editingCategoryId);
        if (error) throw error;
        showToast('تم تحديث القسم بنجاح', 'success');
      } else {
        var { error } = await supabase.from('categories').insert({
          name: name,
          slug: slug,
          image_url: imageUrl,
          keywords: keywords,
          description: description,
          sort_order: sortOrder,
          is_active: isActive
        });
        if (error) throw error;
        showToast('تم إضافة القسم بنجاح', 'success');
      }
      window.closeCatModal();
      await loadCategories();
    } catch (e) {
      showToast('خطأ في الحفظ: ' + (e.message || e), 'error');
    }
  };

  /* ===== Delete ===== */
  window.confirmDelete = function (id, type, name) {
    deleteTarget = id;
    deleteType = type;
    document.getElementById('deleteModalText').textContent = 'هل أنت متأكد من حذف ' + (type === 'category' ? 'القسم' : 'الفرع') + ' "' + name + '"؟';
    document.getElementById('deleteConfirmBtn').onclick = async function () {
      await executeDelete();
    };
    window.openDeleteModal();
  };

  async function executeDelete() {
    if (!deleteTarget) return;
    try {
      if (deleteType === 'category') {
        await supabase.from('category_branches').delete().eq('category_id', deleteTarget);
        var { error } = await supabase.from('categories').delete().eq('id', deleteTarget);
        if (error) throw error;
        showToast('تم حذف القسم وجميع فروعه', 'success');
      } else {
        var { error } = await supabase.from('category_branches').delete().eq('id', deleteTarget);
        if (error) throw error;
        showToast('تم حذف الفرع', 'success');
        if (currentBranchCategoryId) {
          await loadBranches(currentBranchCategoryId);
        }
      }
      window.closeDeleteModal();
      await loadCategories();
    } catch (e) {
      showToast('خطأ في الحذف: ' + (e.message || e), 'error');
    }
  }

  /* ===== Branches ===== */
  window.openBranches = async function (categoryId, categoryName) {
    currentBranchCategoryId = categoryId;
    document.getElementById('branchCategoryName').textContent = categoryName;
    document.getElementById('branchModalTitle').textContent = 'إدارة الفروع - ' + categoryName;
    document.getElementById('branchList').innerHTML = '<div class="cat-loading"><i class="fa-solid fa-spinner fa-spin"></i> جاري تحميل الفروع...</div>';
    document.getElementById('branchFormWrap').style.display = 'none';
    window.openBranchModal();
    await loadBranches(categoryId);
  };

  async function loadBranches(categoryId) {
    try {
      var { data, error } = await supabase.from('category_branches').select('*').eq('category_id', categoryId).eq('is_active', true).order('sort_order', { ascending: true });
      if (error) throw error;

      var container = document.getElementById('branchList');
      if (!data || !data.length) {
        container.innerHTML = '<div class="branch-empty"><i class="fa-solid fa-code-branch"></i><p>لا توجد فروع بعد. أضف أول فرع الآن!</p></div>';
        return;
      }

      container.innerHTML = data.map(function (b) {
        var imgHtml = b.branch_image
          ? '<img class="branch-item-img" src="' + b.branch_image + '" onerror="this.outerHTML=\'<div class=\\\'branch-item-img-placeholder\\\'><i class=\\\'fa-solid fa-image\\\'></i></div>\'" />'
          : '<div class="branch-item-img-placeholder"><i class="fa-solid fa-image"></i></div>';
        var keywords = (b.branch_keywords || []).join('، ') || 'بدون كلمات مفتاحية';
        return '<div class="branch-item">' +
          imgHtml +
          '<div class="branch-item-info">' +
          '<div class="branch-item-name">' + escapeHtml(b.branch_name) + '</div>' +
          '<div class="branch-item-keywords">' + escapeHtml(keywords) + '</div>' +
          '</div>' +
          '<div class="branch-item-actions">' +
          '<button class="cat-action-btn cat-action-edit" onclick="editBranch(\'' + b.id + '\')"><i class="fa-solid fa-pen-to-square"></i></button>' +
          '<button class="cat-action-btn cat-action-delete" onclick="confirmDelete(\'' + b.id + '\',\'branch\',\'' + escapeHtml(b.branch_name) + '\')"><i class="fa-solid fa-trash-can"></i></button>' +
          '</div>' +
          '</div>';
      }).join('');
    } catch (e) {
      document.getElementById('branchList').innerHTML = '<div class="branch-empty"><i class="fa-solid fa-triangle-exclamation" style="color:#ef4444;"></i><p>خطأ في تحميل الفروع</p></div>';
    }
  }

  window.openAddBranchForm = function () {
    editingBranchId = null;
    document.getElementById('branchForm').reset();
    document.getElementById('f_branch_active').checked = true;
    document.getElementById('branchImgPreview').innerHTML = '<i class="fa-solid fa-image"></i><span>صورة الفرع</span>';
    document.getElementById('branchImgUrl').value = '';
    document.getElementById('branchFormTitle').textContent = 'إضافة فرع جديد';
    document.getElementById('branchFormWrap').style.display = 'block';
  };

  window.editBranch = async function (id) {
    try {
      var { data, error } = await supabase.from('category_branches').select('*').eq('id', id).single();
      if (error || !data) throw error || new Error('No data');

      editingBranchId = id;
      document.getElementById('branchFormTitle').textContent = 'تعديل الفرع';
      document.getElementById('f_branch_name').value = data.branch_name || '';
      document.getElementById('f_branch_sort').value = data.sort_order || 0;
      document.getElementById('f_branch_active').checked = data.is_active !== false;
      updateActiveLabel('branchActiveLabel', document.getElementById('f_branch_active').checked);
      document.getElementById('f_branch_keywords').value = (data.branch_keywords || []).join('\n');

      if (data.branch_image) {
        document.getElementById('branchImgPreview').innerHTML = '<img src="' + data.branch_image + '" />';
        document.getElementById('branchImgUrl').value = data.branch_image;
      }

      document.getElementById('branchFormWrap').style.display = 'block';
    } catch (e) {
      showToast('خطأ في تحميل بيانات الفرع', 'error');
    }
  };

  window.saveBranch = async function (e) {
    e.preventDefault();
    if (!currentBranchCategoryId) { showToast('خطأ: لم يتم تحديد القسم', 'error'); return; }

    var name = document.getElementById('f_branch_name').value.trim();
    var sortOrder = parseInt(document.getElementById('f_branch_sort').value) || 0;
    var isActive = document.getElementById('f_branch_active').checked;
    var keywordsRaw = document.getElementById('f_branch_keywords').value;
    var keywords = keywordsRaw.split('\n').map(function (k) { return k.trim(); }).filter(Boolean);
    var imageUrl = document.getElementById('branchImgUrl').value.trim();

    if (!name) { showToast('يرجى إدخال اسم الفرع', 'error'); return; }

    try {
      if (editingBranchId) {
        var { error } = await supabase.from('category_branches').update({
          branch_name: name,
          branch_image: imageUrl,
          branch_keywords: keywords,
          sort_order: sortOrder,
          is_active: isActive
        }).eq('id', editingBranchId);
        if (error) throw error;
        showToast('تم تحديث الفرع بنجاح', 'success');
      } else {
        var { error } = await supabase.from('category_branches').insert({
          category_id: currentBranchCategoryId,
          branch_name: name,
          branch_image: imageUrl,
          branch_keywords: keywords,
          sort_order: sortOrder,
          is_active: isActive
        });
        if (error) throw error;
        showToast('تم إضافة الفرع بنجاح', 'success');
      }

      document.getElementById('branchFormWrap').style.display = 'none';
      document.getElementById('branchForm').reset();
      editingBranchId = null;
      await loadBranches(currentBranchCategoryId);
    } catch (e) {
      showToast('خطأ في الحفظ: ' + (e.message || e), 'error');
    }
  };

  window.cancelBranchForm = function () {
    document.getElementById('branchFormWrap').style.display = 'none';
    document.getElementById('branchForm').reset();
    editingBranchId = null;
  };

  /* ===== Helpers ===== */
  function escapeHtml(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function updateActiveLabel(labelId, checked) {
    var label = document.getElementById(labelId);
    if (label) label.textContent = checked ? 'فعال' : 'غير فعال';
  }

  /* ===== Search ===== */
  window.debouncedSearch = (function () {
    var t;
    return function () {
      clearTimeout(t);
      var val = document.getElementById('catSearchInput').value;
      t = setTimeout(function () { loadCategories(val); }, 300);
    };
  })();

  /* ===== Toggle Labels ===== */
  document.addEventListener('change', function (e) {
    if (e.target.id === 'f_cat_active') updateActiveLabel('catActiveLabel', e.target.checked);
    if (e.target.id === 'f_branch_active') updateActiveLabel('branchActiveLabel', e.target.checked);
  });

  /* ===== Add Category Button ===== */
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('addCategoryBtn').addEventListener('click', function () {
      editingCategoryId = null;
      document.getElementById('catModalTitle').textContent = 'إضافة قسم جديد';
      document.getElementById('catSaveBtn').querySelector('span').textContent = 'حفظ القسم';
      document.getElementById('catForm').reset();
      document.getElementById('f_cat_active').checked = true;
      document.getElementById('f_cat_sort').value = '0';
      document.getElementById('catImgPreview').innerHTML = '<i class="fa-solid fa-image"></i><span>صورة القسم</span>';
      document.getElementById('catImgUrl').value = '';
      updateActiveLabel('catActiveLabel', true);
      window.openCatModal();
    });

    loadCategories();
  });

})();