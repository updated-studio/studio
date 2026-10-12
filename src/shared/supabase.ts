import { createClient } from "@supabase/supabase-js";

// Açık (paylaşılabilir) anahtar. Veriyi koruyan şey veritabanındaki erişim kurallarıdır (RLS).
export const SUPABASE_URL = "https://fulmooonidwrqyybbkvu.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_MFb3gtgEx4bci2HAmLrUTA_BWCOMGi6";

export const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: string;
  org: string;
  is_admin: boolean;
  notify_email: boolean;
  avatar_url: string | null;
  emoji: string | null;
  interests: string;
};
