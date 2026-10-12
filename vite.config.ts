import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./": aynı derleme hem web'de hem mobil uygulamada (Capacitor) çalışsın diye göreli yollar.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
