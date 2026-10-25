-- ============================================================
-- Merteks — ورود و ثبت‌نام با «شماره + رمز» برای اپ Merteks AI و سایت گروه مرتکس
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: migration-ai-accounts.sql و migration-ai-phone-login.sql.
--
--   • یک حساب مشترک برای اپ و سایت: همان public.ai_accounts (کلید: شمارهٔ موبایل).
--   • ثبت‌نام: شماره + نام + رمز  (ai_signup)       ورود: شماره + رمز  (ai_login)
--   • رمز فقط به‌صورت bcrypt ذخیره می‌شود (pgcrypto). پس از ورود یک توکن نشست تصادفی
--     برمی‌گردد که فقط هش sha256 آن در public.ai_sessions نگه‌داری می‌شود (۱۸۰ روز بی‌استفاده = منقضی).
--   • حساب قدیمی بدون رمز: اولین «ثبت‌نام» با همان شماره رمز را روی همان حساب می‌گذارد
--     (نام، سهم مصرف، مسدودی و سابقه می‌ماند). تا آن موقع نسخه‌های قدیمی اپ مثل قبل کار می‌کنند.
--   • حساب رمزدار: ai_status / ai_gate فقط با توکن معتبر همان شماره جواب می‌دهند (کد 'auth').
--
-- فراموشی رمز (از طریق پشتیبانی): رمز آن شماره را پاک کنید تا کاربر با «ثبت‌نام» رمز تازه بسازد:
--   update public.ai_accounts set password_hash = '' where phone = '09XXXXXXXXX';
--   delete from public.ai_sessions where phone = '09XXXXXXXXX';
-- ============================================================
begin;

create extension if not exists pgcrypto with schema extensions;

-- ---------- ۱) جدول‌ها ----------
alter table public.ai_accounts add column if not exists password_hash text not null default '';

create table if not exists public.ai_sessions (
  token_hash text primary key,
  phone      text not null references public.ai_accounts (phone) on delete cascade,
  device     text not null default '',
  created_at timestamptz not null default now(),
  last_used  timestamptz not null default now()
);
create index if not exists ai_sessions_phone_idx on public.ai_sessions (phone);
alter table public.ai_sessions enable row level security;
revoke all on public.ai_sessions from anon, authenticated;
-- عمداً هیچ policy ای نیست: فقط توابع SECURITY DEFINER زیر به این جدول دسترسی دارند.

-- ---------- ۲) توابع کمکی ----------
-- قانون رمز (همان قانون فرم‌ها): ۸ تا ۷۲ نویسه، هم حرف و هم عدد. '' یعنی مشکلی نیست.
create or replace function private.ai_pw_problem(p text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p is null or char_length(p) < 8 then 'short'
    when char_length(p) > 72 then 'long'
    when p !~ '[A-Za-zء-يپچژکگی]'
      or p !~ '[0-9۰-۹٠-٩]' then 'weak'
    else '' end;
$$;

create or replace function private.ai_token_hash(p text)
returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(coalesce(p, ''), 'sha256'), 'hex');
$$;

