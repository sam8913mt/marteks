-- =====================================================================
-- MERTEKS — Supabase schema (Postgres)
-- Paste ALL of this into  Supabase > SQL Editor > New query  and press Run.
-- Safe to run again: everything uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Private area (not reachable from the public API)
-- ---------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);

-- >>> The ONLY admin account. Must be exactly the e-mail of the user you
-- >>> created in Authentication > Users.
-- >>> Replace CHANGE-ME@example.com with that e-mail BEFORE the first run
-- >>> (do not commit your real e-mail to a public repository).
-- >>> Re-running this file never overwrites an existing value. To change the
-- >>> admin later run:  update private.app_config set value = 'new@mail.com' where key = 'admin_email';
insert into private.app_config (key, value)
values ('admin_email', 'CHANGE-ME@example.com')
on conflict (key) do nothing;

create table if not exists private.rate_limits (
  k  text primary key,
  ws timestamptz not null,
  c  integer not null
);

-- ---------------------------------------------------------------------
-- 1) Tables
-- ---------------------------------------------------------------------
create table if not exists public.orders (
  id          text primary key,
  created_at  timestamptz not null default now(),
  name        text not null,
  phone       text not null,
  service     text not null default '',
  budget      text not null default '',
  description text not null,
  status      text not null default 'جدید'
              check (status in ('جدید','در حال بررسی','در حال انجام','انجام شد','لغو شد'))
);
create index if not exists orders_created_idx on public.orders (created_at desc);

create table if not exists public.chats (
  rid      bigint generated always as identity primary key,
  chat_id  text not null,
  name     text not null default '',
  phone    text not null default '',
  device   text not null default '',
  question text not null default '',
  answer   text not null default '',
  at       timestamptz not null default now(),
  type     text not null default 'message',
  mid      text unique
);
create index if not exists chats_chat_idx on public.chats (chat_id);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now()
);

-- توضیح کوتاه و لینک نمونه‌کار (برای نصب‌های قبلی: migration-portfolio.sql)
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

create table if not exists public.project_images (
  rid        bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  pos        integer not null check (pos between 0 and 29),
  key        text not null,
  unique (project_id, pos)
);

-- ---------------------------------------------------------------------
-- 2) Helper functions
-- ---------------------------------------------------------------------

