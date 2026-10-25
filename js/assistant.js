/* ============================================================
   Merteks AI assistant (دستیار هوشمند مرتکس)
   - Users register once with a username + mobile number before chatting.
   - Each device gets DAILY_LIMIT AI messages per day; the head shows how much is used.
   - Inside the Android app the AI call, the API key and the counter live in
     window.MerteksNative. On the website the Cloudflare Worker
     (MERTEKS_CONFIG.aiEndpoint) is used and the counter is kept in localStorage.
   - If the AI is unavailable, the ready-made FAQ answers below are shown instead
     (those replies do not use up the daily allowance).
   - Every question + answer is saved to Supabase (public.chats via chat_start /
     chat_message) so the admin can read it in admin.html -> «گفتگوها».
   ============================================================ */
(function () {
'use strict';
/* inside the Merteks AI app the full-screen chat (ai.html) replaces this page */
if (window.MerteksNative) { location.replace('ai.html'); return; }
var MX = window.MX, esc = MX.esc, D = document;
var NATIVE = window.MerteksNative || null;
var DAILY_LIMIT = 7;
var AI_URL = (function () {
  var u = String((window.MERTEKS_CONFIG || {}).aiEndpoint || '').trim();
  return /^https:\/\/[^\s]+$/.test(u) ? u : '';
})();
var AI_READY = NATIVE ? !!NATIVE.isConfigured() : !!AI_URL;

var PHONE_DISPLAY = '۰۹۱۹۷۰۲۹۲۱۳', PHONE_TEL = '09197029213';
var LINKS = {
  telegram: 'https://t.me/mmd2010s',
  eitaa: 'https://eitaa.com/mmd2010s',
  bale: 'https://ble.ir/mmd2010s',
  instagram: 'https://www.instagram.com/merteks.m/'
};
var A_ORDER = { t: 'شروع پروژه', act: 'order' };
var A_TG = { t: 'پیام در تلگرام', href: LINKS.telegram };
var A_TEL = { t: 'تماس: ' + PHONE_DISPLAY, href: 'tel:' + PHONE_TEL };
var A_PORT = { t: 'دیدن نمونه‌کارها', act: 'projects' };

/* Ready-made answers: used only when the AI cannot answer. Keywords are matched against the normalised question. */
var KB = [
  { k: ['سلام', 'درود', 'وقت بخیر', 'صبح بخیر', 'شب بخیر', 'hi', 'hello'],
    a: 'سلام، خوش آمدید 👋\nدربارهٔ خدمات، مراحل کار، زمان، هزینه و شروع پروژه می‌توانم راهنمایی‌تان کنم.',
    act: [A_ORDER] },
  { k: ['خدمات', 'چه کاری', 'چه کار', 'تخصص', 'انجام می دهید', 'انجام میدید', 'ارائه می دهید', 'چیکار'],
    a: 'مرتکس روی این موارد کار می‌کند:\n• طراحی وب‌سایت (معرفی، شرکتی، لندینگ، پرتفولیو)\n• توسعهٔ فرانت‌اند با HTML، CSS و JavaScript\n• بازطراحی و بهبود ظاهر سایت‌های موجود\n• سازگاری با موبایل و سرعت\n• تولید محتوا و ساخت و تدوین ویدیو',
    act: [A_ORDER] },
  { k: ['هزینه', 'قیمت', 'تعرفه', 'چقدر پول', 'چند تومان', 'تومان', 'گران', 'ارزان', 'بودجه'],
    a: 'قیمت به نوع و حجم کار بستگی دارد و بدون شنیدن نیاز شما عدد دقیقی نمی‌دهیم.\nبرآورد و مشاورهٔ اولیه رایگان است: در فرم «شروع پروژه» بودجهٔ تقریبی را انتخاب کنید یا مستقیم پیام بدهید.',
    act: [A_ORDER, A_TG] },
  { k: ['زمان', 'مدت', 'چند روز', 'چند هفته', 'کی تحویل', 'تحویل', 'طول می کشد', 'چقدر طول'],
    a: 'زمان تقریبی (بسته به حجم کار):\n• لندینگ‌پیج و سایت تک‌صفحه‌ای: حدود ۳ تا ۷ روز\n• سایت چندصفحه‌ای: حدود ۲ تا ۴ هفته\n• پروژهٔ اختصاصی: بعد از نیازسنجی اعلام می‌شود\nزمان نهایی قبل از شروع کار با شما هماهنگ می‌شود.',
    act: [A_ORDER] },
  { k: ['سفارش', 'ثبت', 'شروع', 'چطور شروع', 'چگونه شروع', 'فرم', 'پروژه دارم', 'همکاری'],
    a: 'شروع کار ساده است:\n۱) روی «شروع پروژه» بزنید\n۲) نام، شمارهٔ تماس، نوع پروژه و توضیح کوتاه را بنویسید\n۳) با شما تماس می‌گیریم و درباره نیاز، زمان و هزینه صحبت می‌کنیم.\nاگر ترجیح می‌دهید، مستقیم در تلگرام، ایتا یا بله پیام بدهید.',
    act: [A_ORDER, A_TG] },
  { k: ['نمونه کار', 'نمونه کارها', 'پروژه های قبلی', 'کارهای قبلی', 'پرتفولیو', 'سابقه', 'رزومه'],
    a: 'نمونه‌کارهای ثبت‌شده در بخش «نمونه‌کارها» هستند و زیر آن چند «نمونهٔ مفهومی» هم برای نشان‌دادن سبک کار آمده که پروژهٔ تحویل‌شده نیستند. اگر نمونهٔ مشخصی مدنظر دارید بنویسید تا بگوییم چه چیزی نزدیک‌تر است.',
    act: [A_PORT, A_ORDER] },
  { k: ['تیم', 'کی هستید', 'شما کی', 'اعضا', 'چند نفر', 'دو نفر', 'محمدسام', 'مهدی', 'درباره'],
    a: 'مرتکس یک تیم دو نفره است: محمدسام و مهدی. هر پروژه را خود همین دو نفر انجام می‌دهیم و شما مستقیم با کسی که کار را انجام می‌دهد صحبت می‌کنید.' },
  { k: ['پشتیبانی', 'بعد از تحویل', 'رفع اشکال', 'گارانتی', 'ضمانت', 'نگهداری'],
    a: 'بعد از تحویل، رفع اشکال‌های مربوط به کار انجام‌شده را پوشش می‌دهیم. مدت و دامنهٔ دقیق پشتیبانی قبل از شروع، در توافق نوشته می‌شود.',
    act: [A_TG] },
  { k: ['پرداخت', 'پیش پرداخت', 'بیعانه', 'قسط', 'اقساط', 'چطور پرداخت'],
    a: 'پرداخت معمولاً مرحله‌ای است: بخشی در شروع کار و باقی هنگام تحویل. جزئیات دقیق قبل از شروع با شما هماهنگ و توافق می‌شود.' },
  { k: ['فروشگاه', 'فروشگاهی', 'سبد خرید', 'درگاه', 'اپلیکیشن', 'اپ', 'اندروید'],
    a: 'تمرکز اصلی ما سایت‌های معرفی، شرکتی، لندینگ و پرتفولیو و بخش ظاهری و تعاملی (فرانت‌اند) است. برای فروشگاه آنلاین یا اپلیکیشن، نیاز را در فرم بنویسید تا بعد از بررسی صادقانه بگوییم از عهده‌اش برمی‌آییم یا نه، و اگر لازم بود مسیر بهتری پیشنهاد کنیم.',
    act: [A_ORDER] },
  { k: ['سئو', 'seo', 'گوگل', 'سرعت', 'کند'],
    a: 'ساختار درست صفحه، متاتگ‌ها، سرعت و سازگاری با موبایل (سئوی پایه) جزو کار ماست. سئوی حرفه‌ای و پیوسته نیاز به محتوای منظم و زمان دارد و جزو پروژهٔ جداگانه است؛ نتیجهٔ سئو فوری نیست.' },
  { k: ['موبایل', 'ریسپانسیو', 'گوشی', 'تبلت'],
    a: 'بله، سایت‌ها طوری ساخته می‌شوند که روی موبایل، تبلت و کامپیوتر مرتب و قابل استفاده باشند و قبل از تحویل روی هر سه بررسی می‌شوند.' },
  { k: ['بازطراحی', 'سایت دارم', 'سایت قدیمی', 'بهبود', 'ظاهر سایت', 'قالب'],
    a: 'اگر سایت دارید، می‌توانیم رنگ، تایپوگرافی، چیدمان و سازگاری با موبایل آن را بهبود دهیم. لینک سایت را در توضیحات فرم بنویسید تا نگاه کنیم.',
    act: [A_ORDER] },
  { k: ['ویدیو', 'فیلم', 'تدوین', 'محتوا', 'ریل', 'کلیپ'],
    a: 'ساخت و تدوین ویدیو و تولید محتوای بصری برای سایت و شبکه‌های اجتماعی هم انجام می‌دهیم. موضوع و مدت ویدیو را در فرم بنویسید.',
    act: [A_ORDER] },
  { k: ['مشاوره', 'رایگان', 'سوال دارم', 'مشورت'],
    a: 'مشاورهٔ اولیه و برآورد رایگان است؛ نیاز خود را بگویید تا راهنمایی کنیم و بعد تصمیم بگیرید.',
    act: [A_TG, A_ORDER] },
  { k: ['دامنه', 'هاست', 'سرور', 'میزبانی'],
    a: 'اگر دامنه یا هاست دارید همان را استفاده می‌کنیم؛ اگر ندارید، در زمان توافق راهنمایی می‌کنیم.' },
  { k: ['تماس', 'شماره', 'تلفن', 'زنگ', 'ارتباط', 'تلگرام', 'ایتا', 'بله', 'اینستاگرام', 'ایمیل'],
    a: 'راه‌های ارتباطی:\n• تلفن: ' + PHONE_DISPLAY + '\n• تلگرام، ایتا، بله و اینستاگرام (دکمه‌های پایین)\nایمیل فعلاً نداریم.',
    act: [A_TEL, A_TG, { t: 'ایتا', href: LINKS.eitaa }, { t: 'بله', href: LINKS.bale }] },
  { k: ['ربات', 'هوش مصنوعی', 'انسان', 'آدم', 'واقعی', 'کی ساخته', 'سازنده'],
    a: 'من دستیار هوشمند مرتکس هستم و تیم مرتکس من را ساخته است. برای صحبت با خود تیم، از «شروع پروژه» یا پیام‌رسان‌ها استفاده کنید.',
    act: [A_TG, A_ORDER] },
  { k: ['ممنون', 'مرسی', 'سپاس', 'thanks', 'تشکر'],
    a: 'خواهش می‌کنم 🙏 اگر سؤال دیگری دارید بپرسید.' },
  { k: ['خداحافظ', 'بدرود', 'bye'],
    a: 'موفق باشید! هر وقت نیاز داشتید در خدمتیم.' }
];

/* starter prompts that show off what the assistant can do */
var SUGGEST = [
  'یک کپشن جذاب برای پیج کافه بنویس',
  'ایدهٔ یک کسب‌وکار آنلاین کم‌هزینه بده',
  'ترجمه کن به انگلیسی: فردا ساعت ده جلسه داریم',
  'برای سایت شخصی‌ام چه صفحه‌هایی لازم است؟',
  'یک برنامهٔ مطالعهٔ یک‌هفته‌ای برایم بچین',
  'مرتکس چه خدماتی دارد؟'
];

var STOP = ['و', 'در', 'به', 'از', 'که', 'را', 'با', 'این', 'آن', 'برای', 'یا', 'هم', 'یه', 'یک', 'من', 'شما', 'می', 'است', 'هست', 'چی', 'چه', 'چطور', 'چگونه', 'کجا', 'آیا'];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک')
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[‌‍]/g, ' ')
    .replace(/[ً-ٟـ]/g, '')
    .replace(/[^؀-ۿa-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function answer(q) {
  var n = norm(q);
  if (!n) return { a: 'سؤال‌تان را بنویسید تا راهنمایی کنم.' };
  var words = n.split(' ').filter(function (w) { return w.length > 1 && STOP.indexOf(w) === -1; });
  var best = null, bestScore = 0;
  KB.forEach(function (item) {
    var score = 0;
    item.k.forEach(function (key) {
      var kk = norm(key);
      if (!kk) return;
      var s = 0;
      if (n.indexOf(kk) > -1) s = kk.length + (n === kk ? 10 : 2);
      else if (kk.indexOf(' ') === -1 && words.indexOf(kk) > -1) s = kk.length + 2;
      if (s > score) score = s;
    });
    if (score > bestScore) { bestScore = score; best = item; }
  });
  if (best && bestScore >= 3) return best;
  return {
    a: 'پاسخ آماده‌ای برای این سؤال ندارم؛ پاسخ‌های آماده‌ام دربارهٔ خدمات، زمان، هزینه و شروع پروژهٔ مرتکس است.\nبرای پاسخ مستقیم از خود تیم، پیام بدهید یا درخواست ثبت کنید.',
    act: [A_TG, A_ORDER],
    miss: true
  };
}

/* ---------- small helpers ---------- */
function fa(n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+d); }); }
function today() {
  var d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
/* the bubbles show plain text; drop the markdown marks models like to add */
function plain(t) {
  return String(t || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
var NAME_RE = /^[؀-ۿa-zA-Z0-9_. ‌-]{2,30}$/;

/* ---------- profile + daily allowance (native in the app, localStorage on the web) ---------- */
var store = {
  profile: function () {
    if (NATIVE) { try { var p = NATIVE.getProfile(); return p ? JSON.parse(p) : null; } catch (e) { return null; } }
    var w = lsGet('mx_ai_profile');
    return w && w.name && w.phone ? w : null;
  },
  saveProfile: function (name, phone) {
    if (NATIVE) return !!NATIVE.saveProfile(name, phone);
    lsSet('mx_ai_profile', { name: name, phone: phone });
    return true;
  },
  quota: function () {
    if (NATIVE) { try { var q = JSON.parse(NATIVE.getQuota()); return { used: q.used | 0, limit: q.limit | 0 || DAILY_LIMIT }; } catch (e) {} }
    var w = lsGet('mx_ai_quota');
    return { used: w && w.day === today() ? Math.min(w.used | 0, DAILY_LIMIT) : 0, limit: DAILY_LIMIT };
  },
  consumeWeb: function () {
    var q = store.quota();
    lsSet('mx_ai_quota', { day: today(), used: Math.min(q.used + 1, q.limit) });
  }
};

/* ---------- AI request: resolves {ok, answer} or {ok:false, error}; never rejects ---------- */
var pending = {}, seq = 0;
window.MXNativeReply = function (id, json) {
  var cb = pending[id];
  if (!cb) return;
  delete pending[id];
  var d = {};
  try { d = JSON.parse(json); } catch (e) { d = { ok: false, error: 'bad_reply' }; }
  cb(d);
};
function askAI(question, history, name) {
  if (NATIVE) {
    return new Promise(function (resolve) {
      var id = 'q' + (++seq);
      var timer = setTimeout(function () {
        if (pending[id]) { delete pending[id]; resolve({ ok: false, error: 'timeout' }); }
      }, 70000);
      pending[id] = function (d) { clearTimeout(timer); resolve(d); };
      NATIVE.ask(id, JSON.stringify({ question: question, history: history }));
    });
  }
  var ctl = window.AbortController ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, 30000) : null;
  return fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: question, history: history, name: name }),
    cache: 'no-store',
    signal: ctl ? ctl.signal : undefined
  }).then(function (res) {
    if (timer) clearTimeout(timer);
    return res.json().catch(function () { return {}; }).then(function (d) {
      if (res.ok && d && typeof d.answer === 'string' && d.answer.trim()) {
        store.consumeWeb();
        return { ok: true, answer: d.answer.trim() };
      }
      return { ok: false, error: res.status === 429 ? 'busy' : 'http_' + res.status };
    });
  }, function () {
    if (timer) clearTimeout(timer);
    return { ok: false, error: 'network' };
  });
}

