// Telefon bildirimi (25 Ekim 2026, göç 0034): bu cihazı kaydeder; Stüdyo bildirimleri telefona/bilgisayara da düşer.
// iPhone'da yalnız Stüdyo ana ekrana eklenmişse çalışır (Safari → Paylaş → Ana Ekrana Ekle). Gönderen: notify-email fonksiyonu.
import { useEffect, useState } from "react";
import { sb } from "./supabase";
import { useAuth } from "./auth";
import { hataMetni, useToast } from "./toast";

// Açık anahtar (gizli değil); özel anahtarı yalnız sunucuda (functions.env)
const VAPID_ACIK = "BAtGq4ROsAtJ8T77N-VGeYSmLzih4z-fRLcXIQqgBxTxvihhd8aNQu3kF0kLladYTbk_hNeSyDf06TskIMohQck";
const destek = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const iphoneTarayici = () => /iPhone|iPad/.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone && !matchMedia("(display-mode: standalone)").matches;
const anahtar = (s: string) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
const kayit = () => navigator.serviceWorker.register("./sw.js");

export default function TelefonBildirimi() {
  const { session } = useAuth();
  const toast = useToast();
  const [acik, setAcik] = useState<boolean | null>(null);
  const [mesgul, setMesgul] = useState(false);

  useEffect(() => {
    if (!destek()) { setAcik(false); return; }
    kayit().then((r) => r.pushManager.getSubscription()).then((a) => setAcik(!!a && Notification.permission === "granted")).catch(() => setAcik(false));
  }, []);

  async function ac() {
    setMesgul(true);
    try {
      if (await Notification.requestPermission() !== "granted") { toast("Bildirim izni verilmedi. Tarayıcı ayarlarından Stüdyo'ya izin verebilirsin."); return; }
      const r = await kayit(); await navigator.serviceWorker.ready;
      const a = (await r.pushManager.getSubscription()) ?? await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: anahtar(VAPID_ACIK) });
      const j = a.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const { error } = await sb.from("push_abonelikleri").upsert({ user_id: session!.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, cihaz: navigator.userAgent.slice(0, 160) }, { onConflict: "endpoint" });
      if (error) throw error;
      setAcik(true); toast("Bu cihaza bildirim gelecek.");
    } catch (e) { toast(hataMetni(e as { message?: string })); } finally { setMesgul(false); }
  }
  async function kapat() {
    setMesgul(true);
    try {
      const a = await (await kayit()).pushManager.getSubscription();
      if (a) { await sb.from("push_abonelikleri").delete().eq("endpoint", a.endpoint); await a.unsubscribe(); }
      setAcik(false); toast("Bu cihaza bildirim gelmeyecek.");
    } catch (e) { toast(hataMetni(e as { message?: string })); } finally { setMesgul(false); }
  }

  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <b>Bu cihaza bildirim</b>
          <div className="muted" style={{ fontSize: 14 }}>
            {iphoneTarayici() ? "iPhone'da önce Stüdyo'yu ana ekrana ekle (Safari → Paylaş → Ana Ekrana Ekle), sonra oradan açıp burayı aç."
              : !destek() ? "Bu tarayıcı bildirim desteklemiyor."
              : "Yayın hatırlatmaları, iş atamaları ve mesajlar telefonuna ya da bilgisayarına bildirim olarak düşer."}
          </div>
        </div>
        {destek() && !iphoneTarayici() && acik !== null && (
          acik ? <button className="btn ghost" disabled={mesgul} onClick={kapat}>Kapat</button>
               : <button className="btn" disabled={mesgul} onClick={ac}>Aç</button>
        )}
      </div>
    </div>
  );
}
