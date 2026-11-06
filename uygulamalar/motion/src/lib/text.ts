/** Türkçe büyük harf — marka yazımları korunur (kit §7: iPhone, iPad, iOS, macOS, eSIM büyük harfe çevrilmez). */
const KORU = /^(iPhone|iPad|iOS|iPadOS|macOS|watchOS|visionOS|eSIM|iCloud|iMac|AirPods|MacBook)(\b|'|’)/;
export const upperTR = (s: string) =>
  s
    .split(' ')
    .map((w) => {
      const m = w.match(KORU);
      return m ? m[1] + w.slice(m[1].length).toLocaleUpperCase('tr-TR') : w.toLocaleUpperCase('tr-TR');
    })
    .join(' ');
