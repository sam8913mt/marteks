// Merteks — Edge Function «admin-users»
// تمام عملیات مدیریت کاربران فقط از این‌جا و فقط برای مدیر مجاز انجام می‌شود.
// کلید service_role فقط در محیط سرور (Secrets خودکار Supabase) خوانده می‌شود و
// هرگز در پاسخ‌ها یا مرورگر دیده نمی‌شود.

export interface Deps {
  env: (key: string) => string | undefined;
  createClient: (url: string, key: string, options?: Record<string, unknown>) => any;
  now?: () => number;
}

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHONE_RE = /^09\d{9}$/;
const NAME_RE = /^[\p{L}\p{M}\u200c' .\-]{2,60}$/u;
const PER_PAGE = 1000;
const MAX_USERS = 10000;
const BAN_FOREVER = "876000h"; // حدود ۱۰۰ سال؛ برای فعال‌سازی مجدد: "none"
const CACHE_MS = 15000;
const MUTATING = ["update_profile", "disable_user", "enable_user", "delete_user"];
const SORTS = ["newest", "oldest", "name", "last_login"];
const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_ORIGINS = "https://sam8913mt.github.io";

/* ---------------- ابزارهای کوچک ---------------- */
function faDigits(v: unknown): string {
  return String(v ?? "")
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}
function cleanText(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
export function norm(v: unknown): string {
  return faDigits(v).toLowerCase().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/[\u200c\s]+/g, " ").trim();
}
function normPhone(v: unknown): string {
  let s = faDigits(v).replace(/[\s\-()]/g, "");
  if (/^\+989\d{9}$/.test(s)) s = "0" + s.slice(3);
  else if (/^00989\d{9}$/.test(s)) s = "0" + s.slice(4);
  else if (/^989\d{9}$/.test(s)) s = "0" + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = "0" + s;
  return s;
}
const tehranDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tehran", year: "numeric", month: "2-digit", day: "2-digit",
});
function dayKey(ms: number): string {
  return tehranDay.format(new Date(ms));
}

/* ---------------- محدودیت درخواست (در حافظهٔ همین instance) ---------------- */
const buckets = new Map<string, { ws: number; c: number }>();
function hit(key: string, max: number, windowMs: number, now: number): boolean {
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now - v.ws > windowMs) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || now - b.ws > windowMs) {
    buckets.set(key, { ws: now, c: 1 });
    return true;
  }
  b.c++;
  return b.c <= max;
}

