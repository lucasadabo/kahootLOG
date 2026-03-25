import { createClient } from "@supabase/supabase-js";

const GAME_SUPABASE_URL = "https://xhtqqtpkvbbecfemhxex.supabase.co";
const GAME_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ILHQeMEd9nuQCHxGc9EzQA_j5btOTX5";

export const gameSupabase = createClient(GAME_SUPABASE_URL, GAME_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});