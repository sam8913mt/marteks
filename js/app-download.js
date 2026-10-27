/* Public download section. Renders one card per entry of downloads/app.json, so the list,
   links, versions and checksums always match what was saved from admin-app.html.
   If the file can't be read, the static cards already written in index.html stay as they are. */
(function () {
  'use strict';
  var D = document;
  var list = D.getElementById('mxDlList');
  if (!list || !window.fetch) return;

  var ICONS = {
    android: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9h10v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 17V9zM8 7a4 4 0 0 1 8 0M9.5 4.5 8.5 3M14.5 4.5l1-1.5M4.5 10v5M19.5 10v5"/></svg>',
    windows: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5.5 11 4.4v7H3zM12.5 4.2 21 3v8.4h-8.5zM3 12.6h8v7l-8-1.1zM12.5 12.6H21V21l-8.5-1.2z"/></svg>',
    apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3c0 1.6-1.2 3.2-3 3.4-.2-1.700 1.100-3.300 3-3.400zM19.500 16.500c-.8 1.800-1.700 3.500-3.100 3.500-1.200 0-1.600-.8-3-.8s-1.900.8-3 .8C8.200 20 6 16.200 6 12.800c0-3 1.900-4.600 3.700-4.600 1.200 0 2.200.8 3 .8.800 0 2-.9 3.400-.8 1 .1 2.300.6 3 1.800-2.500 1.400-2.100 5 .4 6.500z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-2 0-3 1.800-3 4 0 1.400-.6 2.300-1.500 3.800C6.500 12.400 6 14 6 15.500 6 18 8 21 12 21s6-3 6-5.500c0-1.500-.5-3.100-1.500-4.700C15.600 9.300 15 8.400 15 7c0-2.200-1-4-3-4zM10 8.500h.01M14 8.500h.01"/></svg>',
    web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    other: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.500 10.500 12 15l4.500-4.500M5 19h14"/></svg>'
  };
  var PLATFORMS = { android: 'android', windows: 'windows', ios: 'apple', macos: 'apple', linux: 'linux', web: 'web', other: 'other' };
  var DEFAULT_TITLE = { android: 'اندروید', windows: 'ویندوز', ios: 'آیفون و آیپد', macos: 'مک', linux: 'لینوکس', web: 'نسخهٔ وب', other: 'دانلود' };
  var KIND = { android: 'فایل APK', windows: 'نسخهٔ ویندوز' };

  function el(tag, cls, text) {
    var e = D.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (/^https:\/\/[^\s"'<>]+$/i.test(u)) return u;
    if (/^downloads\/[\w.\-]+$/.test(u)) return u;
    return '';
  }
  function steps(items) {
    var ol = el('ol');
    items.forEach(function (t) { ol.appendChild(el('li', null, t)); });
    return ol;
  }

  function card(it) {
    var platform = PLATFORMS[it.platform] ? it.platform : 'other';
    var url = safeUrl(it.url);
    var hash = typeof it.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(it.sha256) ? it.sha256.toLowerCase() : '';
    var c = el('article', 'mx-dl-card');
    c.setAttribute('data-platform', platform);

    var head = el('div', 'mx-dl-cardhead');
    var ico = el('span', 'mx-dl-ico'); ico.innerHTML = ICONS[PLATFORMS[platform]]; /* constant markup, no data inside */
    var title = typeof it.title === 'string' && it.title.trim() ? it.title.trim().slice(0, 40) : DEFAULT_TITLE[platform];
    head.appendChild(ico);
    var info = el('div', 'mx-dl-info');
    info.appendChild(el('h3', null, title));

    var parts = [];
    if (url) {
      if (KIND[platform]) parts.push(KIND[platform]);
      if (typeof it.version === 'string' && it.version.trim()) parts.push('نسخهٔ ' + it.version.trim().slice(0, 24));
      if (typeof it.size === 'number' && it.size > 0) parts.push(it.size < 1e6 ? 'کمتر از ۱ مگابایت' : 'حدود ' + (it.size / 1e6).toLocaleString('fa-IR', { maximumFractionDigits: 1 }) + ' مگابایت');
      if (typeof it.updated === 'string' && !isNaN(Date.parse(it.updated))) parts.push(new Date(it.updated).toLocaleDateString('fa-IR'));
    } else parts.push('به‌زودی منتشر می‌شود');
    info.appendChild(el('p', 'mx-dl-meta', parts.join(' · ')));
    head.appendChild(info);
    c.appendChild(head);

    if (url) {
      var a = el('a', 'mx-dl-btn');
      a.href = url;
      if (/^https:/i.test(url)) a.rel = 'noopener noreferrer'; else a.setAttribute('download', url.split('/').pop());
      a.appendChild(D.createTextNode('دانلود '));
      var arrow = el('i', null, '↓'); arrow.setAttribute('aria-hidden', 'true'); a.appendChild(arrow);
      c.appendChild(a);
    } else {
      var soon = el('span', 'mx-dl-btn is-soon', 'به‌زودی');
      soon.setAttribute('aria-disabled', 'true');
      c.appendChild(soon);
    }

    if (typeof it.note === 'string' && it.note.trim()) c.appendChild(el('p', 'mx-dl-note', it.note.trim().slice(0, 240)));

    if (url && platform === 'android') {
      var d = el('details', 'mx-dl-help'); d.appendChild(el('summary', null, 'راهنمای نصب'));
      d.appendChild(steps([
        'فایل را دانلود کنید؛ اگر مرورگر هشدار داد، گزینهٔ نگه‌داشتن فایل را بزنید.',
        'فایل را از بخش دانلودها باز کنید.',
        'اگر اندروید پرسید، نصب از همین منبع (مرورگر) را برای یک بار مجاز کنید.',
        'روی «نصب» بزنید و برنامه را باز کنید.'
      ]));
      c.appendChild(d);
    } else if (url && platform === 'windows') {
      c.appendChild(el('p', 'mx-dl-note', 'اگر ویندوز هشدار SmartScreen نشان داد، روی «More info» و بعد «Run anyway» بزنید.'));
    }
    if (url && hash) {
      var h = el('details', 'mx-dl-help'); h.appendChild(el('summary', null, 'کد SHA-256 فایل'));
      var p = el('p', 'mx-dl-hash'); var b = el('bdi', null, hash); b.setAttribute('dir', 'ltr'); p.appendChild(b); h.appendChild(p);
      c.appendChild(h);
    }
    return c;
  }

  fetch('downloads/app.json', { cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || typeof d !== 'object') return;
      var items = Array.isArray(d.items) ? d.items : null;
      /* older single-file format */
      if (!items && (d.url || d.file)) {
        d.platform = 'android';
        if (!d.url && d.file) d.url = 'downloads/' + d.file;
        items = [d];
      }
      if (!items || !items.length) return;
      var frag = D.createDocumentFragment();
      items.slice(0, 12).forEach(function (it) { if (it && typeof it === 'object') frag.appendChild(card(it)); });
      if (!frag.childNodes.length) return;
      list.textContent = '';
      list.appendChild(frag);
    })
    .catch(function () { /* keep the static cards */ });
})();
