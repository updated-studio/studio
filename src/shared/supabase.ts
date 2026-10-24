import { createClient } from "@supabase/supabase-js";

// Natro'daki kendi Supabase sunucumuz (23 Ekim 2026'ya kadar Supabase bulutu: fulmooonidwrqyybbkvu.supabase.co).
// Açık (paylaşılabilir) anahtar: tarayıcıya konur, gizli değildir. Veriyi koruyan şey veritabanındaki erişim kurallarıdır (RLS).
export const SUPABASE_URL = "https://panel.updated.com.tr";
export const PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyNzIxMjQyLCJleHAiOjE5NTA0MDEyNDJ9.E1JwNdTSj6BF2NuOxFtK1_LmAIVeI3Qn3sEvZLd85j8";

export const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY);

export type Profile = {
  id: string;
  email: string;
  name: string;
  role: string;
  org: string;
  is_admin: boolean;
  site_rol: string; // sitedeki rol (shared/siteRolleri.ts); "yok" = sitede yetkisi yok
  notify_email: boolean;
  avatar_url: string | null;
  emoji: string | null;
  interests: string;
};
