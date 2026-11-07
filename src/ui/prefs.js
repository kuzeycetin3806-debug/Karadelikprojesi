// Yerel tercihler (localStorage). Her erişim try/catch içindedir: Safari özel gezinme, çerez engeli vb. durumlarda
// sessizce bellek içi değere düşer. Anahtarların tam listesi gizlilik politikasında (strings.js → privacy) yer alır.
export const PREF_KEYS = {
  mode: 'karadelik.uiMode', // 'simple' | 'advanced'
  tipSeen: 'karadelik.tipSeen', // '1'
  iosHint: 'karadelik.iosHintDismissed', // '1' (pwa.js)
};

const mem = new Map();

export function readPref(key) {
  try {
    const v = localStorage.getItem(key);
    if (v !== null) return v;
  } catch { /* erişilemez */ }
  return mem.get(key) ?? null;
}

export function writePref(key, value) {
  mem.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* erişilemez */ }
}
