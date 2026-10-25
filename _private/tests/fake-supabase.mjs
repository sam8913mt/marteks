// Supabase ساختگی در حافظه برای آزمایش Edge Function (بدون شبکه)
import assert from 'node:assert/strict';

export const ORIGIN = 'https://sam8913mt.github.io';
export const ADMIN_ID = '00000000-0000-4000-8000-000000000001';
export const USER_ID = '00000000-0000-4000-8000-000000000002';

export function mkWorld() {
  const now = Date.parse('2026-10-22T10:00:00Z');
  const w = {
    now,
    authUsers: [
      { id: ADMIN_ID, email: 'admin@x.ir', created_at: '2026-01-01T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z', last_sign_in_at: '2026-10-22T08:00:00Z', banned_until: null, user_metadata: {}, app_metadata: { providers: ['email'] } },
      { id: USER_ID, email: 'ali@x.ir', created_at: '2026-10-22T05:00:00Z', email_confirmed_at: '2026-10-22T05:05:00Z', last_sign_in_at: '2026-10-22T05:05:00Z', banned_until: null, user_metadata: { first_name: 'x' }, app_metadata: { providers: ['email'] } },
      { id: '00000000-0000-4000-8000-000000000003', email: 'sara@x.ir', created_at: '2026-10-10T05:00:00Z', email_confirmed_at: null, last_sign_in_at: null, banned_until: null, user_metadata: { first_name: 'سارا', last_name: 'احمدی', phone: '۰۹۱۲۳۴۵۶۷۸۹' }, app_metadata: { providers: ['email'] } },
      { id: '00000000-0000-4000-8000-000000000004', email: 'off@x.ir', created_at: '2026-09-01T05:00:00Z', email_confirmed_at: '2026-09-01T05:05:00Z', last_sign_in_at: null, banned_until: '2126-01-01T00:00:00Z', user_metadata: {}, app_metadata: {} },
    ],
    profiles: [
      { id: ADMIN_ID, first_name: 'مدیر', last_name: 'سایت', phone: '09000000000', profile_complete: true },
      { id: USER_ID, first_name: 'علی', last_name: 'رضایی', phone: '09121111111', profile_complete: true },
      { id: '00000000-0000-4000-8000-000000000004', first_name: 'غیر', last_name: 'فعال', phone: null, profile_complete: false },
    ],
    audit: [],
    revoked: [],
    tokens: { 'admin-token': { id: ADMIN_ID, email: 'admin@x.ir', admin: true }, 'user-token': { id: USER_ID, email: 'ali@x.ir', admin: false } },
    calls: { listUsers: 0, aiAccounts: 0 },
    failAudit: false,
    aiAccounts: null,   // null = migration-ai-accounts.sql اجرا نشده (تابع admin_ai_accounts وجود ندارد)
  };
  return w;
}

