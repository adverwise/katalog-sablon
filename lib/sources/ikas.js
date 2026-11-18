// ikas'ın Meta için ürettiği feed'leri (XML veya CSV) okur ve tek tip ürün kayıtlarına çevirir.
// Powder Shop motorundan alındı; marka taşındığında kullanılacak.
const { XMLParser } = require('fast-xml-parser');
const { parse } = require('csv-parse/sync');


const { fetchText } = require('../net');
let MERCHANT = '';

const money = (s) => {
  if (s === undefined || s === null) return 0;
  const n = parseFloat(String(s).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Her ikas görselini 1080px webp'ye çevir (ikas görsel kimliği aynı kalır).
function normImage(u) {
  if (!u || !String(u).trim()) return null;
  if (/\/videos\/|\.(mp4|mov|webm)(\?|$)/i.test(String(u))) return null; // ikas bazen video da koyuyor
  const m = String(u).trim().match(/cdn\.myikas\.com\/images\/[^/]+\/([0-9a-f-]{36})\//i);
  return m ? `https://cdn.myikas.com/images/${MERCHANT}/${m[1]}/image_1080.webp` : String(u).trim();
}

function uniqImages(list) {
  const out = [];
  for (const u of list) {
    const n = normImage(u);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

const arr = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function fromXml(text) {
  const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
  const doc = parser.parse(text);
  return arr(doc.rss.channel.item).map((it) => ({
    id: String(it.id),
    group: it.item_group_id ? String(it.item_group_id) : '',
    title: String(it.title || ''),
    description: String(it.description || ''),
    link: String(it.link || ''),
    brand: String(it.brand || ''),
    availability: String(it.availability || ''),
    condition: String(it.condition || 'new'),
    price: money(it.price),
    sale: money(it.sale_price),
    gtin: it.gtin ? String(it.gtin) : '',
    google_product_category: it.google_product_category ? String(it.google_product_category) : '',
    product_type: it.product_type ? String(it.product_type) : '',
    images: uniqImages([it.image_link, ...arr(it.additional_image_link)]),
  }));
}

function fromCsv(text) {
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  return rows.map((r) => ({
    id: r.id,
    group: r.item_group_id || '',
    title: r.title || '',
    description: r.description || '',
    link: r.link || '',
    brand: r.brand || '',
    availability: r.availability || '',
    condition: r.condition || 'new',
    price: money(r.price),
    sale: money(r.sale_price),
    gtin: r.gtin || '',
    google_product_category: r.google_product_category || '',
    product_type: r.product_type || '',
    images: uniqImages([r.image_link, ...String(r.additional_image_link || '').split(',')]),
  }));
}

async function load(src) {
  MERCHANT = src.merchant || '';
  const text = await fetchText(src.url);
  return src.type === 'ikas-csv' ? fromCsv(text) : fromXml(text);
}

module.exports = { load, fromXml, fromCsv };
