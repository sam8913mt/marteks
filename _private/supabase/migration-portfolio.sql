-- ============================================================
-- Merteks — افزودن «توضیح» و «لینک» به نمونه‌کارها
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- تا وقتی اجرا نشود، سایت و پنل مثل قبل کار می‌کنند (فقط بدون توضیح/لینک).
-- ============================================================
alter table public.projects add column if not exists description text;
alter table public.projects add column if not exists url text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_description_len') then
    alter table public.projects add constraint projects_description_len
      check (description is null or char_length(description) <= 300);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_url_http') then
    alter table public.projects add constraint projects_url_http
      check (url is null or (char_length(url) <= 300 and url ~* '^https?://'));
  end if;
end $$;
