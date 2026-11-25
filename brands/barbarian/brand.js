// Barbarian Woman · Black Friday 2026 (20–30 Kasım) takım katalogları.
// Feed'ler: A1/A2 = Takımlar menüsündeki tüm modeller, B1/B2 = bestseller listesi (bestsellers.json).
const fs = require('fs');
const path = require('path');

const MODELS = ['DIVA', 'JADE', 'RAGNA', 'GILDA', 'DOJA', 'YOKO', 'MADDY', 'NANCY', 'CERSEI'];
const MODEL_RX = new RegExp(`\\b(${MODELS.join('|')})\\b`);
// Takım parçaları: üstler ve eşofman altları. Etekler feed'e girmez.
const TOP_TYPES = ['üst', 'top'];
const BOTTOM_TYPES = ['pantolon', 'alt', 'pants', 'bottom'];

const upper = (s) => String(s || '').toLocaleUpperCase('tr');
const model = (it) => (upper(it.title).match(MODEL_RX) || [])[1] || null;
function side(it) {
  const t = String(it.product_type || '').toLocaleLowerCase('tr').trim();
  if (TOP_TYPES.includes(t)) return 'top';
  if (BOTTOM_TYPES.includes(t)) return 'bottom';
  return null;
}
const isSetPiece = (it) => model(it) && side(it);
// %60 indirimli elbiseler (25 Kasım): yalnız fw-dresses koleksiyonundaki ve %60 (ve üstü) indirimli elbiseler.
// yuzde-60-indirim koleksiyonuna sonradan eklenen ürünler bilerek alınmaz (Alp'in kuralı).
const DRESS_COLLECTION = 'fw-dresses';
const isSaleDress = (it) => (it.collections || []).includes(DRESS_COLLECTION) && it.price > 0 && it.sale / it.price <= 0.4001;

const bestsellers = JSON.parse(fs.readFileSync(path.join(__dirname, 'bestsellers.json'), 'utf8')).products;
const BEST_IDS = new Set(bestsellers.map((b) => b.product_id));

const tl = (n) => n.toLocaleString('tr-TR') + '₺';

// Takım fiyatı: ürünün indirimli fiyatı + aynı modelin karşı parçalarından (üst ↔ alt) stokta olan en ucuzunun indirimli fiyatı.
// Renk dikkate alınmaz (renkler aynı fiyatta). Karşı parça stokta yoksa takım satırı gösterilmez.
function buildSetPrices(items) {
  const byProduct = new Map(); // product_id -> { model, side, minSale, inStock }
  for (const it of items) {
    if (!isSetPiece(it)) continue;
    const cur = byProduct.get(it.product_id) || { model: model(it), side: side(it), minSale: Infinity, inStock: false };
    if (it.availability === 'in stock') { cur.inStock = true; cur.minSale = Math.min(cur.minSale, it.sale); }
    byProduct.set(it.product_id, cur);
  }
  const cheapest = new Map(); // `${model}|${side}` -> en ucuz stoktaki fiyat
  for (const p of byProduct.values()) {
    if (!p.inStock) continue;
    const k = `${p.model}|${p.side}`;
    cheapest.set(k, Math.min(cheapest.get(k) ?? Infinity, p.minSale));
  }
  return (it) => {
    const opp = cheapest.get(`${model(it)}|${side(it) === 'top' ? 'bottom' : 'top'}`);
    return Number.isFinite(opp) ? Math.ceil(it.sale) + Math.ceil(opp) : null;
  };
}

// Şablonlara giden ürün: başlık, fiyatlar, indirim, takım fiyatı, görseller
function toProduct(it, imgs, ctx) {
  const disc = Math.floor(Math.round((1 - it.sale / it.price) * 10000) / 100);
  const set = ctx.setPrice(it);
  const title = upper(it.title);
  const sp = title.indexOf(' ');
  return {
    title, model: sp > 0 ? title.slice(0, sp) : title, piece: sp > 0 ? title.slice(sp + 1) : '',
    old: tl(Math.floor(it.price)), new: tl(Math.ceil(it.sale)), pct: disc,
    set: set ? tl(set) : null, imgs,
  };
}

module.exports = {
  name: 'Barbarian Woman',
  site: 'https://barbarianwoman.com',
  description: 'Barbarian Woman Black Friday 2026 takım katalogları',
  gender: 'female', ageGroup: 'adult', // TikTok feed'inde gender / age_group
  googleCategory: 'Apparel & Accessories > Clothing > Activewear', // TikTok feed'inde google_product_category
  source: { type: 'shopify', site: 'https://barbarianwoman.com', collections: [DRESS_COLLECTION] },
  maxImgs: 3,
  template: path.join(__dirname, 'template.html'),
  logo: path.join(__dirname, 'assets', 'logo.png'),
  prepare: (items) => ({ setPrice: buildSetPrices(items) }),
  feeds: [
    { key: 'a1-takimlar', template: 'A1', title: 'A1 Tiger · Tüm takımlar', select: isSetPiece },
    { key: 'a2-takimlar', template: 'A2', title: 'A2 Now Live · Tüm takımlar', select: isSetPiece },
    { key: 'b1-bestseller', template: 'B1', title: 'B1 Tiger · Bestseller', select: (it) => isSetPiece(it) && BEST_IDS.has(it.product_id) },
    { key: 'b2-bestseller', template: 'B2', title: 'B2 Now Live · Bestseller', select: (it) => isSetPiece(it) && BEST_IDS.has(it.product_id) },
    { key: 'e1-elbise-60', template: 'A1', title: 'E1 Tiger · %60 Elbiseler', select: isSaleDress },
    // TikTok dikey 9:16 (1080×1920): a1-takimlar.tiktok.csv ve b1-bestseller.tiktok.csv bu görsellerle yazılır (23 Kasım'da onaylandı).
    { key: 'tt-a1-takimlar', template: 'A1V', height: 1920, tiktok: true, tiktokCsv: 'a1-takimlar', title: 'TikTok 9:16 · A1 Tiger · Tüm takımlar', select: isSetPiece },
    { key: 'tt-e1-elbise-60', template: 'A1V', height: 1920, tiktok: true, tiktokCsv: 'e1-elbise-60', title: 'TikTok 9:16 · E1 Tiger · %60 Elbiseler', select: isSaleDress },
    { key: 'tt-b1-bestseller', template: 'B1V', height: 1920, tiktok: true, tiktokCsv: 'b1-bestseller', title: 'TikTok 9:16 · B1 Tiger · Bestseller', select: (it) => isSetPiece(it) && BEST_IDS.has(it.product_id) },
  ],
  toProduct,
  // test için dışa açık
  _internals: { model, side, buildSetPrices },
};
