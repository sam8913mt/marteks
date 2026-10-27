-- ============================================================
-- بررسی فقط‌خواندنی امنیت Supabase (هیچ تغییری نمی‌دهد)
-- در Supabase Dashboard > SQL Editor اجرا کنید و خروجی را برای بازبینی بفرستید.
-- ============================================================

-- 1) آیا RLS روی جدول‌ها فعال است؟
select schemaname, tablename, rowsecurity as rls_enabled
from pg_tables where schemaname = 'public' order by tablename;

-- 2) همهٔ سیاست‌ها (باید برای orders / chats / project_comments / projects / team_members / testimonials بررسی شود)
select schemaname, tablename, policyname, permissive, roles, cmd, qual as using_expr, with_check
from pg_policies where schemaname = 'public' order by tablename, cmd;

-- 3) سطح دسترسی نقش‌های anon و authenticated روی جدول‌ها (هدف: حداقل لازم)
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
group by table_name, grantee order by table_name, grantee;

-- 4) توابع RPC: چه کسی اجرا می‌کند و با چه سطح دسترسی (SECURITY DEFINER نیازمند بررسی دقیق است)
select p.proname as function, p.prosecdef as security_definer,
       pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can_execute,
       p.proconfig as settings   -- باید search_path ثابت داشته باشد
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ai_login','ai_signup','is_admin','chat_start','add_project_comment','submit_order')
order by p.proname;

-- 5) متن توابع حساس (برای بازبینی اعتبارسنجی ورودی، محدودیت نرخ و هش رمز)
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('ai_login','ai_signup','is_admin');
