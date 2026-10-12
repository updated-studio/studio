import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Her derlemenin benzersiz sürüm kimliği; açık sayfalar bunu dist/surum.json ile karşılaştırıp "yenile" uyarısı gösterir.
const SURUM = new Date().toISOString();
const surumDosyasi = (): Plugin => ({
  name: "surum-dosyasi",
  apply: "build",
  writeBundle(opts) { writeFileSync(resolve(opts.dir ?? "dist", "surum.json"), JSON.stringify({ surum: SURUM })); },
});

// base "./": aynı derleme hem web'de hem mobil uygulamada (Capacitor) çalışsın diye göreli yollar.
export default defineConfig({
  plugins: [react(), surumDosyasi()],
  base: "./",
  define: { __SURUM__: JSON.stringify(SURUM) },
});
