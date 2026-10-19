/* ============================================================
   MERTEKS FRONTEND CONFIGURATION (Supabase)
   - supabaseUrl / supabaseKey: Project URL and *publishable* key.
     They are meant to be public; the database rules (RLS) protect the data.
     NEVER put a "secret" or "service_role" key here.
   - ایمیل مدیر دیگر اینجا نیست؛ در صفحهٔ admin.html وارد می‌شود.
   ============================================================ */
window.MERTEKS_CONFIG = Object.freeze({
  supabaseUrl: 'https://xpkckkosnnixshbarieo.supabase.co',
  supabaseKey: 'sb_publishable_TboHxYoN_qQLAzZTuRErvw_nbDP5TZW',
  /* Address of the Cloudflare Worker that talks to Gemini (see README.md).
     Example: 'https://merteks-ai.your-name.workers.dev'
     Leave '' to disable the AI fallback; the ready-made answers keep working.
     NEVER put the Gemini API key here. */
  aiEndpoint: ''
});
