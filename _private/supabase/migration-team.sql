-- ============================================================
-- Merteks — اعضای تیم (برای صفحهٔ «درباره ما» و تب «تیم» در پنل)
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: schema.sql (تابع public.is_admin و bucket به نام projects)
-- عکس اعضا در همان bucket با پیشوند team/ ذخیره می‌شود (نوشتن فقط برای مدیر).
-- ============================================================

-- ------------------------------------------------------------
-- 0) پیش‌نیاز: تابع is_admin (اگر قبلاً ساخته شده باشد، فقط جایگزین می‌شود)
--    ایمیل مدیر باید دقیقاً همان ایمیل کاربری باشد که در Supabase > Authentication > Users ساخته‌ای.
--    اگر پایین‌تر «CHANGE-ME@example.com» ثبت شد، بعد از اجرا این را با ایمیل خودت اجرا کن:
--      update private.app_config set value = 'ایمیل-تو@example.com' where key = 'admin_email';
-- ------------------------------------------------------------
create schema if not exists private;
create table if not exists private.app_config (key text primary key, value text not null);
insert into private.app_config (key, value) values ('admin_email', 'CHANGE-ME@example.com')
on conflict (key) do nothing;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    lower(auth.jwt() ->> 'email') =
      lower((select value from private.app_config where key = 'admin_email')),
    false
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  role       text not null default '' check (char_length(role) <= 80),
  bio        text not null default '' check (char_length(bio) <= 400),
  photo_key  text check (photo_key is null or (char_length(photo_key) <= 200 and photo_key like 'team/%')),
  link       text check (link is null or (char_length(link) <= 300 and link ~* '^https?://')),
  pos        integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists team_members_pos_idx on public.team_members (pos, created_at);

alter table public.team_members enable row level security;

revoke insert, update, delete on public.team_members from anon;
grant  select on public.team_members to anon, authenticated;
-- نوشتن فقط برای کاربر واردشده؛ policy پایین فقط مدیر را عبور می‌دهد.
-- (در پروژه‌های جدید Supabase این مجوز خودکار داده نمی‌شود؛ بدون آن ویرایش/افزودن/حذف خطای permission denied می‌دهد)
grant  insert, update, delete on public.team_members to authenticated;

drop policy if exists "public can read team" on public.team_members;
create policy "public can read team" on public.team_members
  for select to anon, authenticated using (true);

drop policy if exists "admin manages team" on public.team_members;
create policy "admin manages team" on public.team_members
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- مقدار اولیه: دو عضو فعلی (فقط اگر جدول خالی باشد)
insert into public.team_members (name, role, pos)
select v.name, v.role, v.pos
from (values ('محمدسام', 'عضو تیم مرتکس', 0), ('مهدی', 'عضو تیم مرتکس', 1)) as v(name, role, pos)
where not exists (select 1 from public.team_members);

notify pgrst, 'reload schema';
