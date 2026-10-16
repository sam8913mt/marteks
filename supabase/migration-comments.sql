-- ============================================================
-- Merteks — نظرات (کامنت) برای هر نمونه‌کار
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: schema.sql قبلاً اجرا شده باشد (توابع private.hit / private.clean و is_admin).
-- ============================================================

create table if not exists public.project_comments (
  id         bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  body       text not null check (char_length(body) between 2 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists project_comments_proj_idx
  on public.project_comments (project_id, created_at desc);

alter table public.project_comments enable row level security;

-- بازدیدکننده فقط می‌تواند «بخواند»؛ نوشتن فقط از راه تابع add_project_comment
revoke insert, update, delete on public.project_comments from anon, authenticated;
grant  select on public.project_comments to anon, authenticated;
grant  delete on public.project_comments to authenticated;   -- فقط مدیر (policy پایین)

-- توجه: خواندن عمومی نظرها (فقط تأییدشده‌ها) در migration-comment-moderation.sql تعریف می‌شود؛ آن را هم اجرا کن.
drop policy if exists "public can read comments" on public.project_comments;

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

notify pgrst, 'reload schema';
