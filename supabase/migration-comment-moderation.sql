-- ============================================================
-- Merteks — تأیید نظرها توسط مدیر (moderation)
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: migration-comments.sql (یا schema.sql) قبلاً اجرا شده باشد.
--
-- وضعیت هر نظر:  pending = در انتظار تأیید (در سایت دیده نمی‌شود)
--                approved = تأیید شده و نمایش داده می‌شود
--                hidden   = تأیید شده بود، اما مدیر مخفی کرده است
-- نظرهای قدیمی هم «در انتظار تأیید» می‌شوند و تا تأیید مدیر در سایت نمایش داده نمی‌شوند.
-- ============================================================

alter table public.project_comments
  add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_comments_status_chk') then
    alter table public.project_comments
      add constraint project_comments_status_chk check (status in ('pending', 'approved', 'hidden'));
  end if;
end $$;

create index if not exists project_comments_status_idx
  on public.project_comments (project_id, status, created_at desc);

-- فقط مدیر (policy پایین) می‌تواند «وضعیت» را عوض کند؛ هیچ ستون دیگری قابل ویرایش نیست
revoke update on public.project_comments from anon, authenticated;
grant  update (status) on public.project_comments to authenticated;

-- بازدیدکنندهٔ عادی فقط نظرهای تأییدشده را می‌بیند
drop policy if exists "public can read comments"          on public.project_comments;
drop policy if exists "public can read approved comments" on public.project_comments;
create policy "public can read approved comments" on public.project_comments
  for select to anon using (status = 'approved');

-- مدیر همهٔ نظرها را می‌بیند (is_admin برای anon قابل اجرا نیست؛ برای همین policy جدا است)
drop policy if exists "authenticated reads comments" on public.project_comments;
create policy "authenticated reads comments" on public.project_comments
  for select to authenticated using (status = 'approved' or public.is_admin());

drop policy if exists "admin updates comments" on public.project_comments;
create policy "admin updates comments" on public.project_comments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- نظر جدید همیشه pending ثبت می‌شود (مقدار پیش‌فرض ستون)؛ تابع add_project_comment نیازی به تغییر ندارد.

notify pgrst, 'reload schema';
