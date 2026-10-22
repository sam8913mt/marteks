// نقطهٔ ورود Edge Function «admin-users» (Deno / Supabase Edge Runtime)
// استقرار:  cd _private && supabase functions deploy admin-users --no-verify-jwt --project-ref <REF>
// (اعتبارسنجی توکن و مجوز مدیر داخل خود تابع انجام می‌شود؛ راهنما: ADMIN-USERS-SETUP.md)
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  env: (key: string) => Deno.env.get(key),
  createClient,
}));
