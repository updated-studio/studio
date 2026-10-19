import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./shared/bilesenler.css";
import "./shared/cam.css"; // cam görünüm: en son yüklenir
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Açılış ekranı (index.html) en az 0,6 sn görünsün, sonra yumuşakça kaybolsun
const acilis = document.getElementById("acilis");
if (acilis) {
  const kalan = 650;
  window.setTimeout(() => { acilis.classList.add("git"); window.setTimeout(() => acilis.remove(), 400); }, kalan);
}
