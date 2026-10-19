/* ============================================================
   Merteks quick-answer assistant (پرسش‌وپاسخ سریع)
   - Local, rule-based FAQ: no AI model, no server calls, nothing is stored.
   - Every answer matches what is written on the website.
   ============================================================ */
(function () {
'use strict';
var MX = window.MX, esc = MX.esc, D = document;

var PHONE_DISPLAY = '۰۹۱۹۷۰۲۹۲۱۳', PHONE_TEL = '09197029213';
var LINKS = {
  telegram: 'https://t.me/merteks_m',
  eitaa: 'https://eitaa.com/mmd2010s',
  bale: 'https://ble.ir/mmd2010s',
  instagram: 'https://www.instagram.com/merteks.m/'
};
var A_ORDER = { t: 'شروع پروژه', act: 'order' };
var A_TG = { t: 'پیام در تلگرام', href: LINKS.telegram };
var A_TEL = { t: 'تماس: ' + PHONE_DISPLAY, href: 'tel:' + PHONE_TEL };
var A_PORT = { t: 'دیدن نمونه‌کارها', act: 'projects' };

/* keywords are matched against the normalised question */
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
  { k: ['فروشگاه', 'فروشگاهی', 'سبد خرید', 'درگاه', 'اپلیکیشن', 'اپ', 'اندروید', 'اپلیکیشن'],
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
  { k: ['فایل', 'عکس', 'لوگو', 'متن', 'محتوای آماده'],
    a: 'در این گفتگو ارسال فایل ممکن نیست. فایل‌ها و نمونه‌های مرجع را بعد از ثبت درخواست از طریق تلگرام، ایتا یا بله برایمان بفرستید.',
    act: [A_TG] },
  { k: ['تماس', 'شماره', 'تلفن', 'زنگ', 'ارتباط', 'تلگرام', 'ایتا', 'بله', 'اینستاگرام', 'ایمیل'],
    a: 'راه‌های ارتباطی:\n• تلفن: ' + PHONE_DISPLAY + '\n• تلگرام، ایتا، بله و اینستاگرام (دکمه‌های پایین)\nایمیل فعلاً نداریم.',
    act: [A_TEL, A_TG, { t: 'ایتا', href: LINKS.eitaa }, { t: 'بله', href: LINKS.bale }] },
  { k: ['حریم', 'اطلاعات من', 'ذخیره', 'امنیت داده', 'محرمانه'],
    a: 'این گفتگو هیچ‌جا ذخیره نمی‌شود. فقط اطلاعاتی که خودتان در فرم «شروع پروژه» ثبت می‌کنید برای پاسخ‌گویی نگه‌داری می‌شود؛ جزئیات در صفحهٔ «حریم خصوصی» پایین سایت است.' },
  { k: ['ربات', 'هوش مصنوعی', 'انسان', 'آدم', 'واقعی'],
    a: 'من یک دستیار ساده با پاسخ‌های آماده‌ام، نه مدل هوش مصنوعی و نه انسان. برای صحبت با خود تیم، از «شروع پروژه» یا پیام‌رسان‌ها استفاده کنید.',
    act: [A_TG, A_ORDER] },
  { k: ['ممنون', 'مرسی', 'سپاس', 'thanks', 'تشکر'],
    a: 'خواهش می‌کنم 🙏 اگر سؤال دیگری دارید بپرسید.' },
  { k: ['خداحافظ', 'بدرود', 'bye'],
    a: 'موفق باشید! هر وقت نیاز داشتید در خدمتیم.' }
];

var SUGGEST = [
  'چه خدماتی دارید؟',
  'هزینه و زمان پروژه چقدر است؟',
  'چطور پروژه را شروع کنم؟',
  'نمونه‌کارها را کجا ببینم؟',
  'پشتیبانی بعد از تحویل دارید؟',
  'سایت فروشگاهی هم می‌سازید؟',
  'چطور تماس بگیرم؟'
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
    a: 'پاسخ دقیق این سؤال را ندارم؛ من فقط به پرسش‌های رایج دربارهٔ خدمات، زمان، هزینه و شروع پروژه جواب می‌دهم.\nبرای پاسخ مستقیم از خود تیم، پیام بدهید یا درخواست ثبت کنید.',
    act: [A_TG, A_ORDER]
  };
}

D.body.insertAdjacentHTML('beforeend',
'<div class="merteks-overlay" id="mxAiModal" aria-hidden="true">' +
'<div class="mx-ai-panel" role="dialog" aria-modal="true" aria-labelledby="mxAiTitle">' +
'<div class="mx-ai-head">' +
'<div class="mx-ai-avatars"><div class="mx-ai-dot" aria-hidden="true">م</div><div>' +
'<h3 id="mxAiTitle">پرسش‌وپاسخ سریع مرتکس</h3>' +
'<p class="mx-ai-sub">پاسخ‌های آماده · ذخیره نمی‌شود</p></div></div>' +
'<div class="mx-ai-avatars"><button class="merteks-close" type="button" id="mxAiClose" aria-label="بستن گفتگو">×</button></div>' +
'</div>' +
'<div class="mx-ai-body" id="mxAiBody" aria-live="polite"></div>' +
'<div class="mx-ai-suggest" id="mxAiSuggest"></div>' +
'<div class="mx-ai-compose" id="mxAiCompose">' +
'<div class="mx-ai-row"><textarea id="mxAiInput" rows="1" maxlength="300" placeholder="سؤال خود را بنویسید…" aria-label="متن سؤال"></textarea>' +
'<button class="mx-ai-send" type="button" id="mxAiSend" aria-label="ارسال">➤</button></div>' +
'<div class="mx-ai-tools"><span class="mx-ai-hint">این گفتگو ذخیره نمی‌شود · ارسال فایل ممکن نیست</span></div>' +
'</div>' +
'</div>' +
'</div>');

var modal = D.getElementById('mxAiModal'), body = D.getElementById('mxAiBody');
var input = D.getElementById('mxAiInput'), suggest = D.getElementById('mxAiSuggest');
var started = false;

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

function ask(text) {
  text = String(text || '').trim();
  if (!text) return;
  say('user', text);
  input.value = ''; input.style.height = 'auto';
  var r = answer(text);
  setTimeout(function () { say('bot', r.a, r.act); }, 250);
}

body.addEventListener('click', function (e) {
  var b = e.target.closest('[data-act]');
  if (!b) return;
  var a = b.getAttribute('data-act');
  MX.close('mxAiModal');
  if (a === 'order') { var o = D.getElementById('merteksOrderOpen'); if (o) o.click(); }
  if (a === 'projects') {
    var p = D.getElementById('projects');
    if (p) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});
suggest.addEventListener('click', function (e) {
  var c = e.target.closest('.mx-ai-chip');
  if (c) ask(c.textContent);
});
D.getElementById('mxAiSend').addEventListener('click', function () { ask(input.value); });
input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
});
input.addEventListener('input', function () {
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
});
function closeChat() { MX.close('mxAiModal'); }
D.getElementById('mxAiClose').addEventListener('click', closeChat);
modal.addEventListener('click', function (e) { if (e.target === modal) closeChat(); });

