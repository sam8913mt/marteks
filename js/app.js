(function () {
'use strict';
var D = document, W = window;
D.documentElement.classList.add('js');
function $(id) { return D.getElementById(id); }
function qa(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
var CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
var KEY = CFG.supabaseKey || '';
var BUCKET = 'projects';
var NUMLOC = String(D.documentElement.lang || 'fa').toLowerCase().indexOf('en') === 0 ? 'en-US' : 'fa-IR';
var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
function enDigits(v) {
return String(v == null ? '' : v)
.replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
.replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
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
function publicUrl(key) { return API + '/storage/v1/object/public/' + BUCKET + '/' + String(key).split('/').map(encodeURIComponent).join('/'); }
function thumbKey(key) { return /\.webp$/.test(key) ? key.slice(0, -5) + '-t.webp' : key; }
function thumbFallback(root) {
qa('img[data-full]', root).forEach(function (img) {
img.addEventListener('error', function () {
var f = img.getAttribute('data-full');
if (f && !img.getAttribute('data-fb') && img.getAttribute('src') !== f) { img.setAttribute('data-fb', '1'); img.src = f; return; }
if (img.parentNode && img.parentNode.classList) img.parentNode.classList.add('is-broken');
});
});
}
function mapProject(p) {
var im = (p.project_images || []).slice().sort(function (a, b) { return a.pos - b.pos; });
return { id: p.id, name: p.name, description: p.description || '', url: p.url || '', createdAt: p.created_at, keys: im.map(function (x) { return x.key; }) };
}
function fetchProjectRows(variants, limit, o) {
o = o || {};
return (function next(i) {
return sbFetch('GET', '/rest/v1/projects?order=created_at.desc&limit=' + limit + '&select=' + variants[i] + ',project_images(key,pos)', o).then(function (res) {
return (res.ok && Array.isArray(res.data)) || i + 1 >= variants.length ? res : next(i + 1);
});
})(0);
}
var reduced = false, canHover = false;
try { reduced = W.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) {}
try { canHover = W.matchMedia('(hover:hover) and (pointer:fine)').matches; } catch (e) {}
try {
['merteks_orders_v1', 'merteks_chats_v1', 'merteks_agent_v1', 'merteks_admin_session_v2', 'merteks_admin_token_v2'].forEach(function (k) {
localStorage.removeItem(k); sessionStorage.removeItem(k);
});
} catch (e) {}
function normalizeDigits(v) { return enDigits(v).replace(/[\s\-()]/g, ''); }
function validPhone(v) { return /^09\d{9}$/.test(normalizeDigits(v)); }
var toastEl, toastTimer;
function toast(msg) {
if (!toastEl) {
toastEl = D.createElement('div');
toastEl.className = 'merteks-toast';
toastEl.id = 'merteksOrderToast';
toastEl.setAttribute('role', 'status');
toastEl.setAttribute('aria-live', 'polite');
D.body.appendChild(toastEl);
}
toastEl.textContent = msg;
toastEl.classList.add('show');
clearTimeout(toastTimer);
toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2400);
}
function sbRpc(name, args, keepalive) {
return sbFetch('POST', '/rest/v1/rpc/' + name, { json: args, keepalive: keepalive }).then(function (res) {
var d = res.data, out = { success: false, status: res.status, error: '' };
if (res.ok && d && typeof d === 'object' && d.ok === true) { out.success = true; out.id = d.id; return out; }
if (res.ok && d && typeof d === 'object' && d.ok === false) {
out.status = d.code === 'rate_limited' ? 429 : 400; out.error = d.error || ''; return out;
}
out.error = errText(res); return out;
});
}
var OUTBOX_KEY = 'merteks_outbox_v2', outboxBusy = false;
function outboxGet() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { return []; } }
function outboxSet(list) {
try { list.length ? localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-100))) : localStorage.removeItem(OUTBOX_KEY); } catch (e) {}
}
function outboxAdd(item) { var l = outboxGet(); l.push(item); outboxSet(l); }
function flushOutbox() {
if (outboxBusy || !API) return;
var list = outboxGet();
if (!list.length) return;
outboxBusy = true;
(function next(i, keep) {
if (i >= list.length) { outboxSet(keep); outboxBusy = false; return; }
var it = list[i];
sbRpc(it.rpc, it.args, true).then(function (j) {
var permanent = !j.success && j.status >= 400 && j.status < 500 && j.status !== 429;
if (!j.success && !permanent) keep.push(it);
next(i + 1, keep);
}, function () { outboxSet(keep.concat(list.slice(i))); outboxBusy = false; });
})(0, []);
}
W.addEventListener('online', flushOutbox);
if (outboxGet().length) setTimeout(flushOutbox, 2500);
function cloudPost(data) {
if (!API || !KEY) return Promise.resolve({ success: false, error: 'no api', status: 0 });
var rpc, args;
if (data.action === 'create') {
rpc = 'create_order';
args = { p_id: data.id, p_name: data.name, p_phone: data.phone, p_service: data.service || '', p_budget: data.budget || '', p_description: data.description || '', p_website: data.website || '' };
} else if (data.action === 'chatStart') {
rpc = 'chat_start';
args = { p_id: data.id, p_name: data.name, p_phone: data.phone };
} else if (data.action === 'chatMessage') {
rpc = 'chat_message';
args = {
p_chat_id: data.chatId, p_name: data.name, p_phone: data.phone, p_device: data.device || '',
p_question: data.question || '', p_answer: data.answer || '',
p_mid: 'M-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
};
} else return Promise.resolve({ success: false, error: 'unknown action', status: 0 });
return sbRpc(rpc, args, true).then(function (j) {
if (!j.success && (j.status >= 500 || j.status === 429)) outboxAdd({ rpc: rpc, args: args });
return j;
}, function () { outboxAdd({ rpc: rpc, args: args }); return { success: false, error: 'network', status: 0 }; });
}
var lastFocus = {};
function lockPage(on) {
D.body.classList.toggle('mx-modal-open', on);
D.body.style.overflow = on ? 'hidden' : '';
}
function openOverlay(id, lock) {
var el = $(id);
if (!el) return;
lastFocus[id] = D.activeElement;
el.classList.add('open');
el.setAttribute('aria-hidden', 'false');
if (lock) lockPage(true);
if (id === 'merteksOrderModal') {
D.body.classList.add('merteks-order-page-active');
D.documentElement.style.overflow = 'hidden';
try { history.pushState({ merteksOrder: true }, '', location.href.split('#')[0] + '#order'); } catch (e) {}
}
}
function closeOverlay(id, lock) {
var el = $(id);
if (el) { el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); }
if (lock) lockPage(false);
var back = lastFocus[id]; lastFocus[id] = null;
if (back && back.focus && D.body.contains(back)) { try { back.focus({ preventScroll: true }); } catch (e) {} }
if (id === 'merteksOrderModal') {
D.body.classList.remove('merteks-order-page-active');
D.documentElement.style.overflow = '';
try { if (location.hash === '#order') history.replaceState(null, '', location.href.split('#')[0]); } catch (e) {}
}
}
W.MX = { esc: esc, toast: toast, normalizeDigits: normalizeDigits, validPhone: validPhone,
cloudPost: cloudPost, open: openOverlay, close: closeOverlay };
D.documentElement.classList.add('mx-css-background');
var fonts = $('mxFonts');
if (fonts) fonts.media = 'all';
(function () {
var h = D.querySelector('.hero-title');
if (h && !reduced) {
var txt = h.textContent.trim().replace(/\s+/g, ' ');
h.setAttribute('aria-label', txt);
h.classList.add('is-split');
h.innerHTML = txt.split(' ').map(function (w, i) { return '<span class="w" aria-hidden="true" style="--i:' + i + '"><span>' + esc(w) + '</span></span>'; }).join(' ');
}
var facts = qa('.fact b');
if (facts.length && 'IntersectionObserver' in W && !reduced) {
var fio = new IntersectionObserver(function (en) {
en.forEach(function (e) {
if (!e.isIntersecting) return;
fio.unobserve(e.target);
var b = e.target, final = b.getAttribute('data-to') || '';
if (!/^\d+$/.test(final)) return;
var to = +final, t0 = performance.now(), dur = 1100;
(function step(t) {
var k = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
b.textContent = v.toLocaleString(NUMLOC);
if (k < 1) requestAnimationFrame(step);
})(t0);
});
}, { threshold: .6 });
facts.forEach(function (b) { var v = enDigits(b.textContent.trim()); if (/^\d+$/.test(v)) { b.setAttribute('data-to', v); b.textContent = (0).toLocaleString(NUMLOC); fio.observe(b); } });
}
var plate = D.querySelector('.plate');
if (plate && canHover && !reduced) {
plate.classList.add('tilt');
var hero = D.getElementById('home');
hero.addEventListener('pointermove', function (e) {
var r = plate.getBoundingClientRect();
var x = (e.clientX - (r.left + r.width / 2)) / W.innerWidth, y = (e.clientY - (r.top + r.height / 2)) / W.innerHeight;
plate.style.setProperty('--ry', (x * 18).toFixed(2) + 'deg');
plate.style.setProperty('--rx', (-y * 18).toFixed(2) + 'deg');
});
hero.addEventListener('pointerleave', function () { plate.style.setProperty('--rx', '0deg'); plate.style.setProperty('--ry', '0deg'); });
}
})();
var links = $('links'), menuBtn = $('menuBtn');
function closeMenu() {
if (!links) return;
links.classList.remove('open');
if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
}
if (links && menuBtn) {
menuBtn.addEventListener('click', function (e) {
e.stopPropagation();
var o = links.classList.toggle('open');
menuBtn.setAttribute('aria-expanded', String(o));
});
links.addEventListener('click', function (e) { if (e.target.closest('a')) closeMenu(); });
D.addEventListener('click', function (e) {
if (links.classList.contains('open') && !links.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
});
qa('a', links).slice(0, 8).forEach(function (a) { a.classList.add('mx-sticker-link', 'mx-final-menu-item'); });
}
(function () {
var bar = $('mxScrollBar'), nav = D.querySelector('.nav'), top = $('backTop');
var ticking = false;
function update() {
ticking = false;
var y = W.pageYOffset || D.documentElement.scrollTop || 0;
var max = D.documentElement.scrollHeight - W.innerHeight;
if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ')';
if (nav) nav.classList.toggle('scrolled', y > 18);
if (top) top.classList.toggle('show', y > 560);
}
W.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
W.addEventListener('resize', update, { passive: true });
update();
if (top) top.addEventListener('click', function () { W.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); });
})();
(function () {
var items = qa('.reveal');
if (!('IntersectionObserver' in W)) { items.forEach(function (el) { el.classList.add('show'); }); return; }
var io = new IntersectionObserver(function (entries) {
entries.forEach(function (e) {
if (e.isIntersecting) { e.target.classList.add('show', 'mx-in'); io.unobserve(e.target); }
});
}, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
items.forEach(function (el) { io.observe(el); });
})();
if ('IntersectionObserver' in W && !reduced) {
var pauser = new IntersectionObserver(function (entries) {
entries.forEach(function (e) { e.target.classList.toggle('mx-paused', !e.isIntersecting); });
}, { rootMargin: '120px 0px' });
qa('main > section, footer').forEach(function (el) { pauser.observe(el); });
}
D.addEventListener('click', function (e) {
var a = e.target.closest && e.target.closest('a[href^="#"]');
if (!a) return;
var id = a.getAttribute('href');
if (!id || id === '#' || id === '#order') return;
try { history.replaceState(null, '', id); } catch (err) {}
});
var orderBuilt = false;
function buildOrder() {
if (orderBuilt) return;
orderBuilt = true;
D.body.insertAdjacentHTML('beforeend',
'<div class="merteks-overlay" id="merteksOrderModal" aria-hidden="true">' +
'<div class="merteks-panel" role="dialog" aria-modal="true" aria-labelledby="merteksOrderTitle">' +
'<div class="merteks-order-page-inner">' +
'<div class="merteks-panel-head"><div>' +
'<h3 id="merteksOrderTitle">شروع پروژه</h3>' +
'<p>چند مورد ساده را وارد کنید تا درخواستتان برای تیم مرتکس ارسال شود.</p></div>' +
'<button class="merteks-close" type="button" data-close-order aria-label="بازگشت به سایت">×</button></div>' +
'<form class="merteks-form" id="merteksOrderForm" novalidate>' +
'<div class="merteks-grid">' +
'<div class="merteks-field"><label for="moName">نام و نام خانوادگی *</label><input id="moName" name="name" required maxlength="80" autocomplete="name"></div>' +
'<div class="merteks-field"><label for="moPhone">شماره تماس *</label><input id="moPhone" name="phone" required maxlength="11" inputmode="numeric" placeholder="09xxxxxxxxx" autocomplete="tel"></div>' +
'</div>' +
'<div class="merteks-grid">' +
'<div class="merteks-field"><label for="moService">نوع پروژه *</label>' +
'<select id="moService" name="service" required><option value="">انتخاب کنید</option><option>طراحی وب‌سایت</option><option>توسعه فرانت‌اند</option><option>بازطراحی و بهبود سایت</option><option>سازگاری با موبایل</option><option>تولید محتوا</option><option>ساخت و تدوین ویدیو</option><option value="__custom__">چیز دیگر / اختصاصی</option></select>' +
'<input id="moCustomService" name="customService" maxlength="120" placeholder="نوع پروژه را بنویسید" style="display:none;margin-top:8px"></div>' +
'<div class="merteks-field"><label for="moBudget">بودجهٔ تقریبی (اختیاری)</label><select id="moBudget" name="budget"><option value="">فعلاً مشخص نیست</option><option>تا ۵ میلیون تومان</option><option>۵ تا ۲۰ میلیون تومان</option><option>۲۰ تا ۵۰ میلیون تومان</option><option>بیش از ۵۰ میلیون تومان</option></select></div>' +
'</div>' +
'<div class="merteks-grid">' +
'<div class="merteks-field"><label for="moSite">آدرس سایت فعلی (اختیاری)</label><input id="moSite" name="currentSite" maxlength="200" inputmode="url" dir="ltr" placeholder="https://"></div>' +
'<div class="merteks-field"><label for="moDeadline">مهلت موردنظر (اختیاری)</label><input id="moDeadline" name="deadline" maxlength="80" placeholder="مثلاً تا پایان ماه"></div>' +
'</div>' +
'<div class="merteks-field"><label for="moDescription">توضیحات پروژه *</label><textarea id="moDescription" name="description" required maxlength="2000" placeholder="چه چیزی نیاز دارید؟ هدف سایت، مخاطب، نمونه‌های موردعلاقه…"></textarea></div>' +
'<div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
'<div class="merteks-actions"><button class="merteks-btn primary" type="submit" id="moSubmit">ثبت درخواست</button><button class="merteks-btn" type="button" data-close-order>انصراف</button></div>' +
'<p class="merteks-note">شمارهٔ شما فقط برای پاسخ به همین درخواست استفاده می‌شود. بعد از ثبت، یک کد پیگیری نشان داده می‌شود.</p>' +
'</form>' +
'</div>' +
'</div>' +
'</div>' +
'<div id="merteksOrderSuccess" aria-live="polite"><div class="merteks-success-card" role="dialog" aria-modal="true" aria-labelledby="merteksSuccessTitle"><div class="merteks-success-icon" aria-hidden="true">✓</div>' +
'<h3 id="merteksSuccessTitle">درخواست شما ثبت شد</h3><p id="merteksSuccessText">با شما تماس می‌گیریم. اگر زودتر نیاز شد، هنگام پیام دادن این کد را بگویید:</p>' +
'<p><b id="merteksOrderCode" dir="ltr" style="font-size:18px;letter-spacing:1px;user-select:all"></b></p>' +
'<div class="merteks-actions" style="justify-content:center"><a class="merteks-btn" href="https://t.me/merteks_m" target="_blank" rel="noopener noreferrer">پیام در تلگرام</a><button class="merteks-btn primary" type="button" id="merteksSuccessClose">بستن</button></div>' +
'</div></div>');
var modal = $('merteksOrderModal');
qa('[data-close-order]', modal).forEach(function (b) { b.addEventListener('click', function () { closeOverlay('merteksOrderModal'); }); });
modal.addEventListener('click', function (e) { if (e.target === modal) closeOverlay('merteksOrderModal'); });
var service = $('moService'), custom = $('moCustomService');
service.addEventListener('change', function () {
var c = service.value === '__custom__';
custom.style.display = c ? 'block' : 'none';
custom.required = c;
if (!c) custom.value = '';
});
var submitting = false;
$('merteksOrderForm').addEventListener('submit', function (e) {
e.preventDefault();
if (submitting) return;
var form = e.target, fd = new FormData(form);
var svc = String(fd.get('service') || '').trim();
var order = {
action: 'create',
id: 'MTX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(),
name: String(fd.get('name') || '').trim(),
phone: normalizeDigits(String(fd.get('phone') || '').trim()),
service: svc === '__custom__' ? String(fd.get('customService') || '').trim() : svc,
budget: String(fd.get('budget') || ''),
description: (function () {
var d = String(fd.get('description') || '').trim(), site = String(fd.get('currentSite') || '').trim(), dl = String(fd.get('deadline') || '').trim();
return d + (site ? '\n\nسایت فعلی: ' + site : '') + (dl ? '\nمهلت موردنظر: ' + dl : '');
})(),
website: String(fd.get('website') || '')
};
if (!order.name || !order.phone || !order.service || !order.description) { toast('لطفاً فیلدهای ستاره‌دار را کامل کنید'); return; }
if (!validPhone(order.phone)) { toast('شمارهٔ تماس باید ۱۱ رقم و با ۰۹ شروع شود'); return; }
var btn = $('moSubmit');
submitting = true; btn.disabled = true; btn.textContent = 'در حال ارسال…';
cloudPost(order).then(function (j) {
submitting = false; btn.disabled = false; btn.textContent = 'ثبت درخواست';
if (!j.success && j.status >= 400 && j.status < 500 && j.status !== 429) {
toast('ثبت درخواست انجام نشد: ' + (j.error || 'خطا') + ' — می‌توانید در تلگرام پیام بدهید.'); return;
}
form.reset();
custom.style.display = 'none'; custom.required = false;
closeOverlay('merteksOrderModal');
showSuccess(j.id || order.id, !j.success);
});
});
}
function showSuccess(code, queued) {
var box = $('merteksOrderSuccess'), btn = $('merteksSuccessClose');
$('merteksOrderCode').textContent = code || '';
$('merteksSuccessTitle').textContent = queued ? 'درخواست در صف ارسال است' : 'درخواست شما ثبت شد';
$('merteksSuccessText').textContent = queued
? 'اینترنت وصل نبود. این صفحه را باز نگه دارید تا خودکار ارسال شود؛ یا همین حالا در تلگرام پیام بدهید و این کد را بگویید:'
: 'با شما تماس می‌گیریم. اگر زودتر نیاز شد، هنگام پیام دادن این کد را بگویید:';
box.classList.add('open');
function done() {
box.classList.remove('open');
try { history.replaceState(null, '', location.href.split('#')[0]); } catch (err) {}
W.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
}
btn.onclick = done;
box.onkeydown = function (e) { if (e.key === 'Escape') done(); };
setTimeout(function () { try { btn.focus(); } catch (e) {} }, 60);
}
function openOrder() {
buildOrder();
closeMenu();
openOverlay('merteksOrderModal');
setTimeout(function () { var f = $('moName'); if (f) f.focus(); }, 120);
}
var cartBtn = $('merteksOrderOpen');
if (cartBtn) cartBtn.addEventListener('click', openOrder);
qa('[data-open-order]').forEach(function (a) { a.addEventListener('click', function (e) { e.preventDefault(); openOrder(); }); });
W.addEventListener('popstate', function () {
var m = $('merteksOrderModal');
if (m && m.classList.contains('open') && location.hash !== '#order') closeOverlay('merteksOrderModal');
});
if (location.hash === '#order') openOrder();
var aiFab = $('mxAiFab'), CHAT_PAGE = 'chat.html';
if (aiFab) {
aiFab.addEventListener('click', function () { W.location.href = CHAT_PAGE; });
}
(function () {
if (!aiFab) return;
var shown = false;
try { shown = sessionStorage.getItem('mxHello') === '1'; } catch (e) {}
if (shown) return;
var hello = D.createElement('div');
hello.className = 'mx-hello';
hello.setAttribute('role', 'status');
hello.innerHTML =
'<button class="mx-hello-body" type="button" aria-label="باز کردن پرسش‌وپاسخ سریع">' +
'<span class="mx-hello-name">پرسش‌وپاسخ سریع</span>' +
'<span class="mx-hello-text">سؤالی دربارهٔ خدمات، هزینه یا زمان تحویل دارید؟ همین‌جا بپرسید.</span>' +
'</button>' +
'<button class="mx-hello-close" type="button" aria-label="بستن پیام">×</button>';
function hide(remember) {
if (remember) { try { sessionStorage.setItem('mxHello', '1'); } catch (e) {} }
hello.classList.remove('show');
setTimeout(function () { if (hello.parentNode) hello.parentNode.removeChild(hello); }, 350);
}
hello.querySelector('.mx-hello-close').addEventListener('click', function () { hide(true); });
hello.querySelector('.mx-hello-body').addEventListener('click', function () {
hide(true);
W.location.href = CHAT_PAGE;
});
aiFab.addEventListener('click', function () { hide(true); });
var tries = 0;
function showHello() {
if (hello.parentNode) return;
if (D.body.classList.contains('mx-modal-open') || D.documentElement.classList.contains('intro-active')) {
if (++tries < 8) setTimeout(showHello, 1500);
return;
}
D.body.appendChild(hello);
void hello.offsetWidth;
hello.classList.add('show');
try { sessionStorage.setItem('mxHello', '1'); } catch (e) {}
setTimeout(function () { if (hello.parentNode) hide(false); }, 10000);
}
setTimeout(showHello, 1200);
})();
var grid = $('mxProjectsGrid'), emptyBox = $('mxProjectsEmpty'), projects = null, galleryEl = null;
var CACHE_KEY = 'mx_projects_v4', CACHE_MS = 5 * 60 * 1000;
function fetchProjects() {
if (projects) return Promise.resolve(projects);
try {
var c = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null');
if (c && Date.now() - c.t < CACHE_MS && c.rows && c.rows.length) { projects = c.rows; return Promise.resolve(projects); }
} catch (e) {}
if (!API || !KEY) return Promise.reject(new Error('no api'));
return fetchProjectRows(['id,name,description,url,created_at,project_comments(count)', 'id,name,description,url,created_at', 'id,name,created_at'], 100, { cache: 'default' }).then(function (res) {
if (!res.ok || !Array.isArray(res.data)) throw new Error('bad');
projects = res.data.map(function (p) {
var pr = mapProject(p);
pr.comments = p.project_comments && p.project_comments[0] ? Number(p.project_comments[0].count) || 0 : 0;
return pr;
}).filter(function (p) { return p.keys.length; });
saveProjectsCache();
return projects;
});
}
function saveProjectsCache() {
if (!projects || !projects.length) return;
try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), rows: projects })); } catch (e) {}
}
function safeUrl(u) {
try { var x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; }
}
var errBox = $('mxProjectsError'), moreBox = $('mxProjectsMore'), PAGE = 9, shown = 0, listAll = [];
function cardHtml(p, i) {
var cover = p.keys[0], name = esc(p.name), url = safeUrl(p.url);
return '<article class="mx-project-card">' +
'<button class="mx-project-media" type="button" data-i="' + i + '" aria-label="مشاهده عکس‌های «' + name + '»">' +
'<img class="mx-project-cover" src="' + esc(publicUrl(thumbKey(cover))) + '" data-full="' + esc(publicUrl(cover)) + '" alt="نمونه‌کار ' + name + '" width="640" height="400" loading="lazy" decoding="async">' +
'<span class="mx-project-badge">' + p.keys.length.toLocaleString('fa-IR') + ' عکس</span></button>' +
'<div class="mx-project-info"><h3 class="mx-project-name">' + name + '</h3>' +
(p.description ? '<p class="mx-project-desc">' + esc(p.description) + '</p>' : '') +
(url ? '<a class="mx-project-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">مشاهدهٔ سایت ↗</a>' : '') +
'<div class="mx-project-actions">' +
'<button class="btn btn-ghost mx-project-view" type="button" data-i="' + i + '">مشاهده عکس‌ها</button>' +
'<button class="btn btn-ghost mx-project-comments" type="button" data-c="' + i + '">نظرات <span class="mx-ccount">' + (p.comments ? '(' + p.comments + ')' : '') + '</span></button>' +
'</div></div></article>';
}
function showMoreProjects() {
var next = Math.min(listAll.length, shown + PAGE), tmp = D.createElement('div'), html = '';
for (var i = shown; i < next; i++) html += cardHtml(listAll[i], i);
tmp.innerHTML = html;
thumbFallback(tmp);
while (tmp.firstChild) grid.appendChild(tmp.firstChild);
shown = next;
moreBox.hidden = shown >= listAll.length;
}
function renderProjects() {
errBox.hidden = true; emptyBox.hidden = true; moreBox.hidden = true;
grid.setAttribute('aria-busy', 'true');
grid.innerHTML = '<div class="mx-project-skel"></div><div class="mx-project-skel"></div><div class="mx-project-skel"></div>';
fetchProjects().then(function (list) {
grid.removeAttribute('aria-busy'); grid.innerHTML = '';
listAll = list; shown = 0;
emptyBox.hidden = !!list.length;
showMoreProjects();
}).catch(function () {
grid.removeAttribute('aria-busy'); grid.innerHTML = '';
listAll = []; shown = 0; moreBox.hidden = true; errBox.hidden = false;
});
}
function onSwipe(el, cb) {
var sx = 0, sy = 0;
el.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
el.addEventListener('touchend', function (e) {
if (!sx) return;
var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy; sx = 0;
if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) cb(dx > 0 ? 1 : -1);
}, { passive: true });
}
var SVG_A = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="', SVG_B = '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var CHEV_R = SVG_A + 'M9 5l7 7-7 7' + SVG_B, CHEV_L = SVG_A + 'M15 5l-7 7 7 7' + SVG_B;
var gal = { imgs: [], i: 0, busy: false, moved: false, n: null, c: null, p: null };
function buildGallery() {
if (galleryEl) return;
galleryEl = D.createElement('div');
galleryEl.className = 'mx-gallery-modal';
galleryEl.id = 'mxGalleryModal';
galleryEl.setAttribute('aria-hidden', 'true');
galleryEl.innerHTML =
'<div class="mx-gallery-shell" role="dialog" aria-modal="true" aria-labelledby="mxGalleryTitle">' +
'<div class="mx-gallery-top"><div class="mx-gallery-title" id="mxGalleryTitle"></div>' +
'<div class="mx-gallery-tools"><span class="mx-gallery-counter" id="mxGalleryCounter" aria-live="polite"></span>' +
'<button class="mx-gallery-close" id="mxGalleryClose" type="button" aria-label="بستن">×</button></div></div>' +
'<div class="mx-gallery-stage" id="mxGalleryStage">' +
'<button class="mx-gallery-nav mx-gallery-prev" id="mxGalleryPrev" type="button" aria-label="عکس قبلی">' + CHEV_R + '</button>' +
'<div class="mx-gallery-track" id="mxGalleryTrack">' +
'<img class="mx-gallery-image" alt="" decoding="async" draggable="false">' +
'<img class="mx-gallery-image" alt="" decoding="async" draggable="false">' +
'<img class="mx-gallery-image" alt="" decoding="async" draggable="false">' +
'</div>' +
'<button class="mx-gallery-nav mx-gallery-next" id="mxGalleryNext" type="button" aria-label="عکس بعدی">' + CHEV_L + '</button>' +
'</div><div class="mx-gallery-dots" id="mxGalleryDots"></div></div>';
D.body.appendChild(galleryEl);
var im = qa('.mx-gallery-image', galleryEl);
gal.n = im[0]; gal.c = im[1]; gal.p = im[2];
$('mxGalleryClose').addEventListener('click', closeGallery);
$('mxGalleryPrev').addEventListener('click', function () { moveGallery(-1); });
$('mxGalleryNext').addEventListener('click', function () { moveGallery(1); });
var stageEl = $('mxGalleryStage');
im.forEach(function (el) {
el.addEventListener('load', function () { if (el === gal.c) stageEl.classList.remove('loading', 'failed'); });
el.addEventListener('error', function () { if (el === gal.c && el.getAttribute('src')) { stageEl.classList.remove('loading'); stageEl.classList.add('failed'); } });
});
galleryEl.addEventListener('click', function (e) {
if (gal.moved) { gal.moved = false; return; }
if (e.target.closest('.mx-gallery-nav,.mx-gallery-close,.mx-gallery-dot')) return;
if (outsideImage(e.clientX, e.clientY)) closeGallery();
});
$('mxGalleryDots').addEventListener('click', function (e) {
var b = e.target.closest('[data-d]');
if (b && !gal.busy) { gal.i = +b.getAttribute('data-d'); paintGallery(); }
});
dragGallery($('mxGalleryStage'), $('mxGalleryTrack'));
}
function outsideImage(x, y) {
var im = gal.c;
if (!im || !im.naturalWidth) return true;
var r = im.getBoundingClientRect(), cs = W.getComputedStyle(im);
var pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0, pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
var bw = r.width - pl - pr, bh = r.height - pt - pb;
if (bw <= 0 || bh <= 0) return true;
var s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s;
var left = r.left + pl + (bw - w) / 2, top = r.top + pt + (bh - h) / 2;
return x < left || x > left + w || y < top || y > top + h;
}
function galAt(k) { var n = gal.imgs.length; return gal.imgs[((k % n) + n) % n]; }
function setSrc(el, u) { if (el.getAttribute('src') !== u) { if (u) el.src = u; else el.removeAttribute('src'); } }
function paintGallery() {
var n = gal.imgs.length;
if (!n) return;
var track = $('mxGalleryTrack');
track.classList.remove('anim'); track.style.transform = '';
gal.n.className = 'mx-gallery-image mx-gallery-side-next';
gal.c.className = 'mx-gallery-image';
gal.p.className = 'mx-gallery-image mx-gallery-side-prev';
gal.c.alt = ($('mxGalleryTitle').textContent || 'پروژه') + ' — عکس ' + (gal.i + 1);
setSrc(gal.c, galAt(gal.i));
var stg = $('mxGalleryStage'), cs = gal.c.getAttribute('src');
stg.classList.remove('loading', 'failed');
if (cs && !(gal.c.complete && gal.c.naturalWidth)) stg.classList.add(gal.c.complete ? 'failed' : 'loading');
setSrc(gal.n, n > 1 ? galAt(gal.i + 1) : '');
setSrc(gal.p, n > 1 ? galAt(gal.i - 1) : '');
$('mxGalleryCounter').textContent = (gal.i + 1) + ' / ' + n;
$('mxGalleryDots').innerHTML = gal.imgs.map(function (_, i) {
return '<button class="mx-gallery-dot' + (i === gal.i ? ' active' : '') + '" type="button" data-d="' + i + '" aria-label="عکس ' + (i + 1) + '"></button>';
}).join('');
galleryEl.classList.toggle('single', n < 2);
var act = galleryEl.querySelector('.mx-gallery-dot.active');
if (act && act.scrollIntoView) { try { act.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (err) {} }
}
function openGallery(p) {
if (!p || !p.keys || !p.keys.length) return;
buildGallery();
gal.imgs = (p.keys || []).map(publicUrl); gal.i = 0; gal.busy = false;
$('mxGalleryTitle').textContent = p.name || 'پروژه';
openOverlay('mxGalleryModal', true);
paintGallery();
setTimeout(function () { var c = $('mxGalleryClose'); if (c) c.focus(); }, 60);
}
function closeGallery() {
closeOverlay('mxGalleryModal', true);
}
function moveGallery(d) {
var n = gal.imgs.length;
if (n < 2 || gal.busy) return;
gal.busy = true;
var track = $('mxGalleryTrack'), w = $('mxGalleryStage').clientWidth, fin = false, tm;
function done() {
if (fin) return; fin = true;
track.removeEventListener('transitionend', onEnd); clearTimeout(tm);
var o = { n: gal.n, c: gal.c, p: gal.p };
if (d > 0) { gal.c = o.n; gal.p = o.c; gal.n = o.p; } else { gal.c = o.p; gal.n = o.c; gal.p = o.n; }
gal.i = (gal.i + d + n) % n; gal.busy = false; paintGallery();
}
function onEnd(e) { if (e.target === track) done(); }
if (reduced) { done(); return; }
tm = setTimeout(done, 340);
track.addEventListener('transitionend', onEnd);
track.classList.remove('dragging'); track.classList.add('anim');
track.style.transform = 'translate3d(' + (d > 0 ? w : -w) + 'px,0,0)';
}
function dragGallery(stage, track) {
var id = null, sx = 0, sy = 0, st = 0, dx = 0, drag = false;
stage.addEventListener('pointerdown', function (e) {
if (gal.busy || gal.imgs.length < 2 || id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
if (e.target.closest('.mx-gallery-nav')) return;
id = e.pointerId; sx = e.clientX; sy = e.clientY; st = Date.now(); dx = 0; drag = false;
});
stage.addEventListener('pointermove', function (e) {
if (e.pointerId !== id) return;
var mx = e.clientX - sx, my = e.clientY - sy;
if (!drag) {
if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
if (Math.abs(my) > Math.abs(mx)) { id = null; return; }
drag = true; gal.moved = true; track.classList.remove('anim'); track.classList.add('dragging');
try { stage.setPointerCapture(id); } catch (err) {}
}
dx = mx;
track.style.transform = 'translate3d(' + dx + 'px,0,0)';
});
function end(e) {
if (e.pointerId !== id) return;
var w = stage.clientWidth || 1, d = dx, was = drag;
var fast = Math.abs(d) / Math.max(1, Date.now() - st) > 0.45 && Math.abs(d) > 30;
id = null; drag = false; track.classList.remove('dragging');
if (!was) return;
setTimeout(function () { gal.moved = false; }, 60);
if (e.type === 'pointerup' && (Math.abs(d) > w * 0.2 || fast)) moveGallery(d > 0 ? 1 : -1);
else { track.classList.add('anim'); track.style.transform = ''; }
}
stage.addEventListener('pointerup', end);
stage.addEventListener('pointercancel', end);
}
var cmEl = null, cmProject = null, cmBtn = null, cmBusy = false, CM_MAX = 1000, CM_LEFT = CM_MAX.toLocaleString('fa-IR');
function cmDate(iso) {
var d = new Date(iso);
if (isNaN(d.getTime())) return '';
try { return d.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return ''; }
}
function buildComments() {
if (cmEl) return;
cmEl = D.createElement('div');
cmEl.className = 'merteks-overlay';
cmEl.id = 'mxCommentsModal';
cmEl.setAttribute('aria-hidden', 'true');
cmEl.innerHTML =
'<div class="merteks-panel mx-cm-panel" role="dialog" aria-modal="true" aria-labelledby="mxCmTitle">' +
'<div class="merteks-panel-head"><div><h3 id="mxCmTitle">نظرات</h3><p id="mxCmSub"></p></div>' +
'<button class="merteks-close" type="button" id="mxCmClose" aria-label="بستن">×</button></div>' +
'<section class="mx-cm-pager" id="mxCmPager" aria-roledescription="carousel" aria-label="نظرات بازدیدکنندگان" hidden>' +
'<div class="mx-cm-stage" id="mxCmStage"><div class="mx-cm-page" id="mxCmPage" aria-live="polite" aria-atomic="true"></div></div>' +
'<div class="mx-cm-nav">' +
'<button class="mx-cm-arrow" id="mxCmPrev" type="button" aria-label="نظر قبلی">' + CHEV_L + '</button>' +
'<span class="mx-cm-counter" id="mxCmCounter"></span>' +
'<button class="mx-cm-arrow" id="mxCmNext" type="button" aria-label="نظر بعدی">' + CHEV_R + '</button>' +
'</div>' +
'<div class="mx-cm-dots" id="mxCmDots"></div>' +
'</section>' +
'<div class="mx-cm-list" id="mxCmList" aria-live="polite"></div>' +
'<form class="merteks-form mx-cm-form" id="mxCmForm" novalidate>' +
'<div class="merteks-field"><label for="mxCmName">نام شما *</label><input id="mxCmName" name="name" maxlength="60" autocomplete="name"></div>' +
'<div class="merteks-field"><label for="mxCmBody">نظر شما *</label><textarea id="mxCmBody" name="body" maxlength="' + CM_MAX + '" rows="3" placeholder="نظر یا پرسش خود دربارهٔ این پروژه را بنویسید…"></textarea></div>' +
'<div style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
'<p class="mx-cm-note">نظر شما پس از تأیید مدیر نمایش داده می‌شود. نظرات را بازدیدکنندگان می‌نویسند و هویت نویسنده تأیید نمی‌شود.</p>' +
'<div class="merteks-actions"><button class="merteks-btn primary" type="submit" id="mxCmSubmit">ثبت نظر</button><span class="mx-cm-left" id="mxCmLeft">' + CM_LEFT + '</span></div>' +
'</form>' +
'</div>';
D.body.appendChild(cmEl);
$('mxCmClose').addEventListener('click', closeComments);
cmEl.addEventListener('click', function (e) { if (e.target === cmEl) closeComments(); });
$('mxCmBody').addEventListener('input', function () {
$('mxCmLeft').textContent = (CM_MAX - this.value.length).toLocaleString('fa-IR');
});
$('mxCmForm').addEventListener('submit', submitComment);
$('mxCmPrev').addEventListener('click', function () { flipComment(-1); });
$('mxCmNext').addEventListener('click', function () { flipComment(1); });
$('mxCmDots').addEventListener('click', function (e) {
var b = e.target.closest('[data-k]');
if (b) gotoComment(+b.getAttribute('data-k'));
});
onSwipe($('mxCmStage'), flipComment);
}
var cmRows = [], cmIdx = 0;
function paintComment(dir) {
var pager = $('mxCmPager'), page = $('mxCmPage'), n = cmRows.length;
var c = cmRows[cmIdx];
if (!c) { pager.hidden = true; return; }
pager.hidden = false;
page.innerHTML = '<div class="mx-cm-meta"><b>' + esc(c.name) + '</b><span>' + esc(cmDate(c.created_at)) + '</span></div><p>' + esc(c.body) + '</p>';
page.scrollTop = 0;
page.classList.remove('flip-next', 'flip-prev');
if (dir && !reduced) { void page.offsetWidth; page.classList.add(dir > 0 ? 'flip-next' : 'flip-prev'); }
$('mxCmCounter').textContent = (cmIdx + 1).toLocaleString('fa-IR') + ' / ' + n.toLocaleString('fa-IR');
$('mxCmPrev').disabled = cmIdx <= 0;
$('mxCmNext').disabled = cmIdx >= n - 1;
pager.classList.toggle('single', n < 2);
var dots = $('mxCmDots');
if (n > 1 && n <= 8) {
dots.hidden = false;
dots.innerHTML = cmRows.map(function (_, k) {
return '<button class="mx-cm-dot' + (k === cmIdx ? ' active' : '') + '" type="button" data-k="' + k + '" aria-label="نظر ' + (k + 1).toLocaleString('fa-IR') + '"' + (k === cmIdx ? ' aria-current="true"' : '') + '></button>';
}).join('');
} else { dots.hidden = true; dots.innerHTML = ''; }
}
function gotoComment(k) {
if (k < 0 || k >= cmRows.length || k === cmIdx) return;
var dir = k > cmIdx ? 1 : -1;
cmIdx = k; paintComment(dir);
}
function flipComment(d) { gotoComment(cmIdx + d); }
function renderComments(rows) {
var box = $('mxCmList');
cmRows = rows || []; cmIdx = 0;
if (!cmRows.length) {
$('mxCmPager').hidden = true;
box.innerHTML = '<p class="mx-cm-empty">هنوز نظری ثبت نشده است. اولین نفر باشید!</p>';
return;
}
box.innerHTML = '';
paintComment(0);
}
function loadComments(p) {
var box = $('mxCmList');
$('mxCmPager').hidden = true; cmRows = [];
box.innerHTML = '<p class="mx-cm-empty">در حال بارگذاری…</p>';
sbFetch('GET', '/rest/v1/project_comments?project_id=eq.' + encodeURIComponent(p.id) + '&status=eq.approved&select=id,name,body,created_at&order=created_at.desc&limit=100').then(function (res) {
if (cmProject !== p) return;
if (!res.ok || !Array.isArray(res.data)) {
box.innerHTML = '<p class="mx-cm-empty">' + (res.status === 404 || res.status === 400 ? 'بخش نظرات هنوز فعال نشده است.' : 'بارگذاری نظرات انجام نشد.') + '</p>';
return;
}
renderComments(res.data);
setCount(p, res.data.length);
}, function () { if (cmProject === p) box.innerHTML = '<p class="mx-cm-empty">اتصال به سرور برقرار نشد.</p>'; });
}
function setCount(p, n) {
p.comments = n;
if (cmBtn) { var sp = cmBtn.querySelector('.mx-ccount'); if (sp) sp.textContent = n ? '(' + n + ')' : ''; }
saveProjectsCache();
}
function openComments(p, btn) {
if (!p) return;
buildComments();
cmProject = p; cmBtn = btn || null;
$('mxCmSub').textContent = p.name || '';
try { $('mxCmName').value = sessionStorage.getItem('mx_cname') || ''; } catch (e) {}
$('mxCmBody').value = ''; $('mxCmLeft').textContent = CM_LEFT;
openOverlay('mxCommentsModal', true);
loadComments(p);
setTimeout(function () { var d = cmEl.querySelector('.mx-cm-panel'); if (d) { d.setAttribute('tabindex', '-1'); d.focus({ preventScroll: true }); } }, 60);
}
function closeComments() {
closeOverlay('mxCommentsModal', true);
cmProject = null; cmBtn = null;
}
function submitComment(e) {
e.preventDefault();
if (cmBusy || !cmProject) return;
var p = cmProject, fd = new FormData(e.target);
var name = String(fd.get('name') || '').trim(), body = String(fd.get('body') || '').trim();
if (!name) { toast('نام خود را وارد کنید'); $('mxCmName').focus(); return; }
if (body.length < 2) { toast('متن نظر را بنویسید'); $('mxCmBody').focus(); return; }
if (!API || !KEY) { toast('اتصال به سرور تنظیم نشده است'); return; }
var btn = $('mxCmSubmit');
cmBusy = true; btn.disabled = true; btn.textContent = 'در حال ارسال…';
sbRpc('add_project_comment', { p_project_id: p.id, p_name: name, p_body: body, p_website: String(fd.get('website') || '') }).then(function (j) {
cmBusy = false; btn.disabled = false; btn.textContent = 'ثبت نظر';
if (!j.success) {
toast(j.status === 404 ? 'بخش نظرات هنوز در دیتابیس فعال نشده است' : (j.error || 'ثبت نظر انجام نشد؛ دوباره تلاش کنید'));
return;
}
try { sessionStorage.setItem('mx_cname', name); } catch (err) {}
$('mxCmBody').value = ''; $('mxCmLeft').textContent = CM_LEFT;
toast('نظر شما ثبت شد و پس از تأیید مدیر نمایش داده می‌شود');
}, function () {
cmBusy = false; btn.disabled = false; btn.textContent = 'ثبت نظر';
toast('اتصال به سرور برقرار نشد');
});
}
function trapTab(e, box) {
if (e.key !== 'Tab' || !box) return;
var f = qa('a[href],button:not([disabled]),input:not([disabled]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', box)
.filter(function (x) { return x.offsetParent !== null; });
if (!f.length) return;
var first = f[0], last = f[f.length - 1];
if (e.shiftKey && (D.activeElement === first || !box.contains(D.activeElement))) { e.preventDefault(); last.focus(); }
else if (!e.shiftKey && (D.activeElement === last || !box.contains(D.activeElement))) { e.preventDefault(); first.focus(); }
}
D.addEventListener('keydown', function (e) {
if (galleryEl && galleryEl.classList.contains('open')) {
if (e.key === 'Escape') closeGallery();
else if (e.key === 'ArrowLeft') moveGallery(1);
else if (e.key === 'ArrowRight') moveGallery(-1);
else trapTab(e, galleryEl);
return;
}
if (cmEl && cmEl.classList.contains('open')) {
if (e.key === 'Escape') { closeComments(); return; }
var tag = (e.target && e.target.tagName) || '';
if (!/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) {
if (e.key === 'ArrowLeft') { flipComment(1); e.preventDefault(); return; }
if (e.key === 'ArrowRight') { flipComment(-1); e.preventDefault(); return; }
}
trapTab(e, cmEl);
return;
}
var m = $('merteksOrderModal');
if (m && m.classList.contains('open')) {
if (e.key === 'Escape') closeOverlay('merteksOrderModal');
else trapTab(e, m);
return;
}
if (e.key === 'Escape') closeMenu();
});
if (grid) {
var sec = $('projects'), started = false;
function startProjects() { if (started) return; started = true; renderProjects(); }
grid.addEventListener('click', function (e) {
var v = e.target.closest('[data-i]');
if (v && grid.contains(v)) { openGallery(listAll[+v.getAttribute('data-i')]); return; }
var m = e.target.closest('[data-c]');
if (m && grid.contains(m)) openComments(listAll[+m.getAttribute('data-c')], m);
});
if (moreBox) moreBox.addEventListener('click', showMoreProjects);
var retryBtn = $('mxProjectsRetry');
if (retryBtn) retryBtn.addEventListener('click', renderProjects);
W.addEventListener('online', function () { if (errBox && !errBox.hidden) renderProjects(); });
if ('IntersectionObserver' in W && sec) {
var po = new IntersectionObserver(function (en) {
if (en[0].isIntersecting) { po.disconnect(); startProjects(); }
}, { rootMargin: '900px 0px' });
po.observe(sec);
} else startProjects();
}
})();

