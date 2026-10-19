فونت‌های سایت (برای نمایش درست در ایران و هر شبکه‌ای)
=====================================================

سایت اول فونت‌های همین پوشه را می‌خواند و اگر نبودند از Google Fonts می‌گیرد.
چون Google Fonts در بعضی شبکه‌ها بسته است، بهتر است این سه فایل کنار سایت باشند:

  vazirmatn-arabic-wght-normal.woff2
  vazirmatn-latin-wght-normal.woff2
  noto-naskh-arabic-arabic-wght-normal.woff2

راه ساده:  روی کامپیوتر خودتان (Node.js نصب باشد) اجرا کنید
  sh fonts/get-fonts.sh

راه دستی: همین پکیج‌ها را از npm بگیرید و فایل‌ها را در همین پوشه بگذارید
  @fontsource-variable/vazirmatn
  @fontsource-variable/noto-naskh-arabic
(فایل‌ها در پوشهٔ files داخل هر پکیج‌اند.)

بعد از گذاشتن فایل‌ها هیچ تغییر دیگری لازم نیست.
