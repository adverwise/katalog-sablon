// oltâ · OLTÂ FRIDAY / Black Friday 2026 katalogları.
// 25 Kasım akşamından itibaren indirim sitede fiyata uygulanıyor (kod yok): karşılaştırmalı fiyat = liste, fiyat = indirimli.
// Görselde üstü çizili karşılaştırmalı fiyat ve sitedeki güncel fiyat var; feed'de price + sale_price sayfayla aynı.
//   net25: charm (+ charm'ı olmayan kolyeler), yüzük, küpe  → sitede %25 · "ERKEN ERİŞİM" (27.11 00.00'a kadar)
//   net15: bileklik, zincir                                  → sitede %15 · son gün 30 Kasım
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
// Renk (Çeşit) bazında ayrı tasarım alan ürünler: her rengin varyant görselleri düzgün olanlar (25 Kasım kararı).
// Oltove ve Lauda'da renklerin görselleri karışık/eksik, onlar tek tasarım kalır.
const COLOR_PRODUCTS = new Set(['Gemmy Charm', 'Gemmy Bileklik', 'Oltodots Charm', 'Lucky Orbs Charm']);
const isColorProduct = (it) => COLOR_PRODUCTS.has(it.title) && !!it.options['Çeşit'];
const colorOf = (it) => it.options['Çeşit'] || '';

// 2.850,00 TL — kuruşlu, yuvarlamasız (kuruş altı çıkarsa yukarı: asla ödenenden düşük gösterilmez)
const tl = (n) => (Math.ceil(n * 100 - 1e-6) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' TL';

let STATE = null; // prepare() doldurur; select/images bunu kullanır

// Ürünün belirli metaldeki (ve verilirse belirli renkteki) varyant görseli (Shopify'da varyanta bağlı görsel)
function metalImage(variants, metal, color) {
  for (const v of variants) {
    if (metalOf(v) !== metal) continue;
    if (color && colorOf(v) !== color) continue;
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

  // Ürün başına (renk ürünlerinde ürün + renk başına) temsilci varyant: stoktaki ilk Silver, yoksa stoktaki ilk varyant
  const chosen = new Set();
  for (const [, vs] of byProduct) {
    const inStock = vs.filter((v) => v.availability === 'in stock');
    const groups = new Map();
    for (const v of inStock) {
      const k = isColorProduct(v) ? colorOf(v) : '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(v);
    }
    for (const g of groups.values()) {
      const pick = g.find((v) => metalOf(v) === 'Silver') || g[0];
      chosen.add(pick.id);
    }
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

// İndirim sitede fiyata uygulanıyor (25 Kasım akşamı kodlar kaldırıldı): price = karşılaştırmalı fiyat, sale = güncel fiyat.
// Görselde "NET %25 / %15" yazdığı için yalnızca indirimi grubun oranına uyan ürünler girer (±%1); uymayan ürün tasarıma girmez.
const rateOk = (it, group) => it.sale > 0 && it.sale < it.price && Math.abs(it.sale / it.price - RATE[group]) < 0.01;
const select = (group) => (it) => STATE.chosen.has(it.id) && groupOf(it) === group && rateOk(it, group);

// Tasarıma girecek görseller, sırayla: silver (büyük, solda) · gold · vücutta takılı görsel
function images(it) {
  if (isColorProduct(it)) return colorImages(it);
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

// Renk ürünleri: o rengin silver'ı (charm'da aynı renkteki silver kolye) · o rengin gold'u · takılı görsel
function colorImages(it) {
  const vs = STATE.byProduct.get(it.product_id);
  const c = colorOf(it);
  const isCharm = lower(it.product_type) === 'charm';
  const k = isCharm && STATE.kolyeByName.get(baseName(it.title));
  const worn = SEL.takili[it.handle] ? normImage(SEL.takili[it.handle])
    : (SEL.liste[it.handle] || []).length >= 3 ? normImage(SEL.liste[it.handle][2]) : null;
  const out = [(k && metalImage(k, 'Silver', c)) || metalImage(vs, 'Silver', c), metalImage(vs, 'Gold', c), worn].filter(Boolean);
  return out.length ? out : it.images;
}

function toProduct(it, imgs) {
  const g = groupOf(it);
  const c = isColorProduct(it) ? colorOf(it) : '';
  const name = c ? `${it.title} · ${/^\d+$/.test(c) ? 'No. ' + c : c}` : it.title;
  // Üstü çizili: karşılaştırmalı fiyat · büyük fiyat: sitedeki güncel (indirimli) fiyat
  return { name, old: tl(it.price), now: tl(it.sale), imgs };
}

module.exports = {
  name: 'oltâ',
  site: 'https://oltajewelry.com',
  description: 'oltâ · OLTÂ FRIDAY 2026 katalogları',
  source: { type: 'shopify', site: 'https://oltajewelry.com' },
  maxImgs: 3,
  googleCategory: 'Apparel & Accessories > Jewelry', // TikTok feed'inde google_product_category (yoksa TikTok uyarı veriyor)
  gender: 'unisex', ageGroup: 'adult',
  template: path.join(__dirname, 'template.html'),
  logo: path.join(__dirname, 'assets', 'logo.png'),
  prepare,
  images,
  feeds: [
    { key: 'net25', template: 'net25', title: 'NET %25 · Charm, kolye, yüzük, küpe', select: select('net25') },
    { key: 'net15', template: 'net15', title: 'NET %15 · Bileklik, zincir', select: select('net15') },
    // TikTok dikey 9:16 (1080×1920): net25.tiktok.csv ve net15.tiktok.csv bu görsellerle yazılır (Barbarian'daki yapı).
    { key: 'tt-net25', template: 'net25V', height: 1920, tiktok: true, tiktokCsv: 'net25', title: 'TikTok 9:16 · NET %25', select: select('net25') },
    { key: 'tt-net15', template: 'net15V', height: 1920, tiktok: true, tiktokCsv: 'net15', title: 'TikTok 9:16 · NET %15', select: select('net15') },
  ],
  toProduct,
  _internals: { baseName, tl, groupOf: (it) => groupOf(it) },
};
