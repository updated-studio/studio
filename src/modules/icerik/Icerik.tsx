// İçerik modülü: Instagram post aracı.
// 1. aşama: mevcut araç (public/araclar/post/) olduğu gibi Stüdyo içinde açılır; giriş Stüdyo'nunki.
// Sonraki aşamalar (ARCHITECTURE.md): kayıtlı düzenler buluta, story boyutu, otomasyondan gelen postlar.
export default function Icerik() {
  return (
    <iframe
      src="araclar/post/index.html"
      title="Post aracı"
      className="arac-cerceve"
      allow="clipboard-write; web-share"
    />
  );
}
