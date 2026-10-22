-- ============================================================
-- Merteks — نظرات مشتریان (بخش «مشتریان چه می‌گویند» در صفحهٔ اصلی و نمونه‌کارها)
-- یک بار در Supabase > SQL Editor اجرا کن. اجرای دوباره بی‌خطر است.
-- پیش‌نیاز: schema.sql یا migration-team.sql (تابع public.is_admin).
-- تا وقتی نظری ثبت نشود، این بخش در سایت نمایش داده نمی‌شود.
-- ============================================================
create table if not exists public.testimonials (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(name) between 1 and 80),
  role       text not null default '' check (char_length(role) <= 80),
  body       text not null check (char_length(body) between 2 and 400),
  pos        integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists testimonials_pos_idx on public.testimonials (pos, created_at desc);

alter table public.testimonials enable row level security;

revoke insert, update, delete on public.testimonials from anon;
grant  select on public.testimonials to anon, authenticated;
grant  insert, update, delete on public.testimonials to authenticated;

drop policy if exists "public can read testimonials" on public.testimonials;
create policy "public can read testimonials" on public.testimonials
  for select to anon, authenticated using (true);

drop policy if exists "admin manages testimonials" on public.testimonials;
create policy "admin manages testimonials" on public.testimonials
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

notify pgrst, 'reload schema';
