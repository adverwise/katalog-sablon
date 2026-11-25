// oltâ · OLTÂ FRIDAY / Black Friday 2026 katalogları.
// İndirim sitede değil, kodla uygulanıyor (BFOLTA25, BFOLTA15). Kod görselde YOK; görselde liste fiyatı ve kodlu fiyat var.
// Feed'deki fiyat = sitedeki liste fiyatı (sale_price yazılmaz; Meta sayfa fiyatıyla karşılaştırıyor).
//   net25: charm (+ charm'ı olmayan kolyeler), yüzük, küpe  → liste × 0,75 · "ERKEN ERİŞİM" (27.11 00.00'a kadar)
//   net15: bileklik, zincir                                  → liste × 0,85 · son gün 30 Kasım
// Kolye ile aynı isimli charm aynı parça: kolye feed'e girmez, charm girer (fiyat ve link charm'ın; tasarımda büyük alanda silver kolye, küçükte gold charm).
// Her üründen feed'e TEK satır girer (Gold/Silver aynı tasarımda gösterildiği için aynı ürün carousel'de iki kez çıkmasın).
const fs = require('fs');
const path = require('path');
const { normImage } = require('../../lib/sources/shopify');

const SEL = JSON.parse(fs.readFileSync(path.join(__dirname, 'gorseller.json'), 'utf8'));

const RATE = { net25: 0.75, net15: 0.85 };
const GROUP_OF_TYPE = { charm: 'net25', kolye: 'net25', 'yüzük': 'net25', 'küpe': 'net25', bileklik: 'net15', zincir: 'net15' };

const lower = (s) => String(s || '').toLocaleLowerCase('tr').trim();
// "Baby Fawnie Kolye" / "Baby Fawnie Charm" → "baby fawnie" (kayıtlı yazım farkları dahil)
const ALIAS = { strawbery: 'strawberry', 'lauda helmet': 'lauda' };
const baseName = (t) => { const b = lower(t).replace(/\s+(kolye|charm)$/, ''); return ALIAS[b] || b; };
const metalOf = (it) => it.options.Renk || '';

// 2.850,00 TL — kuruşlu, yuvarlamasız (kuruş altı çıkarsa yukarı: asla ödenenden düşük gösterilmez)
const tl = (n) => (Math.ceil(n * 100 - 1e-6) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

let STATE = null; // prepare() doldurur; select/images bunu kullanır

// Ürünün belirli metaldeki varyant görseli (Shopify'da varyanta bağlı görsel)
function metalImage(variants, metal) {
  for (const v of variants) {
    if (metalOf(v) !== metal) continue;
    const m = v.media.find((x) => x.variant_ids.includes(v.id));
    if (m) return m.src;
  }
  return null;
}

function prepare(items) {
  const byProduct = new Map();
  for (const it of items) {
    if (!byProduct.has(it.product_id)) byProduct.set(it.product_id, []);
    byProduct.get(it.product_id).push(it);
  }
  const charmNames = new Set(items.filter((it) => lower(it.product_type) === 'charm').map((it) => baseName(it.title)));
  const kolyeByName = new Map();
  for (const [, vs] of byProduct) if (lower(vs[0].product_type) === 'kolye') kolyeByName.set(baseName(vs[0].title), vs);

  // Ürün başına temsilci varyant: stoktaki ilk Silver, yoksa stoktaki ilk varyant
  const chosen = new Set();
  for (const [, vs] of byProduct) {
    const inStock = vs.filter((v) => v.availability === 'in stock');
    const pick = inStock.find((v) => metalOf(v) === 'Silver') || inStock[0];
    if (pick) chosen.add(pick.id);
  }
  STATE = { byProduct, charmNames, kolyeByName, chosen };
  for (const it of items) it.custom_label_0 = groupOf(it) || '';
  return {};
}

function groupOf(it) {
  const t = lower(it.product_type);
  if (t === 'kolye' && STATE.charmNames.has(baseName(it.title))) return null; // charm'ı varsa kolye girmez
  return GROUP_OF_TYPE[t] || null;
}

const select = (group) => (it) => STATE.chosen.has(it.id) && groupOf(it) === group;

// Tasarıma girecek görseller, sırayla: silver (büyük, solda) · gold · vücutta takılı görsel
function images(it) {
  const curated = SEL.liste[it.handle];
  if (curated) return curated.map(normImage);
  const vs = STATE.byProduct.get(it.product_id);
  const out = [];
  if (lower(it.product_type) === 'charm') {
    // Charm: büyük alanda silver kolye (zincirli hâli), küçükte gold charm, sonra takılı görsel.
    // Kolyesi olmayan charm'da büyük alana silver charm gelir.
    const k = STATE.kolyeByName.get(baseName(it.title));
    out.push((k && metalImage(k, 'Silver')) || metalImage(vs, 'Silver'));
    out.push(metalImage(vs, 'Gold'));
    if (SEL.takili[it.handle]) out.push(normImage(SEL.takili[it.handle]));
  } else {
    out.push(metalImage(vs, 'Silver'), metalImage(vs, 'Gold'));
  }
  const list = out.filter(Boolean);
  return list.length ? list : it.images; // hiç varyant görseli yoksa ürünün kendi sırası
}

function toProduct(it, imgs) {
  const g = groupOf(it);
  return { name: it.title, old: tl(it.price), now: tl(it.price * RATE[g]), imgs };
}

module.exports = {
  name: 'oltâ',
  site: 'https://oltajewelry.com',
  description: 'oltâ · OLTÂ FRIDAY 2026 katalogları',
  source: { type: 'shopify', site: 'https://oltajewelry.com' },
  requireDiscount: false,
  maxImgs: 3,
  template: path.join(__dirname, 'template.html'),
  logo: path.join(__dirname, 'assets', 'logo.png'),
  prepare,
  images,
  feeds: [
    { key: 'net25', template: 'net25', title: 'NET %25 · Charm, kolye, yüzük, küpe', select: select('net25') },
    { key: 'net15', template: 'net15', title: 'NET %15 · Bileklik, zincir', select: select('net15') },
  ],
  toProduct,
  _internals: { baseName, tl, groupOf: (it) => groupOf(it) },
};