create or replace function private.ai_new_session(p_phone text, p_device text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  delete from public.ai_sessions where phone = p_phone and last_used < now() - interval '180 days';
  insert into public.ai_sessions (token_hash, phone, device)
  values (private.ai_token_hash(v_token), p_phone, private.clean(p_device, 120));
  return v_token;
end $$;

-- شمارهٔ صاحب یک توکن معتبر (یا null)؛ زمان آخرین استفاده را هم به‌روز می‌کند
create or replace function private.ai_session_phone(p_token text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_phone text;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  update public.ai_sessions set last_used = now()
   where token_hash = private.ai_token_hash(p_token) and last_used > now() - interval '180 days'
  returning phone into v_phone;
  return v_phone;
end $$;

-- حساب بدون رمز: مجاز (سازگاری با نسخه‌های قدیمی اپ). حساب رمزدار: فقط با توکن همان شماره.
create or replace function private.ai_authorized(p_phone text, p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
begin
  select a.password_hash into v_hash from public.ai_accounts a where a.phone = p_phone;
  if not found then
    return false;
  end if;
  if v_hash = '' then
    return true;
  end if;
  return private.ai_session_phone(p_token) is not distinct from p_phone;
end $$;

revoke all on function private.ai_pw_problem(text) from public, anon, authenticated;
revoke all on function private.ai_token_hash(text) from public, anon, authenticated;
revoke all on function private.ai_new_session(text, text) from public, anon, authenticated;
revoke all on function private.ai_session_phone(text) from public, anon, authenticated;
revoke all on function private.ai_authorized(text, text) from public, anon, authenticated;

-- ---------- ۳) ثبت‌نام ----------
create or replace function public.ai_signup(p_phone text default ''::text, p_name text default ''::text, p_password text default ''::text, p_device text default ''::text, p_device_id text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone   text := private.ai_phone(p_phone);
  v_name    text := private.clean(p_name, 40);
  v_dev     text := private.ai_devid(p_device_id);
  v_problem text := private.ai_pw_problem(p_password);
  v_hash    text;
  v_real    text;
  v_until   timestamptz;
  v_reason  text;
  v_existed boolean := false;
begin
  if not private.hit('aisignup', 60, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if v_phone !~ '^09[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid_phone');
  end if;
  if char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  if v_problem <> '' then
    return jsonb_build_object('ok', false, 'code', 'weak_password', 'reason', v_problem);
  end if;

  insert into public.ai_accounts as a (phone, name, device, device_id, password_hash)
  values (v_phone, v_name, private.clean(p_device, 120), v_dev, extensions.crypt(p_password, extensions.gen_salt('bf', 10)))
  on conflict (phone) do nothing
  returning a.name, a.banned_until, a.ban_reason into v_real, v_until, v_reason;
  if not found then
    select a.password_hash into v_hash from public.ai_accounts a where a.phone = v_phone for update;
    if v_hash <> '' then
      return jsonb_build_object('ok', false, 'code', 'registered');
    end if;
    -- حساب قدیمی بدون رمز: رمز روی همان حساب (نام، سهم و سابقه همان می‌ماند)
    update public.ai_accounts a
       set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
           last_seen     = now(),
           device        = private.clean(p_device, 120),
           device_id     = case when v_dev <> '' and (not private.ai_device_lock() or a.device_id = '') then v_dev else a.device_id end
     where a.phone = v_phone
    returning a.name, a.banned_until, a.ban_reason into v_real, v_until, v_reason;
    v_existed := true;
  end if;

  return private.ai_state(v_phone, v_until, v_reason, v_dev)
      || jsonb_build_object('existed', v_existed, 'name', v_real, 'phone', v_phone,
                            'token', private.ai_new_session(v_phone, p_device));
end $$;

-- ---------- ۴) ورود ----------
create or replace function public.ai_login(p_phone text default ''::text, p_password text default ''::text, p_device text default ''::text, p_device_id text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone  text := private.ai_phone(p_phone);
  v_dev    text := private.ai_devid(p_device_id);
  v_hash   text;
  v_real   text;
  v_until  timestamptz;
  v_reason text;
begin
  if not private.hit('ailogin', 300, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if v_phone !~ '^09[0-9]{9}$' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'code', 'bad_credentials');
  end if;
  -- حدس زدن رمز یک شماره: حداکثر ۱۰ تلاش در ۱۵ دقیقه
  if not private.hit_key('ailogin:' || v_phone, 10, 900) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  select a.password_hash into v_hash from public.ai_accounts a where a.phone = v_phone;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'bad_credentials');
  end if;
  if v_hash = '' then
    -- حساب قدیمی: هنوز رمز ندارد؛ باید یک بار «ثبت‌نام» کند
    return jsonb_build_object('ok', false, 'code', 'no_password');
  end if;
  if extensions.crypt(p_password, v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'code', 'bad_credentials');
  end if;

  update public.ai_accounts a
     set last_seen = now(),
         device    = case when coalesce(p_device, '') <> '' then private.clean(p_device, 120) else a.device end,
         device_id = case when v_dev <> '' and (not private.ai_device_lock() or a.device_id = '') then v_dev else a.device_id end
   where a.phone = v_phone
  returning a.name, a.banned_until, a.ban_reason into v_real, v_until, v_reason;

  return private.ai_state(v_phone, v_until, v_reason, v_dev)
      || jsonb_build_object('existed', true, 'name', v_real, 'phone', v_phone,
                            'token', private.ai_new_session(v_phone, p_device));
end $$;

-- ---------- ۵) خروج، اطلاعات حساب، تغییر نام و رمز ----------
create or replace function public.ai_logout(p_token text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  delete from public.ai_sessions where token_hash = private.ai_token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.ai_me(p_token text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.ai_session_phone(p_token);
  r       record;
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'code', 'auth');
  end if;
  select a.name, a.phone, a.created_at, a.banned_until, a.ban_reason into r from public.ai_accounts a where a.phone = v_phone;
  return jsonb_build_object('ok', true, 'name', r.name, 'phone', r.phone, 'created_at', r.created_at)
      || private.ai_ban_json(r.banned_until, r.ban_reason);
end $$;

create or replace function public.ai_update_name(p_token text default ''::text, p_name text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := private.ai_session_phone(p_token);
  v_name  text := private.clean(p_name, 40);
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'code', 'auth');
  end if;
  if char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid_name');
  end if;
  update public.ai_accounts set name = v_name where phone = v_phone;
  return jsonb_build_object('ok', true, 'name', v_name);
end $$;

create or replace function public.ai_change_password(p_token text default ''::text, p_old text default ''::text, p_new text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone   text := private.ai_session_phone(p_token);
  v_hash    text;
  v_problem text := private.ai_pw_problem(p_new);
begin
  if v_phone is null then
    return jsonb_build_object('ok', false, 'code', 'auth');
  end if;
  if not private.hit_key('aipw:' || v_phone, 10, 900) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  select a.password_hash into v_hash from public.ai_accounts a where a.phone = v_phone for update;
  if v_hash = '' or extensions.crypt(coalesce(p_old, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'code', 'bad_credentials');
  end if;
  if v_problem <> '' then
    return jsonb_build_object('ok', false, 'code', 'weak_password', 'reason', v_problem);
  end if;
  update public.ai_accounts set password_hash = extensions.crypt(p_new, extensions.gen_salt('bf', 10)) where phone = v_phone;
  -- نشست‌های دیگر (مثلاً گوشی گم‌شده) بسته می‌شوند؛ همین نشست می‌ماند
  delete from public.ai_sessions where phone = v_phone and token_hash <> private.ai_token_hash(p_token);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- ۶) نسخه‌های قدیمی اپ: حساب رمزدار با ai_register وارد نمی‌شود ----------
create or replace function public.ai_register(p_phone text default ''::text, p_name text default ''::text, p_device text default ''::text, p_device_id text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone   text := private.ai_phone(p_phone);
  v_name    text := private.clean(p_name, 40);
  v_dev     text := private.ai_devid(p_device_id);
  v_lock    boolean := private.ai_device_lock();
  v_owner   text;
  v_hash    text;
  v_real    text;
  v_until   timestamptz;
  v_reason  text;
  v_existed boolean := true;
begin
  if not private.hit('aireg', 60, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if v_phone !~ '^09[0-9]{9}$' or char_length(v_name) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid');
  end if;

  insert into public.ai_accounts as a (phone, name, device, device_id)
  values (v_phone, v_name, private.clean(p_device, 120), v_dev)
  on conflict (phone) do nothing
  returning a.name, a.banned_until, a.ban_reason into v_real, v_until, v_reason;
  if found then
    v_existed := false;
  else
    select a.device_id, a.password_hash into v_owner, v_hash from public.ai_accounts a where a.phone = v_phone for update;
    if v_hash <> '' then
      return jsonb_build_object('ok', false, 'code', 'password_required', 'enabled', private.ai_enabled());
    end if;
    if v_lock and v_owner <> '' and v_dev <> '' and v_owner <> v_dev then
      return jsonb_build_object('ok', false, 'code', 'exists', 'enabled', private.ai_enabled());
    end if;
    update public.ai_accounts a
       set last_seen = now(),
           device    = private.clean(p_device, 120),
           device_id = case when v_dev <> '' and (not v_lock or a.device_id = '') then v_dev else a.device_id end
     where a.phone = v_phone
    returning a.name, a.banned_until, a.ban_reason into v_real, v_until, v_reason;
  end if;

  return private.ai_state(v_phone, v_until, v_reason, v_dev)
      || jsonb_build_object('existed', v_existed, 'name', v_real);
end;
$$;

-- ---------- ۷) وضعیت پیش از هر پیام (+ توکن) ----------
drop function if exists public.ai_status(text, text);
create or replace function public.ai_status(p_phone text default ''::text, p_device_id text default ''::text, p_token text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone  text := private.ai_phone(p_phone);
  v_dev    text := private.ai_devid(p_device_id);
  v_lock   boolean := private.ai_device_lock();
  v_owner  text;
  v_until  timestamptz;
  v_reason text;
begin
  if not private.hit('aistatus', 600, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited');
  end if;
  if not exists (select 1 from public.ai_accounts where phone = v_phone) then
    return jsonb_build_object('ok', false, 'code', 'unknown', 'enabled', private.ai_enabled());
  end if;
  if not private.ai_authorized(v_phone, p_token) then
    return jsonb_build_object('ok', false, 'code', 'auth', 'enabled', private.ai_enabled());
  end if;
  update public.ai_accounts
     set last_seen = now(),
         device_id = case when v_dev <> '' and not v_lock then v_dev else device_id end
   where phone = v_phone
  returning banned_until, ban_reason, device_id into v_until, v_reason, v_owner;
  if v_lock and v_owner <> '' and v_dev <> '' and v_owner <> v_dev then
    return jsonb_build_object('ok', false, 'code', 'exists', 'enabled', private.ai_enabled());
  end if;
  return private.ai_state(v_phone, v_until, v_reason, v_dev);
end;
$$;

-- ---------- ۸) دروازهٔ پیام آنلاین (Edge Function ai-chat) (+ توکن) ----------
drop function if exists public.ai_gate(text, text, text, integer);
create or replace function public.ai_gate(p_phone text, p_device text, p_ip text default ''::text, p_cost integer default 1, p_token text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone  text := private.ai_phone(p_phone);
  v_device text := private.ai_devid(p_device);
  v_cost   integer := least(greatest(coalesce(p_cost, 1), 1), 10);
  v_limit  integer := private.ai_limit();
  v_name   text;
  v_owner  text;
  v_until  timestamptz;
  v_reason text;
  v_used   integer;
begin
  if not private.ai_enabled() then
    return jsonb_build_object('ok', false, 'code', 'disabled');
  end if;
  -- one IP can't hammer the service, whatever numbers it invents
  if not private.hit_key('aichat:' || md5(coalesce(nullif(p_ip, ''), 'unknown')), 60, 3600) then
    return jsonb_build_object('ok', false, 'code', 'busy');
  end if;
  if v_device = '' then
    return jsonb_build_object('ok', false, 'code', 'bad_request');
  end if;
  select a.name, a.device_id, a.banned_until, a.ban_reason into v_name, v_owner, v_until, v_reason
    from public.ai_accounts a where a.phone = v_phone;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unknown');
  end if;
  if not private.ai_authorized(v_phone, p_token) then
    return jsonb_build_object('ok', false, 'code', 'auth');
  end if;
  if v_owner = '' or (v_owner <> v_device and not private.ai_device_lock()) then
    update public.ai_accounts set device_id = v_device where phone = v_phone;
  elsif v_owner <> v_device then
    return jsonb_build_object('ok', false, 'code', 'exists');
  end if;
  if v_until > now() then
    return jsonb_build_object('ok', false, 'code', 'banned') || private.ai_ban_json(v_until, v_reason);
  end if;
  v_used := least(private.ai_used(v_phone, v_device), v_limit);
  if v_used >= v_limit then
    return jsonb_build_object('ok', false, 'code', 'limit', 'used', v_limit, 'device_used', v_limit,
                              'limit', v_limit, 'resets', private.ai_reset_date());
  end if;
  if v_used + v_cost > v_limit then
    return jsonb_build_object('ok', false, 'code', 'tokens', 'cost', v_cost, 'used', v_used, 'device_used', v_used,
                              'limit', v_limit, 'resets', private.ai_reset_date());
  end if;
  return jsonb_build_object('ok', true, 'name', v_name, 'used', v_used, 'limit', v_limit, 'cost', v_cost);
end;
$$;

-- ai_gate فقط از Edge Function (service_role) صدا زده می‌شود؛ ai_status از خود اپ (کلید عمومی)
revoke all on function public.ai_gate(text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.ai_gate(text, text, text, integer, text) to service_role;
grant execute on function public.ai_status(text, text, text) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
