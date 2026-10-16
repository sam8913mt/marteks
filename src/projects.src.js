/* ============================================================
   Merteks — مدیریت پروژه‌ها (صفحهٔ مستقل: admin-projects.html)
   ============================================================ */
(function () {
  'use strict';

  //@include common
  //@include admin-core
  var PAGE_TITLE = 'مدیریت پروژه‌های مرتکس';
  var state = { projects: null };
  function onEnter() { loadProjects(); }
  function onLogout() { state.projects = null; $('projList').innerHTML = ''; clearPreview(); }
  $('adRefresh').addEventListener('click', loadProjects);

  function loadProjects() {
    setEmpty('projList', 'در حال بارگذاری…');
    fetchProjectRows(['id,name,description,url,created_at', 'id,name,created_at'], 200).then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) { setEmpty('projList', 'بارگذاری پروژه‌ها انجام نشد: ' + esc(errText(res))); return; }
      state.projects = res.data.map(mapProject);
      renderProjects();
    }, function () { setEmpty('projList', 'اتصال به سرور برقرار نشد.'); });
  }
  function renderProjects() {
    var list = state.projects || [];
    if (!list.length) { setEmpty('projList', 'هنوز پروژه‌ای اضافه نشده است.'); return; }
    $('projList').innerHTML = list.map(function (p) {
      var cover = p.keys[0];
      return '<article class="ad-item ad-proj">' +
        (cover ? '<img src="' + esc(publicUrl(thumbKey(cover))) + '" data-full="' + esc(publicUrl(cover)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' : '<span></span>') +
        '<div><strong>' + esc(p.name) + '</strong><span class="ad-muted">' + fa(p.keys.length) + ' عکس · ' + esc(new Date(p.createdAt).toLocaleDateString('fa-IR')) + '</span>' +
        (p.description ? '<div class="ad-muted">' + esc(p.description) + '</div>' : '') + (p.url ? '<div class="ad-id">' + esc(p.url) + '</div>' : '') + '</div>' +
        '<button class="ad-btn ad-danger" type="button" data-pdel="' + esc(p.id) + '">حذف پروژه</button></article>';
    }).join('');
    thumbFallback($('projList'));
  }
  $('projList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pdel]');
    if (!b) return;
    if (!W.confirm('این پروژه و همهٔ عکس‌های آن حذف شود؟')) return;
    var id = b.getAttribute('data-pdel'), p = (state.projects || []).filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    b.disabled = true;
    var keys = p.keys.slice();
    if (keys[0]) keys.push(thumbKey(keys[0]));
    keys = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
    sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: keys } }).then(function (r1) {
      if (!r1.ok) throw new Error(errText(r1));
      return sb('DELETE', '/rest/v1/projects?id=eq.' + encodeURIComponent(id), { prefer: 'return=minimal' });
    }).then(function (r2) {
      if (!r2.ok) throw new Error(errText(r2));
      state.projects = state.projects.filter(function (x) { return x.id !== id; });
      clearSiteCache();
      renderProjects(); toast('پروژه حذف شد');
    }).catch(function (err) { b.disabled = false; toast('حذف انجام نشد: ' + (err && err.message || 'خطا')); });
  });

  /* انتخاب و پیش‌نمایش عکس‌ها */
  var picked = [], previewUrls = [];
  function clearPreview() { previewUrls.forEach(function (u) { URL.revokeObjectURL(u); }); previewUrls = []; $('projPreview').innerHTML = ''; }
  function showPicked() {
    clearPreview();
    $('projInfo').textContent = picked.length ? fa(picked.length) + ' عکس انتخاب شده است.' : 'هنوز عکسی انتخاب نشده است.';
    picked.slice(0, 30).forEach(function (f) {
      var u = URL.createObjectURL(f); previewUrls.push(u);
      var im = D.createElement('img'); im.src = u; im.alt = 'پیش‌نمایش'; im.decoding = 'async'; $('projPreview').appendChild(im);
    });
  }
  $('projFiles').addEventListener('change', function () {
    var files = Array.prototype.slice.call(this.files || []).filter(function (f) { return /^image\//.test(f.type); });
    if (files.length > 30) { toast('حداکثر ۳۰ عکس مجاز است'); files = files.slice(0, 30); }
    picked = files; showPicked();
  });
  $('projReset').addEventListener('click', function () { picked = []; $('projFiles').value = ''; $('projName').value = ''; $('projDesc').value = ''; $('projUrl').value = ''; showPicked(); });

  function loadImg(file) {
    return new Promise(function (resolve, reject) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); resolve(im); };
      im.onerror = function () { URL.revokeObjectURL(u); reject(new Error('خواندن تصویر ناموفق بود')); };
      im.src = u;
    });
  }
  function encode(img, max, q) {
    var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    var c = D.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return new Promise(function (resolve, reject) {
      c.toBlob(function (b) {
        if (b && b.type === 'image/webp') return resolve(b);
        c.toBlob(function (j) { j ? resolve(j) : reject(new Error('فشرده‌سازی تصویر ناموفق بود')); }, 'image/jpeg', q);
      }, 'image/webp', q);
    });
  }
  function setProgress(n, total, label) {
    var box = $('projProgress'); box.hidden = false;
    box.firstElementChild.style.width = Math.round((n / total) * 100) + '%';
    box.lastElementChild.textContent = label;
  }

  $('projForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('projName').value.trim();
    if (!name) { toast('نام پروژه را وارد کنید'); return; }
    if (picked.length < 1) { toast('حداقل یک عکس انتخاب کنید'); return; }
    if (picked.length > 30) { toast('حداکثر ۳۰ عکس مجاز است'); return; }
    var btn = $('projSave'); btn.disabled = true;
    var pid = null, uploaded = [], total = picked.length;

    function rollback(err) {
      var undo = Promise.resolve();
      if (uploaded.length) undo = sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: uploaded } }).catch(function () {});
      if (pid) undo = undo.then(function () { return sb('DELETE', '/rest/v1/projects?id=eq.' + encodeURIComponent(pid), { prefer: 'return=minimal' }).catch(function () {}); });
      return undo.then(function () { throw err; });
    }
    function upload(key, blob) {
      return sb('POST', '/storage/v1/object/' + BUCKET + '/' + key, { raw: blob, type: blob.type, timeout: 120000 }).then(function (r) {
        if (!r.ok) throw new Error('آپلود عکس ناموفق بود: ' + errText(r));
        uploaded.push(key);
      });
    }

    var desc = $('projDesc').value.trim(), url = $('projUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) { btn.disabled = false; toast('لینک باید با http:// یا https:// شروع شود'); return; }
    setProgress(0, total, 'در حال ساخت پروژه…');
    var createP = sb('POST', '/rest/v1/projects', { json: { name: name, description: desc || null, url: url || null }, prefer: 'return=representation' }).then(function (r) {
      if (r.ok) return r;
      if (!desc && !url) return r;
      /* ستون‌های جدید هنوز به دیتابیس اضافه نشده‌اند؛ پروژه بدون توضیح/لینک ساخته می‌شود */
      toast('برای ذخیرهٔ توضیح و لینک، فایل migration-portfolio.sql را در Supabase اجرا کنید');
      return sb('POST', '/rest/v1/projects', { json: { name: name }, prefer: 'return=representation' });
    });
    createP.then(function (r) {
      if (!r.ok || !Array.isArray(r.data) || !r.data[0]) throw new Error('ساخت پروژه ناموفق بود: ' + errText(r));
      pid = r.data[0].id;
      /* عکس‌ها یکی‌یکی فشرده و آپلود می‌شوند تا حافظهٔ مرورگر پر نشود */
      return picked.reduce(function (chain, file, i) {
        return chain.then(function () {
          setProgress(i, total, 'عکس ' + fa(i + 1) + ' از ' + fa(total) + '…');
          return loadImg(file).then(function (img) {
            return encode(img, 1800, 0.82).then(function (full) {
              var ext = full.type === 'image/webp' ? 'webp' : 'jpg';
              var key = pid + '/' + i + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
              return upload(key, full).then(function () {
                /* برای کاور یک نسخهٔ کوچک هم ذخیره می‌شود تا صفحهٔ اصلی سریع‌تر باز شود */
                if (i === 0 && ext === 'webp') {
                  return encode(img, 640, 0.8).then(function (th) { return upload(thumbKey(key), th); });
                }
              }).then(function () {
                return sb('POST', '/rest/v1/project_images', { json: { project_id: pid, pos: i, key: key }, prefer: 'return=minimal' }).then(function (r2) {
                  if (!r2.ok) throw new Error('ثبت عکس ناموفق بود: ' + errText(r2));
                });
              });
            });
          });
        });
      }, Promise.resolve());
    }).catch(rollback).then(function () {
      setProgress(total, total, 'انجام شد');
      toast('پروژه با موفقیت اضافه شد');
      clearSiteCache();
      $('projReset').click(); state.projects = null; loadProjects();
      setTimeout(function () { $('projProgress').hidden = true; }, 1200);
    }, function (err) {
      $('projProgress').hidden = true;
      toast(err && err.message ? err.message : 'ذخیرهٔ پروژه انجام نشد؛ دوباره امتحان کنید');
    }).then(function () { btn.disabled = false; });
  });


  startSession();
  W.addEventListener('pagehide', function () { clearPreview(); });
})();
