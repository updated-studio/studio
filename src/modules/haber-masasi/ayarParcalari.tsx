import type { ReactNode } from "react";
import { sb } from "../../shared/supabase";
import { hataMetni, useToast } from "../../shared/toast";
import "../sistem/baglantilar.css";
import "./ayarlar.css";

// Ayar sayfalarının ortak parçaları (Haber Masası → Ayarlar, Yapay zekâ kıyası; 4 Kasım 2026): Bağlantı anahtarları düzeni. Gruplar solda
// başlık + açıklama, sağda açılır satırlar; açılan satırda "ad + kısa not | değer" alanları.
export type AyarYaz = (key: string, value: unknown, mesaj: string) => Promise<void>;
export type Ac = (id: string) => void;

/** tr_settings'e yazar, sonucu bildirir */
export function useAyarYaz(): AyarYaz {
  const toast = useToast();
  return async (key, value, mesaj) => {
    const r = await sb.from("tr_settings").upsert({ key, value });
    toast(r.error ? hataMetni(r.error) : mesaj);
  };
}

export function Grup({ id, ad, ne, children }: { id: string; ad: string; ne: string; children: ReactNode }) {
  return (
    <section className="bg-grup" aria-labelledby={"ay-" + id}>
      <div className="bg-grup-sol"><h2 id={"ay-" + id}>{ad}</h2><p>{ne}</p></div>
      <div className="bg-liste">{children}</div>
    </section>
  );
}

export function Satir({ id, ad, ne, durum, deger, acik, ac, children }: { id: string; ad: string; ne: string; durum?: ReactNode; deger?: string; acik: string; ac: Ac; children: ReactNode }) {
  const a = acik === id;
  return (
    <div className={"bg-srv" + (a ? " acik" : "")}>
      <div className="bg-bas">
        <button type="button" className="bg-ac ay-ac" aria-expanded={a} onClick={() => ac(a ? "" : id)}>
          <span className="bg-ad"><b>{ad}</b><span>{ne}</span></span>
          <span className="ay-durum">{durum}{deger && <span className="ay-deger">{deger}</span>}</span>
        </button>
        <button type="button" className="bg-ok" aria-label={a ? "Kapat" : "Aç"} onClick={() => ac(a ? "" : id)}><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></button>
      </div>
      {a && <div className="ay-ic">{children}</div>}
    </div>
  );
}

/** Ayar satırı: solda ad + kısa not, sağda değer */
export function Alan({ ad, not, children }: { ad: string; not?: ReactNode; children: ReactNode }) {
  return <div className="ay-alan"><div className="ay-alan-ad"><b>{ad}</b>{not && <span>{not}</span>}</div><div className="ay-alan-deger">{children}</div></div>;
}
export function Anahtar({ acik, degis, ad }: { acik: boolean; degis: (x: boolean) => void; ad: string }) {
  return <input type="checkbox" role="switch" className="ay-anahtar" checked={acik} aria-label={ad} onChange={(e) => degis(e.target.checked)} />;
}
export function Sayi({ deger, degis, birim, ad }: { deger: number | string; degis: (x: string) => void; birim?: string; ad: string }) {
  return <span className="ay-sayi"><input type="text" inputMode="numeric" value={String(deger)} aria-label={ad} onChange={(e) => degis(e.target.value.replace(/\D/g, ""))} />{birim && <span>{birim}</span>}</span>;
}

/** Başka sayfaya giden satır (Ayarlar'dan Yapay zekâ kıyası sayfasına) */
export function GitSatir({ ad, ne, href }: { ad: string; ne: string; href: string }) {
  return (
    <div className="bg-srv">
      <a className="bg-bas ay-git" href={href}>
        <span className="bg-ac ay-ac"><span className="bg-ad"><b>{ad}</b><span>{ne}</span></span><span /></span>
        <span className="bg-ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" /></svg></span>
      </a>
    </div>
  );
}
