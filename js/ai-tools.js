/* ============================================================
   Merteks AI — the two extra sections on the chat page:
     ai.html?m=study   «درس‌یار»              free, a private teacher that follows the school books
     ai.html?m=bourse  «تحلیل بازار و بورس»   costs tokens; a small live price chart on top
   ai-app.js asks window.MXTools for the texts, cards, request extras and the dock state.
   Answers come from the server function "ai-chat" (modes.ts); keys never reach the app.
   ============================================================ */
(function () {
'use strict';
var D = document, W = window, S = W.MXStore;
var hit = /[?&]m=(study|bourse)\b/.exec(W.location.search);
var MODE = hit ? hit[1] : '';
W.MXTools = null;
if (!MODE || !S) return;

function $(id) { return D.getElementById(id); }
var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function ls(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
var fa = S.fa;
function money(n) { try { return Math.round(n).toLocaleString('fa-IR'); } catch (e) { return fa(Math.round(n)); } }
function dateFa(iso) { try { return new Date(iso).toLocaleDateString('fa-IR', { month: 'long', day: 'numeric' }); } catch (e) { return ''; } }

var GRADES = ['اول دبستان', 'دوم دبستان', 'سوم دبستان', 'چهارم دبستان', 'پنجم دبستان', 'ششم دبستان',
  'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم', 'کنکور'];
var FIELDS = ['عمومی (دبستان و متوسطهٔ اول)', 'ریاضی و فیزیک', 'علوم تجربی', 'علوم انسانی', 'معارف اسلامی', 'فنی‌وحرفه‌ای و کاردانش'];

var STUDY = {
  name: 'درس‌یار',
  intro: 'سلام! من <b>درس‌یار <span dir="ltr">Merteks AI</span></b> هستم، معلم خصوصی رایگانت. سؤالت را بنویس یا از صورت سؤال عکس بگیر؛ طبق کتاب درسی خودت و قدم‌به‌قدم حلش می‌کنم، و هر بخش از کتاب را هم ساده و با مثال یادت می‌دهم.',
  cards: [
    { ic: 'image', t: 'عکس سؤال را بفرست', s: 'حل قدم‌به‌قدم طبق کتاب', pick: 'pickCamera' },
    { ic: 'pen', t: 'یک درس را یادم بده', s: 'ساده، با مثال و تمرین', q: 'می‌خواهم یک درس از کتابم را یاد بگیرم. اول بپرس کدام درس و کدام فصل، بعد مثل یک معلم خوب ساده و با مثال درسش بده.' },
    { ic: 'check', t: 'برای امتحان آماده‌ام کن', s: 'نکته‌ها و سؤال‌های مهم', q: 'برای امتحان این درس آماده‌ام کن: نکته‌های مهم، فرمول‌ها و چند سؤال امتحانی با جواب. اول بپرس امتحان کدام فصل‌هاست.' },
    { ic: 'translate', t: 'معنی و ترجمه', s: 'عربی، زبان و فارسی', q: 'یک متن یا جمله از کتاب عربی یا زبانم را برایت می‌فرستم؛ ترجمه و نکته‌های دستوری‌اش را طبق کتاب بگو.' }
  ],
  thinking: function (n) { return n ? 'در حال خواندن سؤال و حل دقیق…' : 'در حال حل دقیق و بررسی جواب…'; },
  note: function () { return '<b>درس‌یار</b> · رایگان · جواب‌ها را با کتاب و معلمتان هم مقایسه کنید'; }
};
var BOURSE = {
  name: 'تحلیل بازار و بورس',
  intro: 'سلام! من <b>تحلیلگر بازار <span dir="ltr">Merteks AI</span></b> هستم. با داده‌های همین لحظهٔ بورس، طلا، سکه و دلار تحلیل می‌کنم و می‌گویم الان در کوتاه‌مدت و بلندمدت چه چیزی خوب و چه چیزی بد است. هر سؤال <b>توکن</b> مصرف می‌کند.',
  cards: [
    { ic: 'code', t: 'الان بازار چطور است؟', s: 'بورس، طلا، سکه و دلار', q: 'وضعیت همین الان بورس تهران، دلار، طلا و سکه را تحلیل کن و بگو در کوتاه‌مدت و بلندمدت چه چیزی خوب و چه چیزی بد است.' },
    { ic: 'pen', t: 'پیش‌بینی طلا و دلار', s: 'سناریوهای هفته‌ها و ماه‌های آینده', q: 'قیمت دلار، طلای ۱۸ عیار و سکه در ایران را برای چند هفته و چند ماه آینده با سناریوهای مختلف پیش‌بینی کن و دلیل‌هایش را بگو.' },
    { ic: 'check', t: 'یک سهم را بررسی کن', s: 'نماد را بنویسید', fill: 'نماد … را کامل تحلیل کن و بگو برای کوتاه‌مدت و بلندمدت خرید، نگهداری یا فروش؟' },
    { ic: 'translate', t: 'سرمایه‌ام را کجا بگذارم؟', s: 'متناسب با ریسک شما', q: 'مقداری پول دارم و نمی‌دانم الان در بورس، طلا، دلار یا صندوق بگذارم. با شرایط امروز ایران راهنمایی‌ام کن و اول بپرس چقدر پول و برای چه مدتی.' }
  ],
  thinking: function () { return 'در حال جستجوی داده‌های همین لحظه و تحلیل…'; },
  note: function (w) {
    return 'هر سؤال حداقل ۱ توکن' + (w && w.pro ? ' · <b dir="ltr">PRO</b> تا ' + esc(dateFa(w.pro_until)) : '') + ' · تحلیل‌ها تضمین سود نیستند';
  }
};
var T = MODE === 'study' ? STUDY : BOURSE;

/* ---------- study: the student's grade, field and subject ---------- */
function studyKey(p) { return 'mxai_study_' + (p ? p.phone : 'guest'); }
function studyOf(p) { return ls(studyKey(p)) || {}; }
function options(list, cur, ph) {
  return '<option value="">' + ph + '</option>' + list.map(function (v) {
    return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>';
  }).join('');
}
function studyBox(p) {
  var s = studyOf(p);
  return '<div class="st-box rise" style="--d:180ms">' +
    '<p class="st-title">مشخصات تحصیلی‌ات را بگو تا جواب‌ها دقیقاً طبق کتاب خودت باشد</p>' +
    '<div class="st-row">' +
    '<label><span>پایه</span><select id="stGrade">' + options(GRADES, s.grade, 'انتخاب پایه') + '</select></label>' +
    '<label><span>رشته</span><select id="stField">' + options(FIELDS, s.field, 'انتخاب رشته') + '</select></label>' +
    '</div>' +
    '<label class="st-subj"><span>درس</span><input id="stSubject" maxlength="40" placeholder="مثلاً ریاضی ۲، فیزیک، عربی، علوم" value="' + esc(s.subject || '') + '"></label>' +
    '</div>';
}
D.addEventListener('change', function (e) {
  var id = e.target && e.target.id;
  if (id !== 'stGrade' && id !== 'stField' && id !== 'stSubject') return;
  var p = S.profile(), s = studyOf(p);
  s.grade = $('stGrade') ? $('stGrade').value : s.grade;
  s.field = $('stField') ? $('stField').value : s.field;
  s.subject = $('stSubject') ? $('stSubject').value.replace(/\s+/g, ' ').trim().slice(0, 40) : s.subject;
  lsSet(studyKey(p), s);
  $('modelSub').textContent = sub();
});
function sub() {
  if (MODE === 'study') {
    var s = studyOf(S.profile());
    return [s.grade, s.subject].filter(Boolean).join(' · ') || 'معلم خصوصی رایگان';
  }
  var w = wallet();
  return w ? fa(w.balance) + ' توکن' + (w.pro ? ' · PRO' : '') : 'با توکن';
}

/* ---------- market: tokens and the price chart ---------- */
function wallet() { var p = S.profile(); return p ? S.wallet(p.phone) : null; }

function spark(vals, up) {
  if (!vals || vals.length < 2) return '<svg class="mk-sp" viewBox="0 0 100 28" aria-hidden="true"><path d="M2 14H98"/></svg>';
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
  var pts = vals.map(function (v, i) {
    return (2 + i * 96 / (vals.length - 1)).toFixed(1) + ',' + (25 - (v - min) * 22 / span).toFixed(1);
  }).join(' ');
  return '<svg class="mk-sp ' + (up ? 'up' : 'down') + '" viewBox="0 0 100 28" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
}
function series(mk, it) {
  if (it.week && it.week.length >= 2) return it.week.concat(it.week[it.week.length - 1] === it.price ? [] : [it.price]);
  return (mk.hist || []).map(function (h) { return h.p && h.p[it.key]; }).filter(function (v) { return v > 0; });
}
function renderMarket(c) {
  var box = $('mkPanel');
  if (!box) return;
  var mk = c && c.market;
  if (!mk || !mk.items || !mk.items.length) {
    box.querySelector('.mk-items').innerHTML = '<p class="mk-wait">در حال گرفتن قیمت‌های همین لحظه…</p>';
    return;
  }
  box.querySelector('.mk-when').textContent = 'بازار امروز' + (mk.time ? ' · ساعت ' + fa(mk.time) : '');
  box.querySelector('.mk-items').innerHTML = mk.items.map(function (it) {
    var vals = series(mk, it), ch = it.change_pct;
    var up = ch != null ? ch >= 0 : vals.length < 2 || vals[vals.length - 1] >= vals[0];
    return '<div class="mk-it">' +
      '<span class="mk-name">' + esc(it.name) + '</span>' +
      '<b class="mk-price">' + money(it.price) + ' <small>' + esc(it.unit) + '</small></b>' +
      (ch != null ? '<span class="mk-ch ' + (up ? 'up' : 'down') + '" dir="ltr">' + (ch > 0 ? '+' : '') + fa(ch) + '%</span>' : '') +
      spark(vals, up) + '</div>';
  }).join('');
  box.querySelector('.mk-mood').textContent = mk.mood || '';
}
function buildPanel() {
  var app = D.querySelector('.chat-app'), th = $('thread');
  if (!app || !th || $('mkPanel')) return;
  var box = D.createElement('section');
  box.className = 'mk' + (ls('mxai_mk_closed') ? ' closed' : '');
  box.id = 'mkPanel';
  box.setAttribute('aria-label', 'قیمت‌های بازار');
  box.innerHTML = '<button class="mk-head" type="button" aria-expanded="' + !ls('mxai_mk_closed') + '">' +
    '<span class="mk-when">بازار امروز</span><span class="mk-tog" aria-hidden="true"></span></button>' +
    '<div class="mk-items"></div><p class="mk-mood"></p>';
  app.insertBefore(box, th);
  box.querySelector('.mk-head').addEventListener('click', function () {
    var closed = box.classList.toggle('closed');
    this.setAttribute('aria-expanded', String(!closed));
    lsSet('mxai_mk_closed', closed);
  });
  renderMarket(S.lastMarket());
}

/* ---------- page setup ---------- */
D.title = T.name + ' | Merteks AI';
D.body.classList.add('tool-mode', 'tool-' + MODE);
var mb = $('modelBtn');
if (mb) { mb.setAttribute('aria-haspopup', 'false'); mb.setAttribute('aria-label', T.name); }
if (MODE === 'bourse') buildPanel();

var refreshTimer = null;
W.MXTools = {
  mode: MODE,
  name: T.name,
  intro: T.intro,
  cards: T.cards,
  sub: sub,
  thinking: T.thinking,
  notCharged: MODE === 'bourse' ? ' توکنی برای این پیام کم نشد.' : '',
  err: {
    no_tokens: 'توکن کافی برای این سؤال ندارید. برای گرفتن توکن یا اشتراک PRO به پشتیبانی پیام بدهید.',
    bourse_off: 'بخش تحلیل بازار در حال به‌روزرسانی است؛ به‌زودی برمی‌گردیم.',
    study_limit: 'امروز به سقف سؤال‌های درس‌یار رسیدی؛ فردا دوباره بپرس.',
    keys_empty: 'این بخش موقتاً در دسترس نیست؛ کمی بعد دوباره امتحان کنید.',
    not_configured: 'این بخش هنوز راه‌اندازی نشده است؛ کمی بعد دوباره امتحان کنید.'
  },
  title: function (name) {
    return MODE === 'study' ? (name ? 'سلام ' + esc(name) + '، ' : '') + 'امروز چه درسی بخوانیم؟'
      : (name ? 'سلام ' + esc(name) + '، ' : '') + 'بازار را با هم بررسی کنیم';
  },
  helloExtra: function () { return MODE === 'study' ? studyBox(S.profile()) : ''; },
  extra: function (p) {
    if (MODE === 'bourse') return { mode: 'bourse' };
    var s = studyOf(p);
    return { mode: 'study', study: { grade: s.grade || '', field: s.field || '', subject: s.subject || '' } };
  },
  /* what the dock shows: a stop card (no tokens / section closed), the note, the meter */
  dock: function () {
    if (MODE === 'study') return { stop: null, note: T.note(), meter: null };
    var w = wallet();
    if (w && w.bourse === false) {
      return { stop: { title: 'بخش تحلیل بازار در حال به‌روزرسانی است', text: 'تا پایان به‌روزرسانی این بخش بسته است. به‌زودی برمی‌گردیم.' }, note: '', meter: null };
    }
    if (w && w.balance < 1) {
      return { stop: { title: 'توکن شما تمام شده است', text: 'هر سؤال در بخش تحلیل بازار توکن مصرف می‌کند. برای گرفتن توکن یا اشتراک PRO به پشتیبانی پیام بدهید.' }, note: '', meter: { n: 0, w: w } };
    }
    return { stop: null, note: T.note(w), meter: w ? { n: w.balance, w: w } : null };
  },
  start: function (p, redraw) {
    if (MODE !== 'bourse' || !p) return;
    S.loadWallet(p).then(redraw);
    var load = function () { S.market(p).then(function (d) { renderMarket(d && d.ok ? d : S.lastMarket()); }); };
    load();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(load, 15 * 60 * 1000);
  }
};
})();