/* keyboard: Escape closes, Tab stays inside the dialog */
D.addEventListener('keydown', function (e) {
  if (!modal.classList.contains('open')) return;
  if (e.key === 'Escape') { closeChat(); return; }
  if (e.key !== 'Tab') return;
  var f = Array.prototype.slice.call(modal.querySelectorAll('a[href],button:not([disabled]),textarea:not([disabled])'))
    .filter(function (x) { return x.offsetParent !== null; });
  if (!f.length) return;
  var first = f[0], last = f[f.length - 1];
  if (e.shiftKey && (D.activeElement === first || !modal.contains(D.activeElement))) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (D.activeElement === last || !modal.contains(D.activeElement))) { e.preventDefault(); first.focus(); }
});

MX.openAssistant = function () {
  MX.open('mxAiModal');
  if (!started) {
    started = true;
    say('bot', 'سلام 👋 من دستیار ساده مرتکس هستم و به پرسش‌های رایج دربارهٔ خدمات، زمان، هزینه و شروع پروژه جواب می‌دهم.\nمن ربات هوش مصنوعی نیستم و این گفتگو ذخیره نمی‌شود. یکی از سؤال‌های پایین را انتخاب کنید یا سؤالتان را بنویسید.');
  }
  setTimeout(function () { input.focus(); }, 140);
};
})();
