// Görsel üretim modellerinin ekrandaki adları ve görsel başına yaklaşık maliyeti (supabase/functions/triyaj-taslak/uretim.ts ile aynı tutulur;
// o dosya sunucu kütüphanesi içe aktardığı için ekran ondan alamaz).
export const MODEL_AD: Record<string, string> = { klein: "FLUX.2 klein", dev: "FLUX.2 dev", lucid: "Lucid Origin", schnell: "FLUX.1 schnell", gpt: "GPT Image", banana: "Nano Banana" };
export const MODEL_UCRET: Record<string, number> = { klein: 0.016, dev: 0.04, lucid: 0.045, schnell: 0.002, gpt: 0.04, banana: 0.04 };
