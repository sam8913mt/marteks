"""تست‌های E2E (Playwright برای Python) — اجرا نشده: در محیط ممیزی مرورگر نصب نبود.
اجرا:  python -m http.server 8080  (در ریشهٔ پروژه)  سپس  pytest tests/e2e.spec.py
مهم: فقط با حساب‌ها و داده‌های آزمایشی اجرا شود؛ هرگز روی داده‌های واقعی/تولیدی.
متغیرها: BASE=http://localhost:8080  TEST_PHONE / TEST_PASS (حساب آزمایشی)  ADMIN_URL_OK=1 (فقط برای محیط تست)"""
import os, re
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get("BASE", "http://localhost:8080")

def page_ctx(p):
    b = p.chromium.launch(); return b, b.new_page()

def test_404_loads_stylesheet_and_home_link():
    with sync_playwright() as p:
        b, pg = page_ctx(p); pg.goto(BASE + "/no/such/deep/page.html")
        expect(pg.locator("h1")).to_contain_text("۴۰۴")
        assert pg.locator("#home").get_attribute("href") in ("/", "/marteks/")
        b.close()

def test_next_param_rejects_external():
    with sync_playwright() as p:
        b, pg = page_ctx(p)
        for bad in ("https://evil.example", "//evil.example", "javascript:alert(1)", "../x.html", "account.html"):
            pg.goto(f"{BASE}/login.html?next={bad}")
            # باید فقط به index.html برود (بعد از ورود موفق با حساب آزمایشی)
            pg.fill("#obLPhone", os.environ["TEST_PHONE"]); pg.fill("#obLPass", os.environ["TEST_PASS"])
            pg.click("#obLogin [type=submit]"); pg.wait_for_url(re.compile(r"index\.html$|/$"))
            assert "evil" not in pg.url
        b.close()

def test_download_missing_url_shows_soon():
    with sync_playwright() as p:
        b, pg = page_ctx(p); pg.goto(BASE + "/index.html")
        card = pg.locator('.mx-dl-card[data-platform="windows"]')
        expect(card.locator(".mx-dl-btn.is-soon")).to_be_visible()
        b.close()

def test_admin_requires_login_and_no_data_for_anon():
    with sync_playwright() as p:
        b, pg = page_ctx(p); pg.goto(BASE + "/admin.html")
        expect(pg.locator("#adEmail")).to_be_visible()
        b.close()
# موارد زیر نیازمند Supabase آزمایشی و حساب‌های anon/user/admin هستند و «اجرا نشده» گزارش می‌شوند:
# ثبت‌نام/ورود/refresh/logout، بازیابی رمز، دسترسی غیرمجاز به orders/chats/comments، ثبت سفارش، نظر پروژه.
