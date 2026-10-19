import { type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../shared/auth";
import { Ikon } from "../../shared/Ikon";
import { sb } from "../../shared/supabase";
import { BU_HAFTA, GUN, iso, kalan, kisaY } from "../../shared/tarih";
import { hataMetni, useToast } from "../../shared/toast";
import { useVeri } from "../../shared/veri";
import { adOf, bosGunler, KATEGORILER } from "./ortak";

type Sonuc = PromiseLike<{ error: { message: string } | null }>;

// Profil menüsünden açılan sayfa. İş açma/düzenleme Ekip → İşler'de (IsFormu).
export default function YonetimSayfa() {
  const { yukleniyor, hata } = useVeri();
  const git = useNavigate();
  if (yukleniyor) return <div className="muted">Yükleniyor…</div>;
  if (hata) return <div className="empty">Veri yüklenemedi: {hata}</div>;
  return <Yonetim bitti={(isler) => git(isler ? "/ekip?b=isler" : "/yonetim")} />;
}

function Yonetim({ bitti }: { bitti: (isler?: boolean) => void }) {
  const { veri, yenile } = useVeri();
  const { profile } = useAuth();
  const toast = useToast();
  const uid = profile!.id;
  const bekleyen = veri.jobs.filter((j) => j.status === "havuz" && j.req.length);
  const kayitli = veri.invites.filter((i) => !veri.profiles.some((p) => p.email.toLowerCase() === i.email.toLowerCase()));

  async function yap(p: Sonuc, basari?: string) {
    const r = await p;
    if (r.error) { toast(hataMetni(r.error)); return false; }
    if (basari) toast(basari);
    yenile(); return true;
  }
  const al = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

  async function ekipmanEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget), st = al(f, "durum");
    if (await yap(sb.from("gear").insert({ name: al(f, "urun"), category: al(f, "kat"), status: st, holder: st === "elimizde" && al(f, "kimde") ? al(f, "kimde") : null, day: al(f, "tarih") || null }), "Ekipman eklendi.")) e.currentTarget.reset();
  }
  async function etkinlikEkle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await yap(sb.from("events").insert({ title: al(f, "ad"), brand: al(f, "marka"), start_day: al(f, "bas"), end_day: al(f, "bit") || null, certainty: al(f, "kesinlik"), note: al(f, "not") }), "Etkinlik takvime eklendi.")) e.currentTarget.reset();
  }
  async function davetEt(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (await yap(sb.from("invites").insert({ email: al(f, "eposta").toLowerCase(), name: al(f, "ad"), org: al(f, "yer"), is_admin: al(f, "yetki") === "1" }), "Davet listesine eklendi.")) e.currentTarget.reset();
  }
  async function hatirlat() {
    const r = await sb.rpc("send_reminder");
    if (r.error) return toast(hataMetni(r.error));
    toast(r.data ? `${r.data} kişiye hatırlatma gitti.` : "Herkes işaretlemiş, gönderilecek kimse yok.");
  }

  return (
    <>
      <h2>Yönetim</h2>
      <h3>Onay bekleyen talepler</h3>
      <div className="panel"><div className="liste">
        {bekleyen.length ? bekleyen.flatMap((j) => j.req.map((r) => (
          <div className="satir" key={j.id + r}>
            <div className="caticon"><Ikon ad={j.category} /></div>
            <div className="ana"><strong>{j.brand} · {j.title}</strong>
              <div className="muted">{adOf(veri, r)} istiyor · bu hafta boş: {bosGunler(veri, r, BU_HAFTA, GUN, iso) || "işaretlemedi"}</div></div>
            <button className="btn ok sm" onClick={() => yap(sb.rpc("assign_job", { p_job: j.id, p_user: r }), "İş atandı.")}>Onayla ve ata</button>
          </div>
        ))) : <div className="muted">Bekleyen talep yok.</div>}
      </div></div>

      <h3>İşler</h3>
      <div className="panel"><div className="row">
        <div style={{ flex: "1 1 180px" }}>İş açma ve düzenleme artık Ekip → İşler'de ("Yeni iş" düğmesi).</div>
        <button className="btn ghost" onClick={() => bitti(true)}>İşler'e git</button>
      </div></div>

      <h3>Etkinlik / lansman ekle</h3>
      <div className="panel">
        <div className="liste">
          {veri.events.filter((x) => kalan(x.end_day ?? x.start_day) >= 0).map((x) => (
            <div className="satir" key={x.id}>
              <span className="mono">{kisaY(x.start_day)}{x.end_day && x.end_day !== x.start_day ? " – " + kisaY(x.end_day) : ""}</span>
              <div className="ana"><strong>{(x.brand ? x.brand + " · " : "") + x.title}</strong></div>
              <span className={"pill " + (x.certainty === "tahmini" ? "off" : "purple")}>{x.certainty === "tahmini" ? "Tahmini" : "Kesin"}</span>
              <button className="btn ghost sm" aria-label="Etkinliği sil" onClick={() => yap(sb.from("events").delete().eq("id", x.id))}><Ikon ad="sil" /></button>
            </div>
          ))}
        </div>
        <form className="grid" onSubmit={etkinlikEkle}>
          <label htmlFor="e-ad">Etkinlik<input id="e-ad" name="ad" type="text" required placeholder="iPhone tanıtımı" /></label>
          <label htmlFor="e-marka">Marka (isteğe bağlı)<input id="e-marka" name="marka" type="text" placeholder="Apple" /></label>
          <label htmlFor="e-bas">Başlangıç<input id="e-bas" name="bas" type="date" required /></label>
          <label htmlFor="e-bit">Bitiş (isteğe bağlı)<input id="e-bit" name="bit" type="date" /></label>
          <label htmlFor="e-kes">Tarih<select id="e-kes" name="kesinlik"><option value="kesin">Kesin</option><option value="tahmini">Tahmini</option></select></label>
          <label htmlFor="e-not">Not (isteğe bağlı)<input id="e-not" name="not" type="text" maxLength={120} placeholder="Genelde eylülün ikinci haftası" /></label>
          <button className="btn"><Ikon ad="plus" />Takvime ekle</button>
        </form>
        <div className="muted">Etkinlikten 1 hafta ve 1 gün önce herkese bildirim gider.</div>
      </div>

      <h3>Ekipman ekle</h3>
      <div className="panel">
        <form className="grid" onSubmit={ekipmanEkle}>
          <label htmlFor="g-urun">Ürün<input id="g-urun" name="urun" type="text" required placeholder="Fujifilm X-T5" /></label>
          <label htmlFor="g-kat">Kategori<select id="g-kat" name="kat">{KATEGORILER.filter(([v]) => v !== "kurgu").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label htmlFor="g-durum">Durum<select id="g-durum" name="durum"><option value="elimizde">Envanterde</option><option value="yolda">Yolda</option></select></label>
          <label htmlFor="g-kimde">Kimde<select id="g-kimde" name="kimde"><option value="">Seçilmedi</option>{veri.profiles.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <label htmlFor="g-tarih">İade / geliş tarihi<input id="g-tarih" name="tarih" type="date" /></label>
          <button className="btn"><Ikon ad="plus" />Ekle</button>
        </form>
      </div>

      <h3>Üyeler</h3>
      <div className="panel">
        <div className="liste">
          {veri.profiles.map((m) => (
            <div className="satir" key={m.id}>
              <div className="ana"><strong>{m.name}</strong> <span className="muted">{m.email}</span></div>
              {m.is_admin && <span className="pill wait">Yönetici</span>}
              {m.id !== uid && <button className="btn ghost sm" onClick={() => yap(sb.from("profiles").update({ is_admin: !m.is_admin }).eq("id", m.id))}>{m.is_admin ? "Yöneticiliği kaldır" : "Yönetici yap"}</button>}
            </div>
          ))}
          {kayitli.map((i) => (
            <div className="satir" key={i.email}>
              <div className="ana"><strong>{i.name}</strong> <span className="muted">{i.email}</span></div>
              {i.is_admin && <span className="pill wait">Yönetici olacak</span>}
              <span className="pill off">Davet edildi, henüz kaydolmadı</span>
              <button className="btn ghost sm" aria-label="Daveti sil" onClick={() => yap(sb.from("invites").delete().eq("email", i.email))}><Ikon ad="sil" /></button>
            </div>
          ))}
        </div>
        <form className="grid" onSubmit={davetEt}>
          <label htmlFor="d-eposta">E-posta<input id="d-eposta" name="eposta" type="email" required placeholder="uye@ornek.com" /></label>
          <label htmlFor="d-ad">Ad<input id="d-ad" name="ad" type="text" required maxLength={40} /></label>
          <label htmlFor="d-yer">Çalıştığı yer<input id="d-yer" name="yer" type="text" maxLength={40} placeholder="GZT, Sigma…" /></label>
          <label htmlFor="d-yetki">Yetki<select id="d-yetki" name="yetki"><option value="">Üye</option><option value="1">Yönetici</option></select></label>
          <button className="btn"><Ikon ad="plus" />Davet listesine ekle</button>
        </form>
        <div className="muted">Eklediğin kişiye Stüdyo'nun adresini gönder. Bu e-postayla "Hesabını oluştur" diyerek kendi şifresini belirler.</div>
      </div>

      <h3>Hatırlatma</h3>
      <div className="panel"><div className="row">
        <div style={{ flex: "1 1 180px" }}>Bu hafta müsaitliğini işaretlemeyenlere bildirim gönder. (Her pazar 19:00'da gelecek hafta için kendiliğinden de gider.)</div>
        <button className="btn ghost" onClick={hatirlat}><Ikon ad="zil" />Şimdi gönder</button>
      </div></div>
    </>
  );
}