/* Round 3 motion: staggered card entrances, cursor light, 3D tilt, magnetic buttons */
(function () {
'use strict';
var D = document, W = window;
function mm(q) { try { return W.matchMedia(q).matches; } catch (e) { return false; } }
var reduced = mm('(prefers-reduced-motion:reduce)'), hover = mm('(hover:hover) and (pointer:fine)');
var SEL = '.svc,.idea,.plan,.step,.fact,.team-list li,.faq details';
var cards = [].slice.call(D.querySelectorAll(SEL));
cards.forEach(function (c) { c.classList.add('fx'); });
[].forEach.call(D.querySelectorAll('.svc-list,.idea-list,.plans,.steps,.facts,.team-list,.faq'), function (g) {
[].forEach.call(g.children, function (c, i) { c.style.setProperty('--d', i * 90 + 'ms'); });
});
if (!reduced && 'IntersectionObserver' in W) {
var io = new IntersectionObserver(function (en) {
en.forEach(function (e) {
if (!e.isIntersecting) return;
io.unobserve(e.target);
var t = e.target;
t.classList.add('show');
setTimeout(function () { t.classList.add('done'); }, 1400);
});
}, { threshold: .15, rootMargin: '0px 0px -5% 0px' });
cards.forEach(function (c) { c.classList.add('reveal'); io.observe(c); });
} else {
cards.forEach(function (c) { c.classList.add('show', 'done'); });
}
if (!hover || reduced) return;
var glow = D.createElement('div');
glow.id = 'mxGlow';
glow.setAttribute('aria-hidden', 'true');
D.body.appendChild(glow);
var curCard = null, curBtn = null;
function clearCard(c) { if (c) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } }
function clearBtn(b) { if (b) { b.style.removeProperty('--bx'); b.style.removeProperty('--by'); } }
D.addEventListener('pointermove', function (e) {
glow.classList.add('on');
glow.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
var t = e.target, c = t.closest ? t.closest(SEL) : null, b = t.closest ? t.closest('.btn') : null;
if (c !== curCard) { clearCard(curCard); curCard = c; }
if (b !== curBtn) { clearBtn(curBtn); curBtn = b; }
if (c) {
var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
c.style.setProperty('--my', (e.clientY - r.top) + 'px');
c.style.setProperty('--ry', ((x - .5) * 10).toFixed(1) + 'deg');
c.style.setProperty('--rx', ((.5 - y) * 8).toFixed(1) + 'deg');
}
if (b) {
var q = b.getBoundingClientRect();
b.style.setProperty('--bx', ((e.clientX - q.left - q.width / 2) * .16).toFixed(1) + 'px');
b.style.setProperty('--by', ((e.clientY - q.top - q.height / 2) * .22).toFixed(1) + 'px');
}
}, { passive: true });
D.documentElement.addEventListener('pointerleave', function () { glow.classList.remove('on'); clearCard(curCard); clearBtn(curBtn); });
})();
