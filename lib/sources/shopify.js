// Shopify mağazasının herkese açık ürün verisini (/products.json) okur ve varyant başına tek tip kayıt üretir.
// id = Shopify varyant ID'si, group = Shopify ürün ID'si → Meta pikselinin gönderdiği content_ids ile aynı.
const { fetchJson } = require('../net');

const money = (s) => {
  const n = parseFloat(String(s ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const stripHtml = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Shopify CDN görselini 1080px genişliğe indir (aynı görsel kimliği korunur)
function normImage(u) {
  if (!u) return null;
  const url = String(u).startsWith('//') ? 'https:' + u : String(u);
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return null;
  return url.replace(/([?&])width=\d+&?/, '$1').replace(/[?&]$/, '') + (url.includes('?') ? '&' : '?') + 'width=1080';
}

async function loadAllProducts(site) {
  const out = [];
  for (let page = 1; page < 50; page++) {
    const d = await fetchJson(`${site}/products.json?limit=250&page=${page}`);
    if (!d.products || !d.products.length) break;
    out.push(...d.products);
  }
  return out;
}

// Her ürün için: ürün düzeyi bilgiler + varyant kayıtları
function toRecords(site, products, brandName) {
  const items = [];
  for (const p of products) {
    const images = [...new Set((p.images || []).map((i) => normImage(i.src)).filter(Boolean))];
    // Görsel-varyant bağı (ör. Gold/Silver varyantının kendi görseli): markalar görsel seçimi için kullanabilir
    const media = (p.images || []).map((i) => ({ src: normImage(i.src), variant_ids: (i.variant_ids || []).map(String) })).filter((m) => m.src);
    const optNames = (p.options || []).map((o) => o.name);
    for (const v of p.variants || []) {
      items.push({
        id: String(v.id),
        group: String(p.id),
        product_id: String(p.id),
        handle: p.handle,
        title: String(p.title || '').trim(),
        description: stripHtml(p.body_html) || String(p.title || ''),
        link: `${site}/products/${p.handle}?variant=${v.id}`,
        brand: brandName,
        availability: v.available ? 'in stock' : 'out of stock',
        condition: 'new',
        price: money(v.compare_at_price) || money(v.price),
        sale: money(v.price),
        product_type: String(p.product_type || ''),
        size: v.title && v.title !== 'Default Title' ? v.title : '',
        images,
        media,
        options: Object.fromEntries(optNames.map((n, k) => [n, v['option' + (k + 1)]]).filter(([, val]) => val != null)),
        tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
      });
    }
  }
  return items;
}

async function load(src, brandName) {
  const site = src.site.replace(/\/$/, '');
  const products = await loadAllProducts(site);
  return toRecords(site, products, brandName);
}

module.exports = { load, normImage, toRecords };
