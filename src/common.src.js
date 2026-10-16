/* کد مشترک سایت و پنل: build.py آن را به‌جای «//@include common» در app.js و admin.js می‌گذارد */
var D = document, W = window;
function $(id) { return D.getElementById(id); }
function qa(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }

var CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
var KEY = CFG.supabaseKey || '';
var BUCKET = 'projects';

var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
/* ارقام فارسی/عربی → انگلیسی */
function enDigits(v) {
  return String(v == null ? '' : v)
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}

/* درخواست به Supabase. o: { json | raw+type, token, prefer, timeout, cache, keepalive } */
function sbFetch(method, path, o) {
  o = o || {};
  var h = { apikey: KEY }, body;
  if (o.token) h.Authorization = 'Bearer ' + o.token;
  if (o.raw !== undefined) { body = o.raw; h['Content-Type'] = o.type; }
  else if (o.json !== undefined) { body = JSON.stringify(o.json); h['Content-Type'] = 'application/json'; }
  if (o.prefer) h.Prefer = o.prefer;
  var ctl = W.AbortController ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 15000) : null;
  return fetch(API + path, {
    method: method, headers: h, body: body,
    keepalive: !!o.keepalive && method !== 'GET',
    cache: o.cache || 'no-store',
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (timer) clearTimeout(timer);
    return r.text().then(function (t) {
      var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
      return { ok: r.ok, status: r.status, data: d };
    });
  }, function (err) { if (timer) clearTimeout(timer); throw err; });
}
function errText(res) {
  var d = res.data;
  return (d && typeof d === 'object' && (d.message || d.msg || d.error_description || d.error)) || ('خطای سرور (' + res.status + ')');
}

/* عکس‌های پروژه */
function publicUrl(key) { return API + '/storage/v1/object/public/' + BUCKET + '/' + String(key).split('/').map(encodeURIComponent).join('/'); }
function thumbKey(key) { return /\.webp$/.test(key) ? key.slice(0, -5) + '-t.webp' : key; }
/* اگر نسخهٔ کوچک (thumb) نبود، همان عکس اصلی نشان داده شود */
function thumbFallback(root) {
  qa('img[data-full]', root).forEach(function (img) {
    img.addEventListener('error', function () { var f = img.getAttribute('data-full'); if (f && img.src !== f) img.src = f; });
  });
}
function mapProject(p) {
  var im = (p.project_images || []).slice().sort(function (a, b) { return a.pos - b.pos; });
  return { id: p.id, name: p.name, description: p.description || '', url: p.url || '', createdAt: p.created_at, keys: im.map(function (x) { return x.key; }) };
}
/* ستون‌های جدید (توضیح/لینک/نظرات) ممکن است هنوز در دیتابیس نباشند؛ فهرست ستون‌ها یکی‌یکی از کامل به ساده امتحان می‌شود */
function fetchProjectRows(variants, limit, o) {
  o = o || {};
  return (function next(i) {
    return sbFetch('GET', '/rest/v1/projects?order=created_at.desc&limit=' + limit + '&select=' + variants[i] + ',project_images(key,pos)', o).then(function (res) {
      return (res.ok && Array.isArray(res.data)) || i + 1 >= variants.length ? res : next(i + 1);
    });
  })(0);
}
