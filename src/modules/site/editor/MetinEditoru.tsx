import { useEffect, useState } from "react";
import {
  $createParagraphNode, $createTextNode, $getNodeByKey, $getSelection, $isRangeSelection,
  FORMAT_TEXT_COMMAND, REDO_COMMAND, UNDO_COMMAND, type LexicalEditor, type NodeKey,
} from "lexical";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { HorizontalRulePlugin } from "@lexical/react/LexicalHorizontalRulePlugin";
import { INSERT_HORIZONTAL_RULE_COMMAND } from "@lexical/react/LexicalHorizontalRuleNode";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createHeadingNode, $createQuoteNode, type HeadingTagType } from "@lexical/rich-text";
import { INSERT_ORDERED_LIST_COMMAND, INSERT_UNORDERED_LIST_COMMAND } from "@lexical/list";
import { $setBlocksType } from "@lexical/selection";
import { $findMatchingParent, $insertNodeToNearestRoot } from "@lexical/utils";
import { $baglantiMi, $baglantiOlustur, $gorselOlustur, DUGUMLER, gorselCizici } from "./dugumler";
import * as api from "../api";
import type { Medya } from "../api";
import MedyaSecici from "../MedyaSecici";

// Haber metni editörü: panelin metin biçimiyle birebir (dugumler.ts). Görünüm: site.css .site-ed-*
const TEMA = {
  paragraph: "site-ed-p",
  heading: { h1: "site-ed-h2", h2: "site-ed-h2", h3: "site-ed-h3", h4: "site-ed-h4", h5: "site-ed-h4", h6: "site-ed-h4" },
  quote: "site-ed-alinti",
  list: { ul: "site-ed-ul", ol: "site-ed-ol", listitem: "site-ed-li" },
  text: { bold: "site-ed-b", italic: "site-ed-i", underline: "site-ed-u", strikethrough: "site-ed-s", highlight: "site-ed-vurgu", code: "site-ed-kod" },
  hr: "site-ed-hr",
};

function GorselOnizleme({ id, dugum }: { id: number; dugum: NodeKey }) {
  const [editor] = useLexicalComposerContext();
  const [m, setM] = useState<Medya | null>(null);
  useEffect(() => { api.medyaGetir(id).then(setM).catch(() => setM(null)); }, [id]);
  const sil = () => editor.update(() => $getNodeByKey(dugum)?.remove());
  return (
    <figure className="site-ed-figur" contentEditable={false}>
      {m ? <img src={api.medyaAdres(m.sizes?.card?.url || m.url || "")} alt={m.alt ?? ""} /> : <div className="muted">Görsel #{id}</div>}
      <figcaption className="row"><span className="muted" style={{ flex: 1 }}>{api.duzMetin(m?.credit)}</span><button type="button" className="btn ghost sm" onClick={sil}>Görseli kaldır</button></figcaption>
    </figure>
  );
}
gorselCizici.bilesen = (p) => <GorselOnizleme {...p} />;

function blok(editor: LexicalEditor, tur: "p" | HeadingTagType | "alinti") {
  editor.update(() => {
    const s = $getSelection();
    if (!$isRangeSelection(s)) return;
    $setBlocksType(s, () => (tur === "p" ? $createParagraphNode() : tur === "alinti" ? $createQuoteNode() : $createHeadingNode(tur)));
  });
}

function baglanti(editor: LexicalEditor) {
  editor.update(() => {
    const s = $getSelection();
    if (!$isRangeSelection(s)) return;
    const mevcut = $findMatchingParent(s.anchor.getNode(), $baglantiMi);
    if (mevcut && $baglantiMi(mevcut)) {
      // Bağlantıyı kaldır: içindeki metin yerinde kalır
      if (!confirm(`Bağlantı kaldırılsın mı?\n${mevcut.alanlar().url}`)) return;
      mevcut.getChildren().forEach((c) => mevcut.insertBefore(c));
      mevcut.remove();
      return;
    }
    const url = prompt("Bağlantı adresi (https://…)")?.trim();
    if (!url) return;
    const l = $baglantiOlustur({ url, newTab: !url.includes("updated.com.tr"), linkType: "custom" });
    l.append($createTextNode(s.getTextContent() || url));
    s.insertNodes([l]);
  });
}

function AracCubugu({ gorselEkle }: { gorselEkle: () => void }) {
  const [editor] = useLexicalComposerContext();
  const d = (etiket: string, baslik: string, is: () => void) => (
    <button type="button" className="site-ed-dugme" title={baslik} aria-label={baslik} onMouseDown={(e) => e.preventDefault()} onClick={is}>{etiket}</button>
  );
  return (
    <div className="site-ed-arac" role="toolbar" aria-label="Metin biçimi">
      {d("¶", "Paragraf", () => blok(editor, "p"))}
      {d("A2", "Ara başlık (H2)", () => blok(editor, "h2"))}
      {d("A3", "Alt başlık (H3)", () => blok(editor, "h3"))}
      {d("A4", "Küçük başlık (H4)", () => blok(editor, "h4"))}
      <span className="site-ed-ayrac" />
      {d("K", "Kalın", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold"))}
      {d("İ", "İtalik", () => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic"))}
      {d("🔗", "Bağlantı ekle / kaldır", () => baglanti(editor))}
      <span className="site-ed-ayrac" />
      {d("•", "Madde listesi", () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined))}
      {d("1.", "Numaralı liste", () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined))}
      {d("❝", "Alıntı", () => blok(editor, "alinti"))}
      {d("―", "Ayırıcı çizgi", () => editor.dispatchCommand(INSERT_HORIZONTAL_RULE_COMMAND, undefined))}
      {d("🖼", "Görsel ekle", gorselEkle)}
      <span className="site-ed-ayrac" />
      {d("↶", "Geri al", () => editor.dispatchCommand(UNDO_COMMAND, undefined))}
      {d("↷", "Yinele", () => editor.dispatchCommand(REDO_COMMAND, undefined))}
    </div>
  );
}

function GorselEkleyici({ acik, kapat, altSinir }: { acik: boolean; kapat: () => void; altSinir: number }) {
  const [editor] = useLexicalComposerContext();
  if (!acik) return null;
  return <MedyaSecici altSinir={altSinir} kapat={kapat} sec={(m) => { editor.update(() => { $insertNodeToNearestRoot($gorselOlustur(m.id)); }); kapat(); }} />;
}

export default function MetinEditoru({ baslangic, degisti, altSinir }: { baslangic: unknown; degisti: (json: unknown) => void; altSinir: number }) {
  const [gorselAcik, setGorselAcik] = useState(false);
  const config = {
    namespace: "site-metin",
    nodes: DUGUMLER,
    theme: TEMA,
    editorState: baslangic && (baslangic as { root?: unknown }).root ? JSON.stringify(baslangic) : undefined,
    onError: (e: Error) => { throw e; },
  };
  return (
    <LexicalComposer initialConfig={config}>
      <div className="site-ed">
        <AracCubugu gorselEkle={() => setGorselAcik(true)} />
        <RichTextPlugin
          contentEditable={<ContentEditable className="site-ed-alan" aria-label="Haber metni" />}
          placeholder={<div className="site-ed-yer">Haber metnini yaz…</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <ListPlugin />
        <HorizontalRulePlugin />
        <OnChangePlugin ignoreSelectionChange onChange={(s) => degisti(s.toJSON())} />
        <GorselEkleyici acik={gorselAcik} kapat={() => setGorselAcik(false)} altSinir={altSinir} />
      </div>
    </LexicalComposer>
  );
}
