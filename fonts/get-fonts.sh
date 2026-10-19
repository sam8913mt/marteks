#!/bin/sh
# یک‌بار روی کامپیوتر خودتان (با اینترنت و Node.js) اجرا کنید:  sh fonts/get-fonts.sh
# فونت‌ها از پکیج‌های رسمی fontsource گرفته و کنار همین اسکریپت کپی می‌شوند.
set -e
DEST="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install @fontsource-variable/vazirmatn @fontsource-variable/noto-naskh-arabic
cp node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2 "$DEST/"
cp node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-latin-wght-normal.woff2 "$DEST/"
cp node_modules/@fontsource-variable/noto-naskh-arabic/files/noto-naskh-arabic-arabic-wght-normal.woff2 "$DEST/"
echo "انجام شد. این سه فایل در پوشهٔ fonts هستند:"; ls -1 "$DEST"/*.woff2