/* ---------- UI ---------- */
var mount = D.getElementById('mxChatMount');
if (!mount) return;
var RING = 2 * Math.PI * 17;
mount.innerHTML =
'<div class="mx-ai-panel mx-ai-page" role="region" aria-labelledby="mxAiTitle">' +
'<div class="mx-ai-head">' +
'<div class="mx-ai-avatars"><div class="mx-ai-dot" aria-hidden="true">م</div><div>' +
'<h3 id="mxAiTitle">دستیار هوشمند مرتکس</h3>' +
'<p class="mx-ai-sub"><span class="mx-ai-live" aria-hidden="true"></span>ساخت تیم مرتکس · هوش مصنوعی</p></div></div>' +
'<div class="mx-quota" id="mxQuota" role="meter" aria-valuemin="0">' +
'<div class="mx-quota-ring"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="mx-quota-track" cx="20" cy="20" r="17"/>' +
'<circle class="mx-quota-fill" id="mxQuotaFill" cx="20" cy="20" r="17" stroke-dasharray="' + RING.toFixed(2) + '"/></svg>' +
'<span class="mx-quota-pct" id="mxQuotaPct"></span></div>' +
'<div class="mx-quota-txt"><b id="mxQuotaUsed"></b><span>استفادهٔ امروز</span></div>' +
'</div>' +
'</div>' +
'<div class="mx-ai-body" id="mxAiBody" aria-live="polite"></div>' +
'<div class="mx-ai-suggest" id="mxAiSuggest" hidden></div>' +
'<div class="mx-ai-compose" id="mxAiCompose" hidden>' +
'<div class="mx-ai-row"><textarea id="mxAiInput" rows="1" maxlength="600" placeholder="هر سؤالی دارید بپرسید…" aria-label="متن پیام"></textarea>' +
'<button class="mx-ai-send" type="button" id="mxAiSend" aria-label="ارسال">➤</button></div>' +
'<div class="mx-ai-tools"><span class="mx-ai-hint">استفادهٔ رایگان روزانه · پاسخ‌ها را هوش مصنوعی می‌نویسد و ممکن است خطا داشته باشد · گفتگو برای بهبود دستیار ذخیره می‌شود</span></div>' +
'</div>' +
'</div>';

