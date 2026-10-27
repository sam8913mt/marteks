# راهنمای اصلاحات، استقرار و بازگشت (مرتکس)

## تصمیم‌های منتظر تأیید مالک پروژه
1. **معماری ورود (B-01 / S-01):** ورود وب (`login.html`/`signup.html`) همان حساب‌های «Merteks AI» اپ اندروید است (RPCهای `ai_login`/`ai_signup`)؛ این RPCها توکن یا نشست نمی‌سازند. صفحهٔ `account.html` نشست Supabase Auth با ایمیل (`mx_auth_v1`) می‌خواهد که دیگر هیچ صفحه‌ای نمی‌سازد؛ یعنی صفحهٔ حساب عملاً یتیم است.
   - گزینهٔ الف (پیشنهادی، نیازمند Edge Function): یک Edge Function که `ai_login` را سمت سرور بررسی کند و نشست Supabase بسازد (یا ورود با OTP پیامکی با ارائه‌دهندهٔ SMS پشتیبانی‌شده). نیاز به دسترسی سرور؛ تا آن زمان دادهٔ `localStorage` «هویت» نیست.
   - گزینهٔ ب: ورود وب را به Supabase Auth (ایمیل) منتقل کنید و حساب‌های تلفنی را با مسیر مهاجرت (پیوند شماره به ایمیل با تأیید) منتقل کنید. بدون این مهاجرت حساب‌های اپ از دست می‌روند.
   - تا تصمیم: کد قدیمی (`auth.js`) حذف نشد؛ `next` به `account.html` عمداً رد می‌شود تا حلقهٔ بازگشت ایجاد نشود.
2. **تلگرام (B-04) — انجام شد:** `index.html` هم از `t.me/merteks_m` به `t.me/mmd2010s` یکسان شد، چون همهٔ صفحات دیگر و بخش پشتیبانی (ایتا و بله) همین آیدی را دارند. اگر حساب رسمی واقعاً `merteks_m` است، فقط همین دو لینک `index.html` را برگردانید (آیدی را در هر ۱۴ فایل دیگر هم عوض کنید).
3. **نسخهٔ APK (B-05):** `version`/`note` را خودتان وارد کنید (از پنل `admin-app.html`). نسخه‌ای ساخته نشد. ردیف ویندوز بدون URL قبلاً «به‌زودی» نمایش داده می‌شود (تأییدشده در کد).
4. **Noto Naskh Arabic:** فونت عنوان‌هاست و فایل محلی ندارد. اگر woff2 آن را در `fonts/` بگذارید، می‌توان Google Fonts را کاملاً حذف کرد.

## هدرهای امنیتی (S-05) — GitHub Pages قادر به تنظیم هدر نیست
`frame-ancestors` و `X-Frame-Options` فقط به‌صورت هدر HTTP اثر دارند. راه‌حل: دامنهٔ اختصاصی پشت Cloudflare (یا Netlify/Vercel) با قواعد زیر. تا آن زمان `admin.html` در برابر clickjacking محافظت نشده است.
```
Content-Security-Policy: frame-ancestors 'none'      (برای admin*.html)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

## robots.txt / sitemap (SEO-01)
روی `sam8913mt.github.io/marteks/` خزنده‌ها فقط `https://sam8913mt.github.io/robots.txt` را می‌خوانند و آن فایل در این مخزن نیست. `robots.txt` کنونی بی‌اثر است (ضرری هم ندارد). برای اثر واقعی: دامنهٔ اختصاصی، یا ثبت sitemap در Search Console. `lastmod` ها دست‌نخورده ماندند: تاریخ واقعی تغییر در دسترس نبود (تاریخ‌های گیت موجود نیست).

## بررسی APK
`sha256sum downloads/Merteks-AI.apk` باید برابر مقدار `app.json` باشد (در تست ایستا بررسی می‌شود). امضا: `apksigner verify --print-certs Merteks-AI.apk`.

## تست‌ها
- `node tests/static-check.mjs` — بدون وابستگی (لینک‌ها، CSP، فونت، هش 404، SHA-256، نحو JS).
- `tests/e2e.spec.py` — Playwright؛ اجرا نشده (مرورگر نصب نبود). فقط با داده/حساب آزمایشی.
- `docs/DB-SECURITY-CHECK.sql` — فقط‌خواندنی، برای بررسی RLS/گرنت/RPC.

## استقرار
فایل‌های تغییرکرده را کامیت و push کنید (GitHub Pages). نسخه‌های cache-busting بالا رفتند (`style.css` v17، `admin.css` v18، `admin-app.css` v3). پس از استقرار: Network را در DevTools ببینید که به `fonts.googleapis.com` فقط یک درخواست (Naskh) برود و به `*.workers.dev` درخواستی نباشد.

## بازگشت
نسخهٔ پایه با کامیت «baseline before fixes» ثبت شده: `git revert <commit>` یا جایگزینی با `backup/`. هیچ تغییر دیتابیس یا مایگریشنی انجام نشده، پس بازگشت فقط فایل‌هاست.
