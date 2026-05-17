import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Respects RLS — use for user operations if needed (most operations will use Prisma)
export const supabaseAnon = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

// Bypasses RLS — use for admin/background operations ONLY
export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