var body = D.getElementById('mxAiBody');
var input = D.getElementById('mxAiInput'), suggest = D.getElementById('mxAiSuggest');
var compose = D.getElementById('mxAiCompose'), sendBtn = D.getElementById('mxAiSend');
var meter = D.getElementById('mxQuota');
var profile = store.profile();
var turns = [], aiBusy = false;

suggest.innerHTML = SUGGEST.map(function (q) {
  return '<button class="mx-ai-chip" type="button">' + esc(q) + '</button>';
}).join('');

function actionsHtml(list) {
  if (!list || !list.length) return '';
  return '<div class="mx-ai-actions">' + list.map(function (x) {
    if (x.href) {
      var ext = /^https?:/.test(x.href);
      return '<a class="mx-ai-act" href="' + esc(x.href) + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' + esc(x.t) + '</a>';
    }
    return '<button type="button" class="mx-ai-act" data-act="' + esc(x.act) + '">' + esc(x.t) + '</button>';
  }).join('') + '</div>';
}
function bubble(who, text, act) {
  return '<div class="mx-ai-msg ' + who + '"><div class="mx-ai-av" aria-hidden="true">' + (who === 'user' ? '•' : 'م') + '</div>' +
    '<div><div class="mx-ai-bubble">' + esc(text).replace(/\n/g, '<br>') + actionsHtml(act) + '</div></div></div>';
}
function scroll() { body.scrollTop = body.scrollHeight; }
function say(who, text, act) { body.insertAdjacentHTML('beforeend', bubble(who, text, act)); scroll(); }