-- true only for the admin account (checked from the signed-in user's JWT)
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

-- trims, removes control characters, limits length
create or replace function private.clean(p_val text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(
    left(regexp_replace(coalesce(p_val, ''), '[\x01-\x08\x0B\x0C\x0E-\x1F]', '', 'g'), p_max),
    E' \t\r\n'
  );
$$;

-- per-IP rate limit. Returns true while the caller is still under the limit.
create or replace function private.hit(p_bucket text, p_max integer, p_window_secs integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers text;
  v_ip      text;
  v_key     text;
  v_cnt     integer;
begin
  v_headers := nullif(current_setting('request.headers', true), '');
  if v_headers is not null then
    v_ip := coalesce(
      nullif(v_headers::json ->> 'cf-connecting-ip', ''),
      trim(split_part(coalesce(v_headers::json ->> 'x-forwarded-for', ''), ',', 1))
    );
  end if;

  v_key := p_bucket || ':' || md5(coalesce(nullif(v_ip, ''), 'unknown'));

  insert into private.rate_limits as r (k, ws, c)
  values (v_key, now(), 1)
  on conflict (k) do update set
    c  = case when r.ws <= now() - make_interval(secs => p_window_secs) then 1   else r.c + 1 end,
    ws = case when r.ws <= now() - make_interval(secs => p_window_secs) then now() else r.ws    end
  returning c into v_cnt;

  -- occasional housekeeping
  if random() < 0.02 then
    delete from private.rate_limits where ws < now() - interval '1 day';
  end if;

  return v_cnt <= p_max;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Public entry points (the ONLY way anonymous visitors can write)
-- ---------------------------------------------------------------------

create or replace function public.create_order(
  p_id          text default '',
  p_name        text default '',
  p_phone       text default '',
  p_service     text default '',
  p_budget      text default '',
  p_description text default '',
  p_website     text default ''          -- honeypot: real users leave it empty
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      text;
  v_name    text := private.clean(p_name, 120);
  v_phone   text := translate(private.clean(p_phone, 40),
                              '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
  v_service text := private.clean(p_service, 120);
  v_budget  text := private.clean(p_budget, 80);
  v_desc    text := private.clean(p_description, 5000);
begin
  if coalesce(p_website, '') <> '' then
    return jsonb_build_object('ok', true, 'id', 'ORD-OK');
  end if;

  if not private.hit('order', 10, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
      'error', 'درخواست‌های شما زیاد است؛ کمی بعد دوباره تلاش کنید');
  end if;

  if v_name = '' or v_phone = '' or v_desc = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'فیلدهای الزامی کامل نیست');
  end if;
  if v_phone !~ '^09[0-9]{9}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'شمارهٔ تماس معتبر نیست');
  end if;

  if coalesce(p_id, '') ~ '^[A-Za-z0-9_-]{3,100}$' then
    v_id := p_id;
  else
    v_id := 'ORD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  end if;

  -- same id twice (a retried request) => stored once
  insert into public.orders (id, name, phone, service, budget, description)
  values (v_id, v_name, v_phone, v_service, v_budget, v_desc)
  on conflict (id) do nothing;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.chat_start(
  p_id    text default '',
  p_name  text default '',
  p_phone text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := private.clean(p_name, 120);
  v_phone text := translate(private.clean(p_phone, 40),
                            '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
begin
  if not private.hit('chatstart', 30, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited', 'error', 'درخواست‌ها زیاد است');
  end if;
  if coalesce(p_id, '') !~ '^[A-Za-z0-9_-]{3,100}$' or v_name = '' or v_phone = '' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'اطلاعات گفتگو کامل نیست');
  end if;

  insert into public.chats (chat_id, name, phone, type)
  values (p_id, v_name, v_phone, 'start');

  return jsonb_build_object('ok', true, 'id', p_id);
end;
$$;

create or replace function public.chat_message(
  p_chat_id  text default '',
  p_name     text default '',
  p_phone    text default '',
  p_device   text default '',
  p_question text default '',
  p_answer   text default '',
  p_mid      text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mid text := case when coalesce(p_mid, '') ~ '^[A-Za-z0-9_-]{3,100}$' then p_mid else null end;
begin
  if not private.hit('chatmsg', 300, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited', 'error', 'درخواست‌ها زیاد است');
  end if;
  if coalesce(p_chat_id, '') !~ '^[A-Za-z0-9_-]{3,100}$' then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'شناسه گفتگو نامعتبر است');
  end if;

  insert into public.chats (chat_id, name, phone, device, question, answer, type, mid)
  values (
    p_chat_id,
    private.clean(p_name, 120),
    translate(private.clean(p_phone, 40), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'),
    private.clean(p_device, 200),
    private.clean(p_question, 5000),
    private.clean(p_answer, 10000),
    'message',
    v_mid
  )
  on conflict (mid) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.create_order(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.chat_start(text, text, text) to anon, authenticated;
grant execute on function public.chat_message(text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) Row Level Security
-- ---------------------------------------------------------------------
alter table public.orders         enable row level security;
alter table public.chats          enable row level security;
alter table public.projects       enable row level security;
alter table public.project_images enable row level security;

-- visitors cannot touch orders / chats directly at all
revoke all on public.orders from anon;
revoke all on public.chats  from anon;
-- visitors may only READ the gallery
revoke insert, update, delete on public.projects       from anon;
revoke insert, update, delete on public.project_images from anon;

drop policy if exists "admin full access" on public.orders;
create policy "admin full access" on public.orders
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin full access" on public.chats;
create policy "admin full access" on public.chats
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can read projects" on public.projects;
create policy "public can read projects" on public.projects
  for select to anon, authenticated using (true);

drop policy if exists "admin manages projects" on public.projects;
create policy "admin manages projects" on public.projects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public can read project images" on public.project_images;
create policy "public can read project images" on public.project_images
  for select to anon, authenticated using (true);

drop policy if exists "admin manages project images" on public.project_images;
create policy "admin manages project images" on public.project_images
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 5) Storage bucket for project photos (public read, admin-only write)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('projects', 'projects', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin manages project photos" on storage.objects;
create policy "admin manages project photos" on storage.objects
  for all to authenticated
  using      (bucket_id = 'projects' and public.is_admin())
  with check (bucket_id = 'projects' and public.is_admin());

-- ---------------------------------------------------------------------
-- 6) Project comments (نظرات نمونه‌کارها)
-- ---------------------------------------------------------------------

create table if not exists public.project_comments (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  body       text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz not null default now(),
  status     text not null default 'pending'
             check (status in ('pending', 'approved', 'hidden'))   -- نمایش فقط بعد از تأیید مدیر
);
create index if not exists project_comments_proj_idx
  on public.project_comments (project_id, created_at desc);

alter table public.project_comments enable row level security;

-- بازدیدکننده فقط می‌تواند «بخواند»؛ نوشتن فقط از راه تابع add_project_comment
revoke insert, update, delete on public.project_comments from anon, authenticated;
grant  select on public.project_comments to anon, authenticated;
grant  delete on public.project_comments to authenticated;   -- فقط مدیر (policy پایین)
grant  update (status) on public.project_comments to authenticated;   -- تأیید / مخفی‌سازی توسط مدیر

drop policy if exists "public can read comments" on public.project_comments;
drop policy if exists "public can read approved comments" on public.project_comments;
create policy "public can read approved comments" on public.project_comments
  for select to anon using (status = 'approved');

drop policy if exists "authenticated reads comments" on public.project_comments;
create policy "authenticated reads comments" on public.project_comments
  for select to authenticated using (status = 'approved' or public.is_admin());

drop policy if exists "admin updates comments" on public.project_comments;
create policy "admin updates comments" on public.project_comments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin deletes comments" on public.project_comments;
create policy "admin deletes comments" on public.project_comments
  for delete to authenticated using (public.is_admin());

-- ثبت نظر توسط بازدیدکننده (محدودیت تعداد، تلهٔ ربات، پاک‌سازی ورودی)
create or replace function public.add_project_comment(
  p_project_id uuid    default null,
  p_name       text    default '',
  p_body       text    default '',
  p_website    text    default ''          -- honeypot: کاربر واقعی آن را خالی می‌گذارد
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := private.clean(p_name, 60);
  v_body text := private.clean(p_body, 1000);
  v_id   bigint;
begin
  if coalesce(p_website, '') <> '' then
    return jsonb_build_object('ok', true, 'id', 0);
  end if;

  if not private.hit('comment', 10, 3600) then
    return jsonb_build_object('ok', false, 'code', 'rate_limited',
      'error', 'نظرهای شما زیاد است؛ کمی بعد دوباره تلاش کنید');
  end if;

  if v_name = '' or char_length(v_body) < 2 then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'نام و متن نظر را کامل وارد کنید');
  end if;

  if p_project_id is null or not exists (select 1 from public.projects where id = p_project_id) then
    return jsonb_build_object('ok', false, 'code', 'invalid', 'error', 'پروژه پیدا نشد');
  end if;

  insert into public.project_comments (project_id, name, body)
  values (p_project_id, v_name, v_body)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.add_project_comment(uuid, text, text, text) to anon, authenticated;


-- make the API pick up the new functions immediately
notify pgrst, 'reload schema';
