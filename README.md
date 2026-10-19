# سایت مرتکس (Merteks)

سایت چندصفحه‌ای مرتکس با HTML/CSS/JavaScript ساده، دیتابیس Supabase و چت‌بات پاسخ‌های آماده که برای سؤال‌های بدون پاسخ آماده، از طریق یک **Cloudflare Worker** به Gemini وصل می‌شود.

## ساختار

| مسیر | توضیح |
|---|---|
| `index.html`, `about.html`, `projects.html`, `services.html`, `faq.html`, `contact.html` | صفحه‌های سایت (نمونه‌کارهای انجام‌شده در `projects.html`) |
| `chat.html` | **صفحهٔ مستقل چت‌بات** (دکمهٔ شناور و حباب پیام در سایر صفحه‌ها به همین صفحه می‌برند) |
| `js/assistant.js` | منطق چت‌بات: اول پاسخ‌های آماده، اگر نبود Gemini؛ ذخیرهٔ گفتگو در Supabase |
| `js/config.js` | تنظیمات عمومی (Supabase و آدرس Worker). **هیچ کلید مخفی اینجا نیست** |
| `worker/` | پروکسی امن Gemini (Cloudflare Worker) |
| `_private/supabase/` | فایل‌های SQL دیتابیس |
| `admin.html` | پنل مدیریت (سفارش‌ها، گفتگوها، نظرات، پروژه‌ها) |

## مرحلهٔ ۱: آپلود روی GitHub و فعال‌سازی GitHub Pages

1. در GitHub یک مخزن (Repository) بسازید؛ مثلاً `merteks`.
2. همهٔ فایل‌های همین پوشه را در ریشهٔ مخزن آپلود کنید (Add file ← Upload files). فایل‌های مخفی مثل `.gitignore` و `.github` را هم آپلود کنید.
3. مخزن ← Settings ← Pages ← Source را روی Deploy from a branch و شاخهٔ `main` و پوشهٔ `/ (root)` بگذارید.
4. بعد از چند دقیقه سایت در آدرس `https://sam8913mt.github.io/marteks/` بالا می‌آید.

> نکته: اگر سایت در زیرپوشه (`/REPO/`) منتشر شود، `ALLOWED_ORIGINS` در مرحلهٔ بعد فقط **دامنه** است (بدون `/REPO`): `https://sam8913mt.github.io`.

## مرحلهٔ ۲: ساخت و استقرار Worker (برای Gemini)

نیاز: حساب رایگان Cloudflare و Node.js.

```bash
cd worker
npx wrangler login
```

۱. فایل `worker/wrangler.toml` را باز کنید و `ALLOWED_ORIGINS` را به آدرس واقعی سایت‌تان تغییر دهید (چند آدرس با ویرگول جدا شود).

۲. کلید Gemini را **به‌صورت Secret** ثبت کنید (متن کلید را فقط همین‌جا در ترمینال می‌چسبانید):

```bash
npx wrangler secret put GEMINI_API_KEY
```

۳. استقرار:

```bash
npx wrangler deploy
```

در پایان آدرسی مثل `https://merteks-ai.<نام‌شما>.workers.dev` نمایش داده می‌شود.

## مرحلهٔ ۳: وصل‌کردن سایت به Worker

در فایل `js/config.js` مقدار `aiEndpoint` را با آدرس Worker پر کنید:

```js
aiEndpoint: 'https://merteks-ai.<نام‌شما>.workers.dev'
```

سپس تغییر را Commit کنید. تا وقتی این مقدار خالی است، چت‌بات فقط با پاسخ‌های آماده کار می‌کند (Gemini غیرفعال است و چیزی خراب نمی‌شود).

اگر Worker را روی دامنهٔ اختصاصی (غیر `workers.dev`) بردید، همان دامنه را در تگ `Content-Security-Policy` (بخش `connect-src`) همهٔ صفحه‌های HTML اضافه کنید.

## تست

1. سایت را باز کنید، از منو «پرسش‌وپاسخ» (یا دکمهٔ شناور) را بزنید تا `chat.html` باز شود و بپرسید «هزینه چقدر است؟» ← باید پاسخ آماده بیاید.
2. بپرسید «فاصله زمین تا ماه چقدر است؟» ← پیام «در حال نوشتن پاسخ…» و بعد پاسخ Gemini با برچسب «پاسخ هوش مصنوعی».
3. در `admin.html` ← تب «گفتگوها» پرسش و پاسخ‌ها باید ثبت شده باشند.
4. تست محلی Worker: `cd worker && cp ../.env.example .dev.vars` (کلید را در `.dev.vars` بگذارید)، سپس `npx wrangler dev`.

## امنیت و کلید API

- کلید Gemini **فقط** Secret در Cloudflare است؛ در هیچ فایل سایت یا مخزن نیست.
- Worker فقط از `ALLOWED_ORIGINS` پذیرفته می‌شود، سؤال را به ۳۰۰ کاراکتر محدود می‌کند و محدودیت تعداد درخواست هر IP دارد.
- پاسخ مدل در سایت همیشه به‌صورت **متن** نمایش داده می‌شود و HTML یا اسکریپت اجرا نمی‌شود.
- **اگر کلیدی را جایی عمومی (چت، گیت‌هاب، اسکرین‌شات) گذاشته‌اید:** در [Google AI Studio](https://aistudio.google.com/apikey) آن را حذف (Delete) و کلید جدید بسازید، سپس دوباره `npx wrangler secret put GEMINI_API_KEY` بزنید.
- برای کنترل هزینه، در Google AI Studio سقف مصرف تعیین کنید.
- کلید `supabaseKey` در `config.js` از نوع Publishable است و طبق طراحی عمومی است (محافظت با RLS در دیتابیس).

## نام مدل

پیش‌فرض `gemini-flash-latest` (نام مستعار آخرین مدل Flash) است. اگر گوگل آن را تغییر داد، فقط `GEMINI_MODEL` در `worker/wrangler.toml` را عوض و دوباره `npx wrangler deploy` کنید.

## حریم خصوصی

پرسش‌ها و پاسخ‌های چت‌بات برای بهبود پاسخ‌گویی در Supabase ذخیره می‌شود و سؤال‌های بدون پاسخ آماده به Gemini فرستاده می‌شود. این موضوع در صفحهٔ `privacy.html` و داخل چت‌بات اعلام شده است.
