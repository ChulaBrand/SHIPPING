const PRODUCT_CATEGORIES = [
  ['papaya', /^papaya/i],
  ['limes', /^limes?\b/i],
  ['pineapples', /^pineapples?\b/i],
  ['bananas_plantains', /^(bananas?|plantains?)\b/i],
  ['aloe', /^(fresh\s+)?aloe/i],
  ['cucumbers', /^cucumbers?\b/i]
];

export function categorizeProduct(desc) {
  const d = String(desc || '').trim();
  for (const [key, re] of PRODUCT_CATEGORIES) {
    if (re.test(d)) return key;
  }
  return 'other';
}

// "Productos" se guarda como "48 Papaya Maradona 3/4 35 Lb. 6 Count, 30 Limes ..."
export function parseProductosString(str) {
  if (!str) return [];
  return String(str).split(',').map(s => s.trim()).filter(Boolean).map(part => {
    const m = part.match(/^(\d+)\s+(.*)$/);
    return m ? { qty: parseInt(m[1], 10), desc: m[2] } : { qty: 0, desc: part };
  });
}