/* usage meter: ring + percent + "x of 7" */
function renderQuota() {
  var q = store.quota(), pct = q.limit ? Math.round(q.used * 100 / q.limit) : 0;
  D.getElementById('mxQuotaFill').style.strokeDashoffset = (RING * (1 - pct / 100)).toFixed(2);
  D.getElementById('mxQuotaPct').textContent = fa(pct) + '٪';
  D.getElementById('mxQuotaUsed').textContent = fa(pct) + '٪ استفاده‌شده';
  meter.setAttribute('aria-valuemax', String(q.limit));
  meter.setAttribute('aria-valuenow', String(q.used));
  meter.setAttribute('aria-label', 'استفادهٔ امروز: ' + fa(pct) + ' درصد');
  meter.className = 'mx-quota' + (pct >= 100 ? ' is-full' : pct >= 70 ? ' is-high' : '');
  var full = q.used >= q.limit;
  input.disabled = full;
  sendBtn.disabled = full || aiBusy;
  input.placeholder = full ? 'سهم امروز تمام شد؛ فردا دوباره می‌توانید بپرسید' : 'هر سؤالی دارید بپرسید…';
  return q;
}
function limitNotice() {
  say('bot', 'سهم رایگان امروزتان تمام شد 🌙\nفردا دوباره می‌توانید ادامه بدهید.\nاگر دستیاری مثل من برای کسب‌وکار خودتان می‌خواهید، با تیم مرتکس صحبت کنید.', [A_ORDER, A_TG]);
}

