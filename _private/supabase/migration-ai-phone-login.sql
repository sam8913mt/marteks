-- ============================================================
-- Merteks AI — ورود دوباره با شماره‌ای که قبلاً ثبت شده (روی گوشی جدید یا بعد از نصب دوباره)
-- و نگه‌داشتن سهم مصرف روی «شماره»، نه فقط روی گوشی.
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: migration-ai-accounts.sql (جدول‌های ai_* و توابع ai_register/ai_status/ai_gate/ai_record).
--
-- قبل از این تغییر:
--   • هر شماره به اولین گوشی قفل بود (ai_accounts.device_id) و روی گوشی دیگر خطای «exists» می‌گرفت.
--   • سهم ماهانه فقط برای هر گوشی شمرده می‌شد (ai_device_tokens).
-- بعد از این تغییر:
--   • شمارهٔ ثبت‌شده روی هر گوشی وارد می‌شود و حساب به آخرین گوشی منتقل می‌شود (نام، مسدودی و سابقه همان می‌ماند).
--   • سهم ماهانه برای هر شماره هم شمرده می‌شود (ai_phone_tokens) و محدودیت = بیشترینِ مصرف شماره و مصرف گوشی؛
--     پس با عوض کردن گوشی یا نصب دوباره سهم صفر نمی‌شود، و ساختن شمارهٔ تازه روی همان گوشی هم سهم تازه نمی‌دهد.
--   • مصرف همین ماهِ هر حساب از گوشی‌اش به شماره منتقل می‌شود تا محدودیت فعلی کسی از بین نرود.
--   • کلید ai_device_lock در private.app_config: اگر 'true' شود، قفل قدیمی «هر شماره روی یک گوشی» برمی‌گردد.
--     روشن کردن:  insert into private.app_config (key, value) values ('ai_device_lock', 'true')
--                 on conflict (key) do update set value = excluded.value;
-- ============================================================
begin;

-- ---------- ۱) مصرف ماهانهٔ هر شماره ----------
create table if not exists public.ai_phone_tokens (
  phone  text    not null,
  period integer not null,
  used   integer not null default 0,
  primary key (phone, period)
);
alter table public.ai_phone_tokens enable row level security;
revoke all on public.ai_phone_tokens from anon, authenticated;
-- عمداً هیچ policy ای نیست: فقط توابع SECURITY DEFINER زیر به این جدول دسترسی دارند.

-- مصرف همین ماه: هر شماره دست‌کم به اندازهٔ مصرف گوشی‌اش (چیزی که تا امروز محدودیتش بود)
insert into public.ai_phone_tokens as p (phone, period, used)
select a.phone, private.ai_period(), t.used
  from public.ai_accounts a
  join public.ai_device_tokens t on t.device = a.device_id and t.period = private.ai_period()
 where a.device_id <> ''
on conflict (phone, period) do update set used = greatest(p.used, excluded.used);

-- ---------- ۲) توابع کمکی ----------
create or replace function private.ai_device_lock()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value from private.app_config where key = 'ai_device_lock'), 'false') = 'true';
$$;

create or replace function private.ai_phone_tokens_used(p_phone text)
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce((select t.used from public.ai_phone_tokens t
                    where t.phone = p_phone and t.period = private.ai_period()), 0)::integer;
$$;

-- مصرفی که با محدودیت مقایسه می‌شود: بیشترینِ مصرف شماره و مصرف گوشی
create or replace function private.ai_used(p_phone text, p_device text)
returns integer language sql stable security definer set search_path = '' as $$
  select greatest(private.ai_phone_tokens_used(p_phone), private.ai_tokens_used(p_device));
$$;

revoke all on function private.ai_device_lock() from public, anon, authenticated;
revoke all on function private.ai_phone_tokens_used(text) from public, anon, authenticated;
revoke all on function private.ai_used(text, text) from public, anon, authenticated;

-- ---------- ۳) وضعیت حساب (همان امضا؛ مصرف از شماره + گوشی) ----------
create or replace function private.ai_state(p_phone text, p_until timestamp with time zone, p_reason text, p_device text default ''::text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
      'ok', true,
      'enabled', private.ai_enabled(),
      'unit', 'tokens',
      'used', least(private.ai_used(p_phone, p_device), private.ai_limit()),
      'device_used', least(private.ai_used(p_phone, p_device), private.ai_limit()),
      'limit', private.ai_limit(),
      'resets', private.ai_reset_date()
    ) || private.ai_ban_json(p_until, p_reason);
$$;