function builder(w, table) {
  const st = { table, op: 'select', filters: [], order: null, range: null, limit: null, payload: null, count: false, head: false, single: false };
  const q = {
    select(_c, o) { if (st.op === 'select' || st.op === 'update') { st.sel = true; } if (o && o.count) st.count = true; if (o && o.head) st.head = true; return q; },
    insert(p) { st.op = 'insert'; st.payload = p; return q; },
    update(p) { st.op = 'update'; st.payload = p; return q; },
    delete() { st.op = 'delete'; return q; },
    eq(c, v) { st.filters.push((r) => r[c] === v); return q; },
    in(c, vs) { st.filters.push((r) => vs.includes(r[c])); return q; },
    gte(c, v) { st.filters.push((r) => r[c] >= v); return q; },
    order(c, o) { st.order = [c, !(o && o.ascending === false)]; return q; },
    range(a, b) { st.range = [a, b]; return q; },
    limit(n) { st.limit = n; return q; },
    maybeSingle() { st.single = true; return q; },
    then(res, rej) { return Promise.resolve(run()).then(res, rej); },
  };
  function run() {
    const store = table === 'profiles' ? w.profiles : w.audit;
    if (table === 'admin_audit_log' && w.failAudit && st.op === 'insert') return { data: null, error: { message: 'boom' } };
    if (st.op === 'insert') { store.push({ id: store.length + 1, created_at: new Date(w.now).toISOString(), ...st.payload }); return { data: null, error: null }; }
    let rows = store.filter((r) => st.filters.every((f) => f(r)));
    if (st.op === 'update') {
      if (table === 'profiles' && st.payload.phone && store.some((r) => r.phone === st.payload.phone && !rows.includes(r))) return { data: null, error: { code: '23505', message: 'dup' } };
      rows.forEach((r) => Object.assign(r, st.payload));
      return { data: st.single ? (rows[0] || null) : rows, error: null };
    }
    if (st.op === 'delete') { rows.forEach((r) => store.splice(store.indexOf(r), 1)); return { data: null, error: null }; }
    if (st.order) rows = rows.slice().sort((a, b) => (a[st.order[0]] < b[st.order[0]] ? -1 : 1) * (st.order[1] ? 1 : -1));
    const total = rows.length;
    if (st.range) rows = rows.slice(st.range[0], st.range[1] + 1);
    if (st.limit) rows = rows.slice(0, st.limit);
    if (st.head) return { data: null, error: null, count: total };
    return { data: st.single ? (rows[0] || null) : rows, error: null, count: st.count ? total : null };
  }
  return q;
}

export function mkDeps(w, envOver = {}) {
  const env = { SUPABASE_URL: 'https://p.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', ...envOver };
  return {
    env: (k) => env[k],
    now: () => w.now,
    createClient(url, key, opts) {
      const hdr = opts && opts.global && opts.global.headers && opts.global.headers.Authorization;
      if (key === 'anon' && !hdr) {
        return { auth: { async getUser(t) { const u = w.tokens[t]; return u ? { data: { user: { id: u.id, email: u.email, email_confirmed_at: '2026-01-01' } }, error: null } : { data: null, error: { message: 'bad' } }; } } };
      }
      if (key === 'anon') {
        const t = hdr.replace('Bearer ', '');
        const isAdmin = !!(w.tokens[t] && w.tokens[t].admin);
        return { async rpc(name) {
          if (name === 'is_admin') return { data: isAdmin, error: null };
          if (name === 'admin_ai_accounts') {
            // مثل تابع واقعی: فقط با توکن مدیر؛ اگر migration اجرا نشده باشد تابع وجود ندارد
            if (!w.aiAccounts) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.admin_ai_accounts' } };
            if (!isAdmin) return { data: null, error: { code: '42501', message: 'forbidden' } };
            w.calls.aiAccounts++;
            return { data: w.aiAccounts.map((a) => ({ ...a })), error: null };
          }
          return { data: null, error: { message: 'nf' } };
        } };
      }
      assert.equal(key, 'service');
      return {
        from: (t) => builder(w, t),
        async rpc(name, args) { if (name === 'admin_revoke_sessions') { w.revoked.push(args.p_user); return { data: 1, error: null }; } return { data: null, error: { message: 'nf' } }; },
        auth: { admin: {
          async listUsers({ page, perPage }) { w.calls.listUsers++; return { data: { users: w.authUsers.slice((page - 1) * perPage, page * perPage) }, error: null }; },
          async getUserById(id) { const u = w.authUsers.find((x) => x.id === id); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { status: 404, message: 'User not found' } }; },
          async updateUserById(id, a) { const u = w.authUsers.find((x) => x.id === id); if (!u) return { data: null, error: { status: 404, message: 'User not found' } }; u.banned_until = a.ban_duration === 'none' ? null : '2126-01-01T00:00:00Z'; return { data: { user: u }, error: null }; },
          async deleteUser(id, soft) { assert.equal(soft, false); const i = w.authUsers.findIndex((x) => x.id === id); if (i < 0) return { error: { status: 404, message: 'User not found' } }; w.authUsers.splice(i, 1); return { error: null }; },
        } },
      };
    },
  };
}