/* one id per browser tab session; every exchange is stored under it */
var CHAT_ID = (function () {
  var id = '';
  try { id = sessionStorage.getItem('mx_chat_id') || ''; } catch (e) {}
  if (!/^[A-Za-z0-9_-]{3,100}$/.test(id)) {
    id = 'C-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem('mx_chat_id', id); } catch (e) {}
  }
  return id;
})();
var DEVICE = (NATIVE ? 'app ' : '') + (window.innerWidth < 720 ? 'mobile' : 'desktop') + ' ' + window.innerWidth + 'x' + window.innerHeight;

function saveExchange(q, a) {
  if (!MX.cloudPost) return;
  try {
    MX.cloudPost({ action: 'chatMessage', chatId: CHAT_ID, name: profile ? profile.name : '', phone: profile ? profile.phone : '', device: DEVICE, question: q, answer: a });
  } catch (e) {}
}

function setBusy(on) {
  aiBusy = on;
  input.setAttribute('aria-busy', on ? 'true' : 'false');
  renderQuota();
}
function typingOn() {
  body.insertAdjacentHTML('beforeend', '<div class="mx-ai-msg bot" id="mxAiTyping"><div class="mx-ai-av" aria-hidden="true">م</div><div><div class="mx-ai-bubble mx-ai-typing" aria-label="در حال نوشتن پاسخ"><i></i><i></i><i></i></div></div></div>');
  scroll();
}
function typingOff() { var t = D.getElementById('mxAiTyping'); if (t && t.parentNode) t.parentNode.removeChild(t); }

