-- ============================================================
-- Merteks — مدیریت کاربران در پنل ادمین
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: schema.sql (تابع public.is_admin) و migration-auth.sql (جدول profiles).
--
-- اصول این مهاجرت:
--  • «وضعیت حساب» و «آخرین ورود» ستون جدید در profiles نمی‌گیرند؛ منبع واقعی همان
--    auth.users است (banned_until و last_sign_in_at) تا اطلاعات تکراری و ناسازگار نداشته باشیم.
--  • «تأیید ایمیل» هم فقط از auth.users.email_confirmed_at خوانده می‌شود؛ هیچ ستونی در
--    profiles وجود ندارد که با ویرایش دستی، ایمیل را «تأییدشده» جلوه دهد.
--  • نقش مدیر همچنان فقط با ایمیل ثبت‌شده در private.app_config شناخته می‌شود (is_admin()).
--  • همهٔ عملیات مدیریتی از طریق Edge Function (admin-users) با service_role انجام می‌شود؛
--    مرورگر هیچ دسترسی مستقیمی برای نوشتن روی جدول‌های کاربران ندارد.
-- ============================================================
create schema if not exists private;

-- ------------------------------------------------------------
-- ۱) گزارش عملیات مدیریتی (فقط‌افزودنی و غیرقابل ویرایش)
-- ------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  admin_id       uuid        not null,
  admin_email    text        not null check (char_length(admin_email) <= 254),
  action         text        not null
                 check (action in ('update_profile', 'disable_user', 'enable_user', 'delete_user', 'export_users')),
  target_user_id uuid,                       -- عمداً بدون FK: بعد از حذف کاربر هم گزارش می‌ماند
  target_email   text        check (target_email is null or char_length(target_email) <= 254),
  details        jsonb       not null default '{}'::jsonb,
  ip             text        check (ip is null or char_length(ip) <= 64)
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx  on public.admin_audit_log (target_user_id, created_at desc);
create index if not exists admin_audit_log_admin_idx   on public.admin_audit_log (admin_id, created_at desc);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from anon, authenticated;
grant  select on public.admin_audit_log to authenticated;      -- فقط با policy پایین (مدیر)
grant  select, insert on public.admin_audit_log to service_role;

drop policy if exists "admin reads audit log" on public.admin_audit_log;
create policy "admin reads audit log" on public.admin_audit_log
  for select to authenticated using (public.is_admin());
-- عمداً policy برای insert/update/delete نیست: نوشتن فقط توسط Edge Function (service_role).

-- گزارش قابل تغییر یا پاک شدن نباشد (حتی برای service_role)
create or replace function private.audit_log_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'admin_audit_log is append-only';
end $$;

drop trigger if exists audit_log_no_update_delete on public.admin_audit_log;
create trigger audit_log_no_update_delete
  before update or delete on public.admin_audit_log
  for each row execute function private.audit_log_append_only();

drop trigger if exists audit_log_no_truncate on public.admin_audit_log;
create trigger audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function private.audit_log_append_only();

-- ------------------------------------------------------------
-- ۲) حساب غیرفعال به‌صورت واقعی دسترسی نداشته باشد
--    (ban در Supabase Auth ورود و تمدید نشست را می‌بندد؛ این policy کمک می‌کند
--     access token هنوز معتبرِ کاربر غیرفعال هم به پروفایل دسترسی نداشته باشد.)
-- ------------------------------------------------------------
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from auth.users u
    where u.id = (select auth.uid())
      and u.banned_until is not null
      and u.banned_until > now()
  );
$$;

revoke execute on function public.is_active_user() from public, anon;
grant  execute on function public.is_active_user() to authenticated;

drop policy if exists "active users only" on public.profiles;
create policy "active users only" on public.profiles
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- ------------------------------------------------------------
-- ۳) قطع همهٔ نشست‌های یک کاربر (فقط برای Edge Function با service_role)
-- ------------------------------------------------------------
create or replace function public.admin_revoke_sessions(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer := 0;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  delete from auth.refresh_tokens where user_id::text = p_user::text;
  return n;
end $$;

revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant  execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ------------------------------------------------------------
-- ۴) همگام‌ماندن ایمیل پروفایل با Supabase Auth (پس از تغییر امن ایمیل توسط کاربر)
--    ایمیل در پنل همیشه از auth.users خوانده می‌شود؛ این فقط برای یکتایی/سازگاری است.
-- ------------------------------------------------------------
create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'sync_profile_email failed for %: %', new.id, sqlerrm;
  return new;
end $$;

revoke all on function private.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function private.sync_profile_email();

-- ------------------------------------------------------------
-- ۵) سازگاری با کاربران قبلی: کاربرِ تأییدشده‌ای که پروفایل ندارد، پروفایل می‌گیرد.
--    اطلاعات موجود هرگز بازنویسی نمی‌شوند (on conflict do nothing).
-- ------------------------------------------------------------
do $$
declare
  r  record;
  fn text;
  ln text;
  ph text;
begin
  for r in
    select u.id, u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb) as m
    from auth.users u
    where u.email_confirmed_at is not null
      and u.email is not null
      and not exists (select 1 from public.profiles p where p.id = u.id)
  loop
    fn := nullif(left(btrim(coalesce(r.m ->> 'first_name', '')), 60), '');
    ln := nullif(left(btrim(coalesce(r.m ->> 'last_name',  '')), 60), '');
    ph := nullif(btrim(coalesce(r.m ->> 'phone', '')), '');
    if ph is not null and ph !~ '^09[0-9]{9}$' then ph := null; end if;
    begin
      insert into public.profiles (id, first_name, last_name, phone, email)
      values (r.id, fn, ln, ph, lower(r.email))
      on conflict do nothing;
    exception when unique_violation then
      -- شمارهٔ تکراری: پروفایل بدون شماره ساخته می‌شود
      insert into public.profiles (id, first_name, last_name, phone, email)
      values (r.id, fn, ln, null, lower(r.email))
      on conflict do nothing;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