-- ---------- ۴) ثبت‌نام / ورود ----------
create or replace function public.ai_register(p_phone text default ''::text, p_name text default ''::text, p_device text default ''::text, p_device_id text default ''::text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone   text := private.ai_phone(p_phone);
  v_name    text := private.clean(p_name, 40);
  v_dev     text := private.ai_devid(p_device_id);
  v_lock    boolean := private.ai_device_lock();
  v_owner   text;
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
    select a.device_id into v_owner from public.ai_accounts a where a.phone = v_phone for update;
    if v_lock and v_owner <> '' and v_dev <> '' and v_owner <> v_dev then
      return jsonb_build_object('ok', false, 'code', 'exists', 'enabled', private.ai_enabled());
    end if;
    -- بدون قفل: حساب (با همان نام، مسدودی و سهم مصرف) به این گوشی منتقل می‌شود
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

-- ---------- ۵) وضعیت پیش از هر پیام ----------
create or replace function public.ai_status(p_phone text default ''::text, p_device_id text default ''::text)
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
  update public.ai_accounts
     set last_seen = now(),
         device_id = case when v_dev <> '' and not v_lock then v_dev else device_id end
   where phone = v_phone
  returning banned_until, ban_reason, device_id into v_until, v_reason, v_owner;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'unknown', 'enabled', private.ai_enabled());
  end if;
  if v_lock and v_owner <> '' and v_dev <> '' and v_owner <> v_dev then
    return jsonb_build_object('ok', false, 'code', 'exists', 'enabled', private.ai_enabled());
  end if;
  return private.ai_state(v_phone, v_until, v_reason, v_dev);
end;
$$;

-- ---------- ۶) دروازهٔ پیام آنلاین (Edge Function ai-chat) ----------
create or replace function public.ai_gate(p_phone text, p_device text, p_ip text default ''::text, p_cost integer default 1)
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
  if v_owner = '' or (v_owner <> v_device and not private.ai_device_lock()) then
    -- حساب بدون گوشی، یا قفل خاموش: حساب به همین گوشی منتقل می‌شود
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

-- ---------- ۷) ثبت مصرف پس از پاسخ (روی گوشی و روی شماره) ----------
create or replace function public.ai_record(p_phone text, p_device text, p_input integer default 0, p_output integer default 0, p_cost integer default 1)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone  text := private.ai_phone(p_phone);
  v_device text := private.ai_devid(p_device);
  v_today  date := private.ai_today();
  v_cost   integer := least(greatest(coalesce(p_cost, 1), 1), 10);
  v_used   integer;
begin
  insert into public.ai_usage as u (phone, day, model, messages, input_tokens, output_tokens)
  values (v_phone, v_today, 'free', 1, greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0))
  on conflict (phone, day, model) do update
    set messages      = u.messages + 1,
        input_tokens  = u.input_tokens  + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens;
  if v_device <> '' then
    insert into public.ai_device_usage as d (device, day, messages) values (v_device, v_today, 1)
    on conflict (device, day) do update set messages = d.messages + 1;
    insert into public.ai_device_tokens as t (device, period, used) values (v_device, private.ai_period(), v_cost)
    on conflict (device, period) do update set used = t.used + excluded.used;
  end if;
  insert into public.ai_phone_tokens as pt (phone, period, used) values (v_phone, private.ai_period(), v_cost)
  on conflict (phone, period) do update set used = pt.used + excluded.used;
  update public.ai_accounts set last_seen = now() where phone = v_phone;
  v_used := least(private.ai_used(v_phone, v_device), private.ai_limit());
  return jsonb_build_object('ok', true, 'used', v_used, 'device_used', v_used, 'limit', private.ai_limit(),
                            'cost', v_cost, 'resets', private.ai_reset_date());
end;
$$;

-- ---------- ۸) پنل مدیر: سهم مصرف‌شدهٔ هر حساب از شماره + گوشی ----------
create or replace function public.admin_ai_accounts()
returns table(phone text, name text, device text, created_at timestamp with time zone, last_seen timestamp with time zone, banned_until timestamp with time zone, ban_reason text, tokens_today bigint, tokens_week bigint, tokens_month bigint, tokens_total bigint, messages_today bigint, messages_week bigint, messages_month bigint, credits_used integer, credits_limit integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_today date := private.ai_today();
  v_limit integer := private.ai_limit();
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select a.phone, a.name, a.device, a.created_at, a.last_seen, a.banned_until, a.ban_reason,
      coalesce(sum(u.input_tokens + u.output_tokens) filter (where u.day = v_today), 0)::bigint,
      coalesce(sum(u.input_tokens + u.output_tokens) filter (where u.day > v_today - 7), 0)::bigint,
      coalesce(sum(u.input_tokens + u.output_tokens) filter (where u.day > v_today - 30), 0)::bigint,
      coalesce(sum(u.input_tokens + u.output_tokens), 0)::bigint,
      coalesce(sum(u.messages) filter (where u.day = v_today), 0)::bigint,
      coalesce(sum(u.messages) filter (where u.day > v_today - 7), 0)::bigint,
      coalesce(sum(u.messages) filter (where u.day > v_today - 30), 0)::bigint,
      least(private.ai_used(a.phone, a.device_id), v_limit),
      v_limit
    from public.ai_accounts a
    left join public.ai_usage u on u.phone = a.phone
    group by a.phone
    order by a.last_seen desc;
end;
$$;

commit;

notify pgrst, 'reload schema';