var AI_ERR = {
  busy: 'الان درخواست‌ها زیاد است؛ چند دقیقهٔ دیگر دوباره امتحان کنید.',
  network: 'اتصال اینترنت برقرار نشد؛ اینترنت را بررسی کنید و دوباره بفرستید.',
  timeout: 'پاسخ دیر رسید؛ لطفاً دوباره بفرستید.'
};

function ask(text) {
  text = String(text || '').trim();
  if (!text || !profile) return;
  if (aiBusy) { MX.toast('لطفاً تا آمدن پاسخ قبلی صبر کنید'); return; }
  var q = store.quota();
  if (q.used >= q.limit) { limitNotice(); renderQuota(); return; }
  say('user', text);
  suggest.hidden = true;
  input.value = ''; input.style.height = 'auto';

  /* no AI configured: ready-made answers only (they do not count) */
  if (!AI_READY) {
    var r0 = answer(text);
    saveExchange(text, r0.a);
    setTimeout(function () { say('bot', r0.a, r0.act); }, 250);
    return;
  }

  setBusy(true); typingOn();
  askAI(text, turns.slice(-8), profile.name).then(function (g) {
    typingOff(); setBusy(false);
    if (g.ok) {
      var out = plain(g.answer);
      turns.push({ role: 'user', content: text }, { role: 'assistant', content: out });
      saveExchange(text, out);
      say('bot', out);
      var nq = renderQuota();
      if (nq.used >= nq.limit) limitNotice();
      else if (nq.limit - nq.used === 2) MX.toast('فقط ' + fa(2) + ' پیام دیگر برای امروز دارید');
      return;
    }
    if (g.error === 'limit') { limitNotice(); renderQuota(); return; }
    /* AI failed: show the ready-made answer when there is one; the message is not counted */
    var r = answer(text), note = AI_ERR[g.error] || 'دستیار هوشمند الان در دسترس نیست؛ کمی بعد دوباره امتحان کنید.';
    var msg = r.miss ? note + '\nاین پیام از سهم امروزتان کم نشد.' : r.a + '\n\n(' + note + ')';
    saveExchange(text, msg);
    say('bot', msg, r.act || [A_TG]);
  });
}

