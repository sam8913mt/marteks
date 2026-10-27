/* Admin page for the download section. It edits downloads/app.json (and uploads files into
   downloads/) in the site's GitHub repository through the GitHub Contents API.
   The token lives only in this page's memory and is sent only to api.github.com.
   Permission is enforced by GitHub: without a token that can write to the repo, nothing happens. */
(function () {
  'use strict';
  var D = document;
  function $(id) { return D.getElementById(id); }
  if (window.top !== window.self) { var back = D.querySelector('.aa-back'); if (back) back.hidden = true; }
  var API = 'https://api.github.com';
  var JSON_PATH = 'downloads/app.json';
  var MAX_BYTES = 70 * 1024 * 1024; /* base64 inflates by a third; Contents API caps near 100 MB */
  var MAX_ITEMS = 12;
  var EXT = /\.(apk|exe|msi|zip|7z|dmg|pkg|deb|appimage)$/i;
  var PLATFORMS = [['android', 'اندروید'], ['windows', 'ویندوز'], ['ios', 'آیفون / آیپد'], ['macos', 'مک'], ['linux', 'لینوکس'], ['web', 'نسخهٔ وب'], ['other', 'دیگر']];
  var DEFAULT_TITLE = { android: 'اندروید', windows: 'ویندوز', ios: 'آیفون و آیپد', macos: 'مک', linux: 'لینوکس', web: 'نسخهٔ وب', other: 'دانلود' };
  var items = [];
  var busy = false;

  /* guess owner/repo from https://OWNER.github.io/REPO/… */
  (function guess() {
    var m = location.hostname.match(/^([^.]+)\.github\.io$/i);
    if (!m) return;
    $('owner').value = m[1];
    var seg = location.pathname.split('/').filter(Boolean)[0] || '';
    $('repo').value = seg && !/\.html?$/i.test(seg) ? seg : m[1] + '.github.io';
  })();

  function log(text, kind) {
    var ul = $('log'), first = ul.firstElementChild;
    if (first && first.classList.contains('aa-muted')) ul.removeChild(first);
    var li = D.createElement('li'); if (kind) li.className = kind; li.textContent = text;
    ul.appendChild(li); li.scrollIntoView({ block: 'nearest' });
  }
  function setBusy(b) { busy = b; $('save').disabled = b; $('addItem').disabled = b; }

  /* ---------- GitHub API ---------- */
  function gh(method, path, token, body) {
    var headers = { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch(API + path, { method: method, headers: headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); },
        function () { return { ok: false, status: 0, data: {} }; });
  }
  function explain(res) {
    switch (res.status) {
      case 0: return 'اتصال به api.github.com برقرار نشد (اینترنت یا فیلترینگ را بررسی کنید).';
      case 401: return 'توکن معتبر نیست یا منقضی شده است.';
      case 403: return 'GitHub دسترسی را رد کرد؛ توکن باید Contents: Read and write داشته باشد یا محدودیت تعداد درخواست رسیده است.' + (res.data && res.data.message ? ' [' + res.data.message + ']' : '');
      case 404: return 'مخزن پیدا نشد یا توکن به آن دسترسی ندارد؛ نام کاربری و مخزن را بررسی کنید.';
      case 409: return 'فایل همزمان تغییر کرده است؛ دوباره تلاش کنید.';
      case 422: return 'GitHub درخواست را نپذیرفت' + (res.data && res.data.message ? ': ' + res.data.message : '.');
      default: return 'خطای GitHub (' + res.status + ').';
    }
  }
  function readCreds() {
    var o = $('owner').value.trim(), r = $('repo').value.trim(), t = $('token').value.trim();
    if (!/^[\w.-]+$/.test(o) || !/^[\w.-]+$/.test(r)) { log('نام کاربری یا نام مخزن درست نیست.', 'bad'); return null; }
    if (!t) { log('توکن را وارد کنید.', 'bad'); return null; }
    return { t: t, base: '/repos/' + encodeURIComponent(o) + '/' + encodeURIComponent(r) };
  }
  function checkRepo(c) {
    log('در حال بررسی دسترسی…');
    return gh('GET', c.base, c.t).then(function (res) {
      if (!res.ok) throw new Error(explain(res));
      if (res.data.permissions && res.data.permissions.push === false) throw new Error('این توکن اجازهٔ نوشتن در مخزن را ندارد.');
      return res.data.default_branch || 'main';
    });
  }
  /* sha of an existing file. NOTE: GET /contents/<file> answers 403 "too_large" for files over 1 MB
     (like an APK), which used to look like a token error. Listing the parent folder has no such limit. */
  function currentSha(c, path, branch) {
    var i = path.lastIndexOf('/'), dir = i > -1 ? path.slice(0, i) : '', name = path.slice(i + 1);
    return gh('GET', c.base + '/contents/' + dir + '?ref=' + encodeURIComponent(branch), c.t).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(explain(res));
      var list = Array.isArray(res.data) ? res.data : [];
      for (var k = 0; k < list.length; k++) if (list[k].name === name) return list[k].sha || null;
      return null;
    });
  }
  function put(c, path, branch, b64, message) {
    return currentSha(c, path, branch).then(function (sha) {
      var body = { message: message, content: b64, branch: branch };
      if (sha) body.sha = sha;
      return gh('PUT', c.base + '/contents/' + path, c.t, body);
    }).then(function (res) { if (!res.ok) throw new Error(explain(res)); return res; });
  }
  function utf8b64(s) { return btoa(unescape(encodeURIComponent(s))); }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function fileB64(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { reject(new Error('خواندن فایل ممکن نشد.')); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- the list editor ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }
  function newId(platform) {
    var n = 1; while (items.some(function (i) { return i.id === platform + '-' + n; })) n++;
    return platform + '-' + n;
  }
  function normalise(raw) {
    var list = Array.isArray(raw && raw.items) ? raw.items : null;
    if (!list && raw && (raw.url || raw.file)) list = [{ platform: 'android', title: 'اندروید', url: raw.url || ('downloads/' + raw.file), version: raw.version, size: raw.size, sha256: raw.sha256, updated: raw.updated }];
    return (list || []).slice(0, MAX_ITEMS).map(function (i) {
      var platform = PLATFORMS.some(function (p) { return p[0] === i.platform; }) ? i.platform : 'other';
      return { id: String(i.id || ''), platform: platform, title: String(i.title || ''), url: String(i.url || ''), version: String(i.version || ''), note: String(i.note || ''),
        size: typeof i.size === 'number' ? i.size : 0, sha256: String(i.sha256 || ''), updated: String(i.updated || ''), _orig: String(i.url || ''), _file: null };
    }).map(function (i) { if (!i.id) i.id = newId(i.platform); return i; });
  }
  function field(labelText, node) {
    var l = D.createElement('label'); l.appendChild(D.createTextNode(labelText)); l.appendChild(node); return l;
  }
  function render() {
    var box = $('items'); box.textContent = '';
    if (!items.length) { var p = D.createElement('p'); p.className = 'aa-muted'; p.textContent = 'هنوز بخشی نیست. «افزودن بخش جدید» را بزنید.'; box.appendChild(p); return; }
    items.forEach(function (it, idx) {
      var card = D.createElement('div'); card.className = 'aa-item';
      var head = D.createElement('div'); head.className = 'aa-item-head';
      var st = D.createElement('strong'); st.textContent = (it.title || DEFAULT_TITLE[it.platform]) + ' (' + (idx + 1) + ')'; head.appendChild(st);
      var tools = D.createElement('div'); tools.className = 'aa-tools';
      function mini(txt, label, fn, dis, cls) { var b = D.createElement('button'); b.type = 'button'; b.className = 'aa-mini' + (cls ? ' ' + cls : ''); b.textContent = txt; b.setAttribute('aria-label', label); b.disabled = !!dis; b.addEventListener('click', fn); tools.appendChild(b); }
      mini('↑', 'بردن به بالا', function () { items.splice(idx - 1, 0, items.splice(idx, 1)[0]); render(); }, idx === 0);
      mini('↓', 'بردن به پایین', function () { items.splice(idx + 1, 0, items.splice(idx, 1)[0]); render(); }, idx === items.length - 1);
      mini('حذف', 'حذف این بخش', function () { items.splice(idx, 1); render(); }, false, 'danger');
      head.appendChild(tools); card.appendChild(head);

      var sel = D.createElement('select');
      PLATFORMS.forEach(function (p) { var o = D.createElement('option'); o.value = p[0]; o.textContent = p[1]; if (p[0] === it.platform) o.selected = true; sel.appendChild(o); });
      sel.addEventListener('change', function () { it.platform = sel.value; });
      var title = D.createElement('input'); title.type = 'text'; title.maxLength = 40; title.value = it.title; title.placeholder = DEFAULT_TITLE[it.platform];
      title.addEventListener('input', function () { it.title = title.value; });
      var g = D.createElement('div'); g.className = 'aa-grid'; g.appendChild(field('پلتفرم', sel)); g.appendChild(field('عنوان کارت', title)); card.appendChild(g);

      var url = D.createElement('input'); url.type = 'text'; url.setAttribute('dir', 'ltr'); url.autocomplete = 'off'; url.value = it.url; url.placeholder = 'https://… ؛ اگر فایل را بالا آپلود می‌کنید، خالی بگذارید';
      url.addEventListener('input', function () { it.url = url.value.trim(); });
      card.appendChild(field('آدرس مستقیم دانلود (فقط اگر فایل را بیرون از این سایت گذاشته‌اید)', url));

      var ver = D.createElement('input'); ver.type = 'text'; ver.maxLength = 24; ver.setAttribute('dir', 'ltr'); ver.value = it.version; ver.placeholder = '1.2.0';
      ver.addEventListener('input', function () { it.version = ver.value.trim(); });
      var file = D.createElement('input'); file.type = 'file'; file.accept = '.apk,.exe,.msi,.zip,.7z,.dmg,.pkg,.deb,.appimage';
      var pick = D.createElement('p'); pick.className = 'aa-info'; pick.setAttribute('aria-live', 'polite');
      function setPick(msg, bad) { pick.textContent = msg; pick.className = 'aa-info' + (bad ? ' bad' : ''); }
      function describe(f) {
        var mb = (f.size / 1e6).toFixed(1);
        return 'آماده برای ارسال: ' + f.name + ' (' + mb + ' مگابایت). بعد از ذخیره، آدرس آن می‌شود: downloads/' + safeName(f.name) + (f.size > 50e6 ? ' — بزرگ است؛ GitHub از ۵۰ مگابایت به بالا هشدار می‌دهد.' : '');
      }
      if (it._file) setPick(describe(it._file), false);
      file.addEventListener('change', function () {
        var f = file.files && file.files[0] ? file.files[0] : null;
        it._file = null;
        if (!f) return setPick('', false);
        if (!EXT.test(f.name)) { file.value = ''; return setPick('پسوند «' + f.name + '» مجاز نیست. فقط APK، EXE، MSI، ZIP، DMG، PKG، DEB یا AppImage.', true); }
        if (f.size > MAX_BYTES) { file.value = ''; return setPick('«' + f.name + '» بزرگ‌تر از ۷۰ مگابایت است؛ به‌جای آن آدرس مستقیم بدهید.', true); }
        it._file = f; setPick(describe(f), false);
      });
      var g2 = D.createElement('div'); g2.className = 'aa-grid'; g2.appendChild(field('شمارهٔ نسخه (اختیاری)', ver)); g2.appendChild(field('بارگذاری فایل (APK، EXE و …)', file)); card.appendChild(g2); card.appendChild(pick);

      var note = D.createElement('textarea'); note.maxLength = 240; note.value = it.note; note.placeholder = 'مثلاً: برای ویندوز ۱۰ و ۱۱ (۶۴ بیتی)';
      note.addEventListener('input', function () { it.note = note.value; });
      card.appendChild(field('توضیح کوتاه زیر دکمه (اختیاری)', note));

      if (it.size || it.sha256) {
        var info = D.createElement('p'); info.className = 'aa-info'; info.setAttribute('dir', 'auto');
        info.textContent = (it.size ? 'حجم: ' + (it.size / 1e6).toFixed(1) + ' MB' : '') + (it.sha256 ? '  ·  SHA-256: ' + it.sha256 : '');
        card.appendChild(info);
      }
      box.appendChild(card);
    });
  }
  $('addItem').addEventListener('click', function () {
    if (items.length >= MAX_ITEMS) return log('حداکثر ' + MAX_ITEMS + ' بخش مجاز است.', 'bad');
    items.push({ id: '', platform: 'other', title: '', url: '', version: '', note: '', size: 0, sha256: '', updated: '', _orig: '', _file: null, _new: true });
    render();
    var cards = D.querySelectorAll('.aa-item'); if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'center' });
  });

  /* step-by-step diagnosis: network -> token -> repo -> write permission */
  $('testConn').addEventListener('click', function () {
    if (busy) return;
    var c = readCreds(); if (!c) return;
    log('مرحلهٔ ۱ از ۳: اتصال به GitHub…');
    gh('GET', '/user', c.t).then(function (r) {
      if (r.status === 0) throw new Error('مرحلهٔ ۱: api.github.com در دسترس نیست. اینترنت یا فیلترینگ را بررسی کنید.');
      if (!r.ok) throw new Error('مرحلهٔ ۲: توکن قبول نشد. ' + explain(r));
      log('مرحلهٔ ۲ از ۳: توکن معتبر است' + (r.data.login ? ' (کاربر: ' + r.data.login + ')' : '') + '.', 'ok');
      return gh('GET', c.base, c.t).then(function (rr) {
        if (!rr.ok) throw new Error('مرحلهٔ ۳: مخزن پیدا نشد یا توکن به آن دسترسی ندارد. نام کاربری و نام مخزن را بررسی کنید. (' + rr.status + ')');
        if (rr.data.permissions && rr.data.permissions.push === false) throw new Error('مرحلهٔ ۳: توکن به مخزن دسترسی دارد ولی اجازهٔ نوشتن ندارد. گزینهٔ Contents را روی Read and write بگذارید.');
        log('مرحلهٔ ۳ از ۳: دسترسی به مخزن و اجازهٔ نوشتن تأیید شد. حالا می‌توانید فایل یا لینک را ذخیره کنید.', 'ok');
      });
    }).catch(function (e) { log(e && e.message ? e.message : 'خطای ناشناخته.', 'bad'); });
  });

  /* load the current list (public copy, no token needed) */
  fetch('downloads/app.json', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) { items = normalise(d); render(); if (d) log('فهرست فعلی خوانده شد.', 'ok'); else log('فایل فهرست خوانده نشد؛ می‌توانید بخش‌ها را از نو بسازید.', 'bad'); })
    .catch(function () { items = []; render(); log('فایل فهرست خوانده نشد؛ می‌توانید بخش‌ها را از نو بسازید.', 'bad'); });

  /* ---------- save ---------- */
  function validUrl(u) { return u === '' || /^https:\/\/[^\s"'<>]+$/i.test(u) || /^downloads\/[\w.\-]+$/.test(u); }
  function safeName(name) { return name.replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(0, 80); }

  $('save').addEventListener('click', function () {
    if (busy) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i], label = (it.title || DEFAULT_TITLE[it.platform]) + ' (' + (i + 1) + ')';
      if (!validUrl(it.url)) return log('آدرس «' + label + '» باید با https:// شروع شود.', 'bad');
      if (it._file) {
        if (!EXT.test(it._file.name)) return log('پسوند فایل «' + label + '» مجاز نیست.', 'bad');
        if (it._file.size > MAX_BYTES) return log('فایل «' + label + '» بزرگ‌تر از ۷۰ مگابایت است؛ آدرس مستقیم بدهید.', 'bad');
      }
    }
    var c = readCreds(); if (!c) return;
    var branch;
    items.forEach(function (it) { if (it._new || !it.id) { it.id = ''; it.id = newId(it.platform); it._new = false; } });
    setBusy(true);
    checkRepo(c).then(function (b) {
      branch = b;
      var chain = Promise.resolve();
      items.forEach(function (it) {
        if (!it._file) return;
        chain = chain.then(function () {
          var f = it._file, name = safeName(f.name);
          log('در حال ارسال «' + name + '» (' + (f.size / 1e6).toFixed(1) + ' مگابایت)… صفحه را نبندید.');
          return f.arrayBuffer().then(function (buf) {
            var head = new Uint8Array(buf.slice(0, 2));
            if (/\.(apk|zip)$/i.test(name) && (head[0] !== 0x50 || head[1] !== 0x4b)) throw new Error('«' + name + '» ساختار ZIP/APK معتبر ندارد.');
            if (/\.exe$/i.test(name) && (head[0] !== 0x4d || head[1] !== 0x5a)) throw new Error('«' + name + '» فایل اجرایی ویندوز معتبر به نظر نمی‌رسد.');
            return crypto.subtle.digest('SHA-256', buf).then(function (h) { return { sha: hex(h), size: f.size }; });
          }).then(function (m) {
            return fileB64(f).then(function (b64) { return put(c, 'downloads/' + name, branch, b64, 'Upload ' + name); }).then(function () {
              it.url = 'downloads/' + name; it.size = m.size; it.sha256 = m.sha; it.updated = today(); it._orig = it.url; it._file = null;
              log('«' + name + '» بارگذاری شد.', 'ok');
            });
          });
        });
      });
      return chain;
    }).then(function () {
      var out = items.map(function (it) {
        var o = { id: it.id, platform: it.platform, title: it.title.trim().slice(0, 40), url: it.url, version: it.version, note: it.note.trim().slice(0, 240) };
        if (it.url && it.url === it._orig && it.size) { o.size = it.size; if (it.sha256) o.sha256 = it.sha256; }
        if (it.url) o.updated = it.url === it._orig && it.updated ? it.updated : today();
        return o;
      });
      return put(c, JSON_PATH, branch, utf8b64(JSON.stringify({ items: out }, null, 2) + '\n'), 'Update downloads list');
    }).then(function () {
      log('فهرست ذخیره شد. حدود ۱ تا ۲ دقیقه بعد (بعد از ساخت دوبارهٔ GitHub Pages) در سایت دیده می‌شود.', 'ok');
      /* the token stays in the field while this page is open, so repeated saves work;
         it is gone as soon as the page is closed or reloaded */
      items.forEach(function (it) { it._orig = it.url; }); render();
    }).catch(function (e) { log(e && e.message ? e.message : 'خطای ناشناخته.', 'bad'); })
      .then(function () { setBusy(false); });
  });
})();
