import { createContext, useContext, useEffect, useState, type ReactNode, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { sb, type Profile } from "./supabase";

type AuthState = { session: Session | null; profile: Profile | null; reloadProfile: () => Promise<void> };
const Ctx = createContext<AuthState>({ session: null, profile: null, reloadProfile: async () => {} });
export const useAuth = () => useContext(Ctx);

const here = () => window.location.origin + window.location.pathname;

function trErr(m: string) {
  if (/Database error saving new user/i.test(m)) return "Bu e-posta davet listesinde yok. Yöneticiden seni eklemesini iste.";
  if (/Invalid login credentials/i.test(m)) return "E-posta veya şifre hatalı.";
  if (/Email not confirmed/i.test(m)) return "E-postanı henüz onaylamadın. Gelen kutundaki bağlantıya tıkla.";
  if (/already registered/i.test(m)) return "Bu e-postayla zaten hesap var. Giriş yap ya da şifreni sıfırla.";
  if (/rate limit|security purposes/i.test(m)) return "Çok sık denendi. Birkaç dakika sonra tekrar dene.";
  if (/at least 6/i.test(m)) return "Şifre en az 6 karakter olmalı.";
  return m;
}

type Mode = "login" | "signup" | "forgot" | "newpass";
const LABELS: Record<Mode, [string, string]> = {
  login: ["Giriş yap", "Giriş yap"],
  signup: ["Hesabını oluştur", "Hesabı oluştur"],
  forgot: ["Şifreni sıfırla", "Sıfırlama bağlantısı gönder"],
  newpass: ["Yeni şifreni belirle", "Şifreyi kaydet"],
};

function AuthScreen({ initial }: { initial: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; good?: boolean } | null>(null);

  const go = (m: Mode) => { setMode(m); setMsg(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    let error: { message: string } | null = null;
    if (mode === "login") ({ error } = await sb.auth.signInWithPassword({ email, password: pass }));
    else if (mode === "signup") {
      const r = await sb.auth.signUp({ email, password: pass, options: { emailRedirectTo: here() } });
      error = r.error;
      if (!error && !r.data.session) setMsg({ t: "Hesap oluşturuldu. E-postana gelen onay bağlantısına tıkla, sonra giriş yap.", good: true });
    } else if (mode === "forgot") {
      ({ error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here() }));
      if (!error) setMsg({ t: "Sıfırlama bağlantısı e-postana gönderildi.", good: true });
    } else {
      ({ error } = await sb.auth.updateUser({ password: pass }));
      if (!error) window.location.hash = "";
    }
    setBusy(false);
    if (error) setMsg({ t: trErr(error.message) });
  }

  return (
    <div className="wrap" style={{ maxWidth: 400, marginTop: "8vh" }}>
      <div className="brand"><b>UP</b>DATED<span>Stüdyo</span></div>
      <div className="panel">
        <h2>{LABELS[mode][0]}</h2>
        {msg && <div className={"msg " + (msg.good ? "good" : "err")}>{msg.t}</div>}
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode !== "newpass" && (
            <label htmlFor="email">E-posta
              <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          {mode !== "forgot" && (
            <label htmlFor="pass">{mode === "login" ? "Şifre" : "Şifre (en az 6 karakter)"}
              <input id="pass" type="password" minLength={6} required autoComplete={mode === "login" ? "current-password" : "new-password"} value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
          )}
          <button className="btn" disabled={busy}>{LABELS[mode][1]}</button>
        </form>
        {mode === "login" && <>
          <button className="linkbtn" onClick={() => go("signup")}>İlk kez mi geliyorsun? Hesabını oluştur</button>
          <button className="linkbtn" onClick={() => go("forgot")}>Şifremi unuttum</button>
        </>}
        {(mode === "signup" || mode === "forgot") && <button className="linkbtn" onClick={() => go("login")}>Giriş ekranına dön</button>}
      </div>
      <div className="muted">Stüdyo'ya yalnızca yöneticinin davet ettiği e-postalar üye olabilir.</div>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);

  async function loadProfile(s: Session | null) {
    if (!s) { setProfile(null); return; }
    const { data } = await sb.from("profiles").select("*").eq("id", s.user.id).maybeSingle();
    setProfile((data as Profile) ?? null);
  }

  useEffect(() => {
    let yedek = 0;
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => {
      clearTimeout(yedek);
      if (ev === "PASSWORD_RECOVERY") setRecovering(true);
      if (ev === "USER_UPDATED") setRecovering(false);
      if (ev === "TOKEN_REFRESHED") return;
      setSession(s);
      setTimeout(async () => { await loadProfile(s); setReady(true); }, 0);
    });
    // Güvenlik ağı: oturum olayı gecikirse (arka plandaki sekme, token yenileme) 6 sn sonra oturumu kendimiz okuruz.
    yedek = window.setTimeout(async () => {
      const { data } = await sb.auth.getSession();
      setSession(data.session); await loadProfile(data.session); setReady(true);
    }, 6000);
    return () => { clearTimeout(yedek); sub.subscription.unsubscribe(); };
  }, []);

  if (!ready) return <div className="muted" style={{ textAlign: "center", marginTop: "20vh" }}>Yükleniyor…</div>;
  if (recovering) return <AuthScreen initial="newpass" />;
  if (!session) return <AuthScreen initial="login" />;
  if (!profile) return <div className="wrap"><div className="empty">Hesabın açık ama ekip kaydın bulunamadı. Yöneticiye haber ver.</div></div>;
  return <Ctx.Provider value={{ session, profile, reloadProfile: () => loadProfile(session) }}>{children}</Ctx.Provider>;
}
