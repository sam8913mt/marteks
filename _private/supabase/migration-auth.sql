-- ============================================================
-- Merteks — ورود و ثبت‌نام کاربران (جدول profiles + RLS + Trigger)
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: schema.sql (schema خصوصی private و تابع public.is_admin).
--
-- نکته‌های امنیتی:
--  • رمز عبور فقط داخل Supabase Auth نگه‌داری می‌شود؛ در profiles نیست.
--  • پروفایل فقط «پس از تأیید ایمیل» ساخته می‌شود (Trigger روی auth.users).
--  • هر کاربر فقط پروفایل خودش را می‌خواند و فقط نام/نام‌خانوادگی/تلفن را ویرایش می‌کند.
--  • ثبت‌نام عادی هیچ دسترسی مدیریتی نمی‌دهد: مدیر فقط با ایمیل ثبت‌شده در
--    private.app_config (کلید admin_email) شناخته می‌شود و همهٔ policyهای مدیریتی به is_admin() وابسته‌اند.
-- ============================================================
create schema if not exists private;

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  first_name text check (first_name is null or char_length(first_name) between 1 and 60),
  last_name  text check (last_name  is null or char_length(last_name)  between 1 and 60),
  phone      text check (phone is null or phone ~ '^09[0-9]{9}$'),
  email      text check (email is null or char_length(email) <= 254),
  profile_complete boolean generated always as
    (first_name is not null and last_name is not null and phone is not null) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- جلوگیری از داده‌های تکراری (ایمیل و شماره تماس)
create unique index if not exists profiles_email_key on public.profiles (lower(email)) where email is not null;
create unique index if not exists profiles_phone_key on public.profiles (phone) where phone is not null;

-- ---------- RLS ----------
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant  select on public.profiles to authenticated;
grant  update (first_name, last_name, phone) on public.profiles to authenticated;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- عمداً policy برای insert/delete نیست: ساخت پروفایل فقط توسط Trigger انجام می‌شود.

-- ---------- updated_at ----------
create or replace function private.touch_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_profile();

-- ---------- ساخت پروفایل بعد از تأیید ایمیل ----------
create or replace function private.handle_confirmed_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  fn text  := nullif(left(btrim(coalesce(m ->> 'first_name', '')), 60), '');
  ln text  := nullif(left(btrim(coalesce(m ->> 'last_name',  '')), 60), '');
  ph text  := nullif(btrim(coalesce(m ->> 'phone', '')), '');
begin
  if new.email_confirmed_at is null then
    return new;                       -- تا ایمیل تأیید نشده پروفایلی ساخته نمی‌شود
  end if;
  if ph is not null and ph !~ '^09[0-9]{9}$' then ph := null; end if;

  begin
    insert into public.profiles (id, first_name, last_name, phone, email)
    values (new.id, fn, ln, ph, lower(new.email))
    on conflict (id) do update set email = excluded.email;
  exception when unique_violation then
    -- شمارهٔ تماس قبلاً برای حساب دیگری ثبت شده؛ تأیید ایمیل نباید خراب شود.
    -- پروفایل بدون شماره ساخته می‌شود و کاربر در صفحهٔ حساب شمارهٔ دیگری وارد می‌کند.
    insert into public.profiles (id, first_name, last_name, phone, email)
    values (new.id, fn, ln, null, lower(new.email))
    on conflict do nothing;
  end;
  return new;
exception when others then
  raise warning 'handle_confirmed_user failed for %: %', new.id, sqlerrm;
  return new;
end $$;

revoke all on function private.handle_confirmed_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_confirmed_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function private.handle_confirmed_user();

notify pgrst, 'reload schema';
