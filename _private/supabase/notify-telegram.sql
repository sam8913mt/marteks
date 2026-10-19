-- ============================================================
-- Merteks — اعلان فوری سفارش جدید در تلگرام   (اختیاری، آزمایش‌نشده)
--
-- پیش‌نیاز:
--  1) در تلگرام با @BotFather یک ربات بساز و «توکن» را بگیر.
--  2) به ربات خودت یک پیام بده، بعد آدرس زیر را در مرورگر باز کن تا chat id را ببینی:
--       https://api.telegram.org/bot<TOKEN>/getUpdates
--  3) در Supabase: Database > Extensions > فعال کردن  pg_net
--  4) دو مقدار PASTE_... را پایین عوض کن و کل فایل را در SQL Editor اجرا کن.
--
-- توکن در جدول private.app_config نگه داشته می‌شود (از بیرون قابل خواندن نیست).
-- ارسال پیام هیچ‌وقت ثبت سفارش را خراب نمی‌کند؛ اگر تلگرام جواب ندهد سفارش ذخیره می‌شود.
-- توجه: نام، شماره و توضیحات مشتری به همان چت تلگرام ارسال می‌شود.
-- ============================================================
create extension if not exists pg_net;

insert into private.app_config (key, value) values
  ('telegram_bot_token', 'PASTE_BOT_TOKEN'),
  ('telegram_chat_id',   'PASTE_CHAT_ID')
on conflict (key) do update set value = excluded.value
  where private.app_config.value in ('PASTE_BOT_TOKEN', 'PASTE_CHAT_ID');

create or replace function private.notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text; c text; msg text;
begin
  select value into t from private.app_config where key = 'telegram_bot_token';
  select value into c from private.app_config where key = 'telegram_chat_id';
  if coalesce(t, '') in ('', 'PASTE_BOT_TOKEN') or coalesce(c, '') in ('', 'PASTE_CHAT_ID') then
    return new;
  end if;

  msg := E'📥 درخواست پروژهٔ جدید\n\n'
      || 'نام: '      || new.name    || E'\n'
      || 'تلفن: '     || new.phone   || E'\n'
      || 'نوع: '      || coalesce(new.service, '') || E'\n'
      || 'بودجه: '    || coalesce(nullif(new.budget, ''), 'مشخص نشده') || E'\n'
      || 'کد: '       || new.id      || E'\n\n'
      || left(coalesce(new.description, ''), 600);

  begin
    perform net.http_post(
      url     := 'https://api.telegram.org/bot' || t || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body    := jsonb_build_object('chat_id', c, 'text', msg)
    );
  exception when others then
    null;  -- هیچ‌وقت جلوی ثبت سفارش را نگیر
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_new_order on public.orders;
create trigger trg_notify_new_order
  after insert on public.orders
  for each row execute function private.notify_new_order();