/* ---------------- پاسخ‌ها ---------------- */
function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "600",
  };
  const origin = req.headers.get("origin");
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}
function send(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/* ---------------- ساخت ردیف کاربر (Auth + profiles) ---------------- */
function isBanned(u: any, now: number): boolean {
  return !!u.banned_until && Date.parse(u.banned_until) > now;
}
function metaName(v: unknown): string {
  return typeof v === "string" ? cleanText(v, 60) : "";
}
function toRow(u: any, p: any, now: number) {
  const meta = (u && u.user_metadata) || {};
  const first = (p && p.first_name) || metaName(meta.first_name);
  const last = (p && p.last_name) || metaName(meta.last_name);
  let phone = (p && p.phone) || "";
  if (!phone) {
    const m = normPhone(meta.phone);
    if (PHONE_RE.test(m)) phone = m;
  }
  return {
    id: u.id,
    email: u.email || "",
    first_name: first,
    last_name: last,
    phone,
    created_at: u.created_at || null,
    email_confirmed: !!u.email_confirmed_at,
    email_confirmed_at: u.email_confirmed_at || null,
    last_sign_in_at: u.last_sign_in_at || null,
    disabled: isBanned(u, now),
    has_profile: !!p,
    profile_complete: !!(p && p.profile_complete),
  };
}
type Row = ReturnType<typeof toRow>;

function fullName(r: Row): string {
  return (r.first_name + " " + r.last_name).trim();
}

export function createHandler(deps: Deps) {
  const nowFn = deps.now || (() => Date.now());
  let cache: { at: number; rows: Row[]; truncated: boolean } | null = null;

  async function loadDataset(admin: any, fresh: boolean) {
    const now = nowFn();
    if (!fresh && cache && now - cache.at < CACHE_MS) return cache;

    const users: any[] = [];
    let truncated = true;
    for (let page = 1; page <= MAX_USERS / PER_PAGE; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
      if (error) {
        console.error("listUsers failed:", error.message || error);
        throw new HttpError(502, "auth_unavailable", "خواندن فهرست کاربران از Supabase Auth انجام نشد.");
      }
      const batch = (data && data.users) || [];
      users.push(...batch);
      if (batch.length < PER_PAGE) { truncated = false; break; }
    }

    const profiles = new Map<string, any>();
    for (let from = 0; from < MAX_USERS + PER_PAGE; from += PER_PAGE) {
      const { data, error } = await admin
        .from("profiles")
        .select("id,first_name,last_name,phone,profile_complete")
        .order("id")
        .range(from, from + PER_PAGE - 1);
      if (error) {
        console.error("profiles read failed:", error.message || error);
        throw new HttpError(500, "profiles_unavailable", "خواندن جدول profiles انجام نشد؛ فایل migration-admin-users.sql و migration-auth.sql اجرا شده است؟");
      }
      for (const p of data || []) profiles.set(p.id, p);
      if (!data || data.length < PER_PAGE) break;
    }

    const rows = users.map((u) => toRow(u, profiles.get(u.id), now));
    cache = { at: now, rows, truncated };
    return cache;
  }

  function statsOf(rows: Row[], now: number) {
    const today = dayKey(now);
    let verified = 0, todayAll = 0, todayVerified = 0, disabled = 0;
    for (const r of rows) {
      if (r.email_confirmed) verified++;
      if (r.disabled) disabled++;
      if (r.created_at && dayKey(Date.parse(r.created_at)) === today) {
        todayAll++;
        if (r.email_confirmed) todayVerified++;
      }
    }
    return {
      total: rows.length, verified, unverified: rows.length - verified,
      today: todayAll, today_verified: todayVerified, disabled,
    };
  }

  function applyFilters(rows: Row[], b: any): Row[] {
    const q = norm(cleanText(b.q, 100));
    const verified = b.verified === "verified" || b.verified === "unverified" ? b.verified : "all";
    const status = b.status === "active" || b.status === "disabled" ? b.status : "all";
    const sort = SORTS.includes(b.sort) ? b.sort : "newest";
    let out = rows.filter((r) => {
      if (verified === "verified" && !r.email_confirmed) return false;
      if (verified === "unverified" && r.email_confirmed) return false;
      if (status === "active" && r.disabled) return false;
      if (status === "disabled" && !r.disabled) return false;
      if (!q) return true;
      const hay = norm([r.first_name, r.last_name, r.first_name + " " + r.last_name, r.email, r.phone].join(" "));
      return hay.indexOf(q) > -1;
    });
    const ts = (s: string | null) => (s ? Date.parse(s) : 0);
    out = out.slice();
    if (sort === "newest") out.sort((a, b2) => ts(b2.created_at) - ts(a.created_at));
    else if (sort === "oldest") out.sort((a, b2) => ts(a.created_at) - ts(b2.created_at));
    else if (sort === "last_login") out.sort((a, b2) => ts(b2.last_sign_in_at) - ts(a.last_sign_in_at));
    else {
      out.sort((a, b2) => {
        const na = fullName(a), nb = fullName(b2);
        if (!na && nb) return 1;
        if (na && !nb) return -1;
        return (na || a.email).localeCompare(nb || b2.email, "fa");
      });
    }
    return out;
  }

  async function audit(admin: any, ctx: any, action: string, target: { id?: string; email?: string } | null, details: Record<string, unknown>): Promise<boolean> {
    const { error } = await admin.from("admin_audit_log").insert({
      admin_id: ctx.adminId,
      admin_email: ctx.adminEmail,
      action,
      target_user_id: (target && target.id) || null,
      target_email: (target && target.email) || null,
      details,
      ip: ctx.ip,
    });
    if (error) {
      console.error("audit insert failed:", action, error.message || error);
      return false;
    }
    return true;
  }

  async function mutationLimit(admin: any, ctx: any, actions: string[], max: number) {
    const since = new Date(nowFn() - 10 * 60 * 1000).toISOString();
    const { count, error } = await admin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("admin_id", ctx.adminId)
      .in("action", actions)
      .gte("created_at", since);
    if (error) {
      console.error("rate-limit lookup failed:", error.message || error);
      throw new HttpError(500, "audit_unavailable", "جدول گزارش مدیریتی در دسترس نیست؛ فایل migration-admin-users.sql اجرا شده است؟");
    }
    if ((count || 0) >= max) {
      throw new HttpError(429, "rate_limited", "تعداد عملیات مدیریتی در این ۱۰ دقیقه زیاد بود؛ کمی بعد دوباره تلاش کنید.");
    }
  }

  function needId(b: any): string {
    const id = String(b.id || "");
    if (!UUID_RE.test(id)) throw new HttpError(400, "invalid_id", "شناسهٔ کاربر معتبر نیست.");
    return id.toLowerCase();
  }
  function notSelf(ctx: any, id: string, what: string) {
    if (id === ctx.adminId) throw new HttpError(400, "self_action", "مدیر نمی‌تواند حساب خودش را " + what + " کند.");
  }
  async function authUser(admin: any, id: string) {
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data || !data.user) {
      if (!error || error.status === 404 || /not found/i.test(String(error.message || ""))) {
        throw new HttpError(404, "user_not_found", "کاربر پیدا نشد (شاید قبلاً حذف شده است).");
      }
      console.error("getUserById failed:", error.message || error);
      throw new HttpError(502, "auth_unavailable", "دریافت اطلاعات کاربر از Supabase Auth انجام نشد.");
    }
    return data.user;
  }

  /* ---------------- عملیات ---------------- */
  async function actList(admin: any, ctx: any, b: any) {
    const ds = await loadDataset(admin, b.fresh === true);
    const filtered = applyFilters(ds.rows, b);
    const pageSize = PAGE_SIZES.includes(Number(b.pageSize)) ? Number(b.pageSize) : 25;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(Math.max(1, parseInt(String(b.page), 10) || 1), pages);
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);
    return {
      ok: true,
      users: slice.map((r) => ({
        id: r.id, email: r.email, first_name: r.first_name, last_name: r.last_name, phone: r.phone,
        created_at: r.created_at, email_confirmed: r.email_confirmed, disabled: r.disabled,
        last_sign_in_at: r.last_sign_in_at, has_profile: r.has_profile,
      })),
      page, pageSize, pages, total_filtered: filtered.length,
      stats: statsOf(ds.rows, nowFn()),
      truncated: ds.truncated,
    };
  }

  async function actGet(admin: any, ctx: any, b: any) {
    const id = needId(b);
    const u = await authUser(admin, id);
    const { data: p, error: pe } = await admin
      .from("profiles")
      .select("id,first_name,last_name,phone,profile_complete,created_at,updated_at")
      .eq("id", id)
      .maybeSingle();
    if (pe) {
      console.error("profile read failed:", pe.message || pe);
      throw new HttpError(500, "profiles_unavailable", "خواندن پروفایل انجام نشد.");
    }
    const row = toRow(u, p, nowFn());
    const providers = Array.isArray(u.app_metadata && u.app_metadata.providers)
      ? u.app_metadata.providers.filter((x: unknown) => typeof x === "string").slice(0, 5)
      : [];
    const { data: hist } = await admin
      .from("admin_audit_log")
      .select("id,created_at,admin_email,action,details")
      .eq("target_user_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    return {
      ok: true,
      user: {
        ...row,
        providers,
        profile_created_at: p ? p.created_at : null,
        profile_updated_at: p ? p.updated_at : null,
        history: hist || [],
      },
    };
  }

  async function actUpdateProfile(admin: any, ctx: any, b: any) {
    const id = needId(b);
    const first = cleanText(b.first_name, 60);
    const last = cleanText(b.last_name, 60);
    const phoneRaw = cleanText(b.phone, 40);
    const phone = phoneRaw ? normPhone(phoneRaw) : "";
    if (!NAME_RE.test(first)) throw new HttpError(400, "invalid_first_name", "نام معتبر نیست (۲ تا ۶۰ حرف).");
    if (!NAME_RE.test(last)) throw new HttpError(400, "invalid_last_name", "نام خانوادگی معتبر نیست (۲ تا ۶۰ حرف).");
    if (phone && !PHONE_RE.test(phone)) throw new HttpError(400, "invalid_phone", "شمارهٔ تماس باید موبایل ایرانی مثل 09123456789 باشد.");
    await mutationLimit(admin, ctx, MUTATING, 60);

    const { data: cur, error: ce } = await admin
      .from("profiles").select("first_name,last_name,phone").eq("id", id).maybeSingle();
    if (ce) {
      console.error("profile lookup failed:", ce.message || ce);
      throw new HttpError(500, "profiles_unavailable", "خواندن پروفایل انجام نشد.");
    }
    if (!cur) {
      throw new HttpError(404, "no_profile", "این کاربر هنوز پروفایل ندارد (پروفایل فقط پس از تأیید ایمیل ساخته می‌شود).");
    }
    const next = { first_name: first, last_name: last, phone: phone || null };
    const changed = (["first_name", "last_name", "phone"] as const).filter((k) => (cur[k] || null) !== next[k]);
    if (!changed.length) return { ok: true, unchanged: true };

    const { data: upd, error } = await admin
      .from("profiles").update(next).eq("id", id)
      .select("id,first_name,last_name,phone,profile_complete,updated_at").maybeSingle();
    if (error) {
      if (error.code === "23505") throw new HttpError(409, "phone_taken", "این شماره قبلاً برای حساب دیگری ثبت شده است.");
      console.error("profile update failed:", error.message || error);
      throw new HttpError(500, "update_failed", "ذخیرهٔ پروفایل انجام نشد.");
    }
    if (!upd) throw new HttpError(404, "no_profile", "پروفایل پیدا نشد.");
    cache = null;
    const u = await authUser(admin, id).catch(() => null);
    const auditOk = await audit(admin, ctx, "update_profile", { id, email: u && u.email }, { changed });
    return { ok: true, profile: upd, changed, audit_ok: auditOk };
  }

  async function actSetDisabled(admin: any, ctx: any, b: any) {
    const id = needId(b);
    if (typeof b.disabled !== "boolean") throw new HttpError(400, "invalid_input", "مقدار disabled باید true یا false باشد.");
    const disable = b.disabled;
    if (disable) notSelf(ctx, id, "غیرفعال");
    await mutationLimit(admin, ctx, MUTATING, 60);

    const before = await authUser(admin, id);
    const { data, error } = await admin.auth.admin.updateUserById(id, { ban_duration: disable ? BAN_FOREVER : "none" });
    if (error || !data || !data.user) {
      if (error && (error.status === 404 || /not found/i.test(String(error.message || "")))) {
        throw new HttpError(404, "user_not_found", "کاربر پیدا نشد.");
      }
      console.error("updateUserById failed:", error && (error.message || error));
      throw new HttpError(502, "auth_unavailable", "تغییر وضعیت حساب در Supabase Auth انجام نشد.");
    }
    const nowBanned = isBanned(data.user, nowFn());
    if (nowBanned !== disable) {
      throw new HttpError(502, "state_mismatch", "وضعیت حساب پس از تغییر با انتظار نمی‌خواند؛ دوباره بررسی کنید.");
    }
    let sessionsRevoked: boolean | null = null;
    if (disable) {
      const r = await admin.rpc("admin_revoke_sessions", { p_user: id });
      sessionsRevoked = !r.error;
      if (r.error) console.error("revoke sessions failed:", r.error.message || r.error);
    }
    cache = null;
    const auditOk = await audit(admin, ctx, disable ? "disable_user" : "enable_user",
      { id, email: before.email }, disable ? { sessions_revoked: sessionsRevoked } : {});
    return { ok: true, disabled: nowBanned, sessions_revoked: sessionsRevoked, audit_ok: auditOk };
  }

  async function actDelete(admin: any, ctx: any, b: any) {
    const id = needId(b);
    notSelf(ctx, id, "حذف");
    await mutationLimit(admin, ctx, MUTATING, 60);

    const u = await authUser(admin, id);
    const typed = String(b.confirm_email || "").trim().toLowerCase();
    if (!typed || typed !== String(u.email || "").trim().toLowerCase()) {
      throw new HttpError(400, "confirm_mismatch", "ایمیل تأیید با ایمیل کاربر یکی نیست.");
    }
    const { error } = await admin.auth.admin.deleteUser(id, false); // حذف کامل، نه حذف نرم
    if (error) {
      if (error.status === 404 || /not found/i.test(String(error.message || ""))) {
        throw new HttpError(404, "user_not_found", "کاربر پیدا نشد.");
      }
      console.error("deleteUser failed:", error.message || error);
      throw new HttpError(502, "auth_unavailable", "حذف کاربر در Supabase Auth انجام نشد.");
    }
    // پروفایل با ON DELETE CASCADE پاک می‌شود؛ برای اطمینان از نبودن داده یتیم دوباره بررسی می‌کنیم.
    const { data: left } = await admin.from("profiles").select("id").eq("id", id).maybeSingle();
    let orphanCleaned = false;
    if (left) {
      const d = await admin.from("profiles").delete().eq("id", id);
      orphanCleaned = !d.error;
    }
    cache = null;
    const auditOk = await audit(admin, ctx, "delete_user", { id, email: u.email || "" },
      { email_confirmed: !!u.email_confirmed_at, orphan_profile_cleaned: orphanCleaned });
    return { ok: true, deleted: true, audit_ok: auditOk };
  }

  async function actExport(admin: any, ctx: any, b: any) {
    await mutationLimit(admin, ctx, ["export_users"], 10);
    const ds = await loadDataset(admin, true);
    const rows = applyFilters(ds.rows, b);
    const filters = {
      q: !!cleanText(b.q, 100), verified: b.verified || "all", status: b.status || "all",
    };
    const auditOk = await audit(admin, ctx, "export_users", null, { count: rows.length, filters });
    if (!auditOk) {
      // خروجی گرفتن بدون ثبت گزارش مجاز نیست
      throw new HttpError(500, "audit_unavailable", "ثبت گزارش مدیریتی انجام نشد؛ خروجی صادر نشد.");
    }
    return {
      ok: true,
      truncated: ds.truncated,
      users: rows.map((r) => ({
        first_name: r.first_name, last_name: r.last_name, email: r.email, phone: r.phone,
        created_at: r.created_at, email_confirmed: r.email_confirmed, disabled: r.disabled,
        last_sign_in_at: r.last_sign_in_at,
      })),
    };
  }

  async function actAudit(admin: any, ctx: any, b: any) {
    const pageSize = 25;
    const page = Math.max(1, parseInt(String(b.page), 10) || 1);
    let q = admin
      .from("admin_audit_log")
      .select("id,created_at,admin_email,action,target_user_id,target_email,details", { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (b.user_id) q = q.eq("target_user_id", needId({ id: b.user_id }));
    const { data, error, count } = await q;
    if (error) {
      console.error("audit read failed:", error.message || error);
      throw new HttpError(500, "audit_unavailable", "جدول گزارش مدیریتی در دسترس نیست؛ فایل migration-admin-users.sql اجرا شده است؟");
    }
    return { ok: true, items: data || [], page, pageSize, total: count || 0 };
  }

  /* ---------------- ورودی اصلی ---------------- */
  return async function handle(req: Request): Promise<Response> {
    const allowed = (deps.env("ALLOWED_ORIGINS") || DEFAULT_ORIGINS)
      .split(",").map((s) => s.trim()).filter(Boolean);
    const cors = corsHeaders(req, allowed);

    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "روش درخواست مجاز نیست.");

      const origin = req.headers.get("origin");
      if (origin && !allowed.includes(origin)) throw new HttpError(403, "origin_not_allowed", "دسترسی مجاز نیست.");

      const url = deps.env("SUPABASE_URL");
      const anonKey = deps.env("SUPABASE_ANON_KEY") || deps.env("PUBLISHABLE_KEY");
      const serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !anonKey || !serviceKey) {
        console.error("missing env: SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY");
        throw new HttpError(500, "server_misconfigured", "تنظیمات سرور کامل نیست.");
      }

      const m = /^Bearer\s+([\w\-.~+/=]+)$/i.exec(req.headers.get("authorization") || "");
      if (!m) throw new HttpError(401, "missing_token", "ابتدا وارد پنل شوید.");
      const token = m[1];

      const len = parseInt(req.headers.get("content-length") || "0", 10);
      if (len > 20000) throw new HttpError(413, "too_large", "درخواست بیش از حد بزرگ است.");
      let body: any;
      try { body = JSON.parse((await req.text()).slice(0, 20000)); } catch { body = null; }
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_json", "درخواست نامعتبر است.");

      const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

      // ۱) اعتبارسنجی توکن در سمت سرور Supabase Auth
      const anon = deps.createClient(url, anonKey, opts);
      const { data: ud, error: ue } = await anon.auth.getUser(token);
      if (ue || !ud || !ud.user) throw new HttpError(401, "invalid_token", "نشست معتبر نیست؛ دوباره وارد شوید.");
      const caller = ud.user;

      if (!hit("u:" + caller.id, 120, 60000, nowFn())) {
        throw new HttpError(429, "rate_limited", "درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید.");
      }

      // ۲) بررسی مدیر بودن (تابع is_admin با توکن خود کاربر؛ ایمیل مدیر فقط در private.app_config است)
      const asUser = deps.createClient(url, anonKey, { ...opts, global: { headers: { Authorization: "Bearer " + token } } });
      const { data: isAdmin, error: ae } = await asUser.rpc("is_admin");
      if (ae || isAdmin !== true || !caller.email_confirmed_at) {
        console.warn("admin-users denied for user", caller.id);
        throw new HttpError(403, "forbidden", "دسترسی مدیر ندارید.");
      }

      const admin = deps.createClient(url, serviceKey, opts);
      const ctx = {
        adminId: caller.id as string,
        adminEmail: String(caller.email || "").slice(0, 254),
        ip: cleanText(req.headers.get("cf-connecting-ip") || String(req.headers.get("x-forwarded-for") || "").split(",")[0], 64) || null,
      };

      let result: unknown;
      switch (body.action) {
        case "list": result = await actList(admin, ctx, body); break;
        case "get": result = await actGet(admin, ctx, body); break;
        case "update_profile": result = await actUpdateProfile(admin, ctx, body); break;
        case "set_disabled": result = await actSetDisabled(admin, ctx, body); break;
        case "delete": result = await actDelete(admin, ctx, body); break;
        case "export": result = await actExport(admin, ctx, body); break;
        case "audit": result = await actAudit(admin, ctx, body); break;
        default: throw new HttpError(400, "unknown_action", "عملیات ناشناخته است.");
      }
      return send(200, result, cors);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { ok: false, code: e.code, error: e.message }, cors);
      console.error("admin-users unexpected error:", e && (e as Error).message || e);
      return send(500, { ok: false, code: "internal", error: "خطای داخلی سرور؛ دوباره تلاش کنید." }, cors);
    }
  };
}
