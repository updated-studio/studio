// Geçiş dönemi: ekip paneli şu an eski adresinde çalışıyor. React'e taşınınca bu dosya gerçek modül olacak.
export default function Ekip() {
  return (
    <div className="panel">
      <h2>Ekip</h2>
      <p className="muted" style={{ margin: 0 }}>
        Ekip paneli Stüdyo'ya taşınıyor. Taşıma bitene kadar mevcut panel çalışmaya devam ediyor.
      </p>
      <div className="row">
        <a className="btn" href="https://eneshsahin.github.io/updated-panel/ekip/" target="_blank" rel="noreferrer">Mevcut paneli aç</a>
      </div>
    </div>
  );
}
