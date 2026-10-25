// نقطهٔ ورود Edge Function «ai-chat» (Deno / Supabase Edge Runtime)
// استقرار و Secretها: راهنمای _private/supabase/AI-CHAT-SETUP.md
import { createClient } from "npm:@supabase/supabase-js@2";
import { createHandler } from "./handler.ts";

Deno.serve(createHandler({
  env: (key: string) => Deno.env.get(key),
  createClient,
}));
