// Sayı biçimlendirme (Türkçe ondalık virgülü). Ham sayılar DOM'da data-value ile saklanır.

const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const sup = (s) => [...String(s)].map((c) => SUP[c] ?? c).join('');

const comma = (s) => s.replace('.', ',');

/** Sabit ondalık. */
export function fixed(x, digits = 3) {
  if (!Number.isFinite(x)) return '—';
  return comma(x.toFixed(digits));
}

/** Anlamlı basamak sayısıyla; çok büyük/küçükte bilimsel gösterim (a×10ⁿ). */
export function sig(x, digits = 4) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e6 || ax < 1e-3) return sci(x, Math.max(1, digits - 1));
  const dec = Math.max(0, digits - 1 - Math.floor(Math.log10(ax)));
  return comma(x.toFixed(Math.min(dec, 8)));
}

/** a,bc×10ⁿ */
export function sci(x, frac = 3) {
  if (!Number.isFinite(x)) return '—';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(frac).split('e');
  return `${comma(m)}×10${sup(parseInt(e, 10))}`;
}

/** Yüzde (oran girişi). */
export function percent(x, digits = 2) {
  return Number.isFinite(x) ? `%${comma((100 * x).toFixed(digits))}` : '—';
}

/** İşaretli (EV vb.) */
export function signed(x, digits = 1) {
  if (!Number.isFinite(x)) return '—';
  const s = x.toFixed(digits);
  return comma(x > 0 ? `+${s}` : s.replace(/^-/, '−'));
}