function greet() {
  var q = renderQuota(), left = q.limit - q.used;
  var hi = 'سلام ' + profile.name + '، به دستیار هوشمند مرتکس خوش آمدید 👋\n' +
    'من را تیم مرتکس ساخته است تا در چند ثانیه جواب سؤال‌هایتان را بدهم؛ از نوشتن و ترجمهٔ متن و ایده‌پردازی تا توضیح کد و مشاوره برای ساخت سایت.\n';
  compose.hidden = false;
  if (left <= 0) { say('bot', hi); limitNotice(); return; }
  hi += left === q.limit
    ? 'همین حالا رایگان من را امتحان کنید. اولین سؤالتان را بپرسید؛ کمی پایین‌تر چند پیشنهاد هم گذاشته‌ام.'
    : 'خوش برگشتید. سؤالتان را بپرسید.';
  say('bot', hi);
  suggest.hidden = q.used > 0;
  /* on phones, opening the keyboard right away would cover the greeting */
  var fine = false;
  try { fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches; } catch (e) {}
  if (fine) setTimeout(function () { input.focus({ preventScroll: true }); }, 140);
}

/* registration: username + mobile number before the first message */
function showSignup() {
  body.innerHTML =
    '<form class="mx-ai-join" id="mxAiJoin" novalidate>' +
    '<div class="mx-ai-join-badge" aria-hidden="true">✦</div>' +
    '<h4>دستیار هوشمند مرتکس را امتحان کنید</h4>' +
    '<p>نام کاربری و شمارهٔ موبایلتان را وارد کنید تا هر روز رایگان با دستیار گفتگو کنید.</p>' +
    '<label for="mxJoinName">نام کاربری</label>' +
    '<input id="mxJoinName" name="name" autocomplete="nickname" maxlength="30" placeholder="مثلاً سارا" required>' +
    '<label for="mxJoinPhone">شمارهٔ موبایل</label>' +
    '<input id="mxJoinPhone" name="phone" type="tel" inputmode="numeric" autocomplete="tel" dir="ltr" maxlength="14" placeholder="09xxxxxxxxx" required>' +
    '<p class="mx-ai-join-err" id="mxJoinErr" role="alert"></p>' +
    '<button class="btn btn-primary mx-ai-join-go" type="submit">شروع گفتگو با دستیار</button>' +
    '<small>شماره فقط برای ارتباط تیم مرتکس با شما ذخیره می‌شود و جایی نمایش داده نمی‌شود.</small>' +
    '</form>';
  var form = D.getElementById('mxAiJoin'), err = D.getElementById('mxJoinErr');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = D.getElementById('mxJoinName').value.replace(/\s+/g, ' ').trim();
    var phone = MX.normalizeDigits(D.getElementById('mxJoinPhone').value);
    if (!NAME_RE.test(name)) { err.textContent = 'نام کاربری باید ۲ تا ۳۰ حرف باشد (حروف، عدد، فاصله، _ یا .).'; D.getElementById('mxJoinName').focus(); return; }
    if (!MX.validPhone(phone)) { err.textContent = 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹'; D.getElementById('mxJoinPhone').focus(); return; }
    if (!store.saveProfile(name, phone)) { err.textContent = 'ذخیرهٔ اطلاعات انجام نشد؛ دوباره امتحان کنید.'; return; }
    profile = { name: name, phone: phone };
    try { MX.cloudPost({ action: 'chatStart', id: CHAT_ID, name: name, phone: phone }); } catch (x) {}
    body.innerHTML = '';
    greet();
  });
}

body.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]');
  if (!b) return;
  var a = b.getAttribute('data-act');
  if (a === 'order') { var o = D.getElementById('merteksOrderOpen'); if (o) o.click(); }
  if (a === 'projects') location.href = 'projects.html';
});
suggest.addEventListener('click', function (e) {
  var c = e.target.closest('.mx-ai-chip');
  if (c) ask(c.textContent);
});
sendBtn.addEventListener('click', function () { ask(input.value); });
input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
});
input.addEventListener('input', function () {
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
});
/* the allowance resets at midnight even if the page stays open */
D.addEventListener('visibilitychange', function () { if (!D.hidden && profile) renderQuota(); });

MX.openAssistant = function () { if (profile) input.focus({ preventScroll: true }); };
renderQuota();
if (profile) greet(); else showSignup();
})();
