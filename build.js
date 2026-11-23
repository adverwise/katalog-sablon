// Çok markalı katalog motoru: kaynak ürünleri oku → feed kurallarıyla seç → şablonla 1080×1080 render et → Meta XML feed + önizleme.
// Kullanım: node build.js [--brand barbarian] [--prev <önceki yayın klasörü>] [--out site] [--limit N]
// Marka verilmezse brands/ altındaki tüm markalar üretilir. Her marka site/<marka>/ altına yazılır.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('--out', 'site'));
const PREV = opt('--prev', null);
const LIMIT = Number(opt('--limit', 0));
const ONLY = opt('--brand', null);
const BASE = (process.env.PAGES_BASE || 'https://adverwise.github.io/katalog-sablon').replace(/\/$/, '');
const CONCURRENCY = Number(process.env.RENDER_CONCURRENCY || 4);
const SOURCES = { shopify: require('./lib/sources/shopify'), 'ikas-xml': require('./lib/sources/ikas'), 'ikas-csv': require('./lib/sources/ikas') };

const x = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

// Silinmiş/erişilemeyen görselleri atla (sonuç önbellekli)
const imgOk = new Map();
function checkImage(u) {
  if (!imgOk.has(u)) {
    imgOk.set(u, (async () => {
      for (let i = 0; i < 2; i++) {
        try {
          const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(20000) });
          if (r.status === 404 || r.status === 410) return false;
          if (r.ok) return true;
        } catch { /* tekrar dene */ }
      }
      return true; // emin değilsek render denemesine bırak
    })());
  }
  return imgOk.get(u);
}
async function workingImages(list, max) {
  const out = [];
  for (const u of list) { if (out.length >= max) break; if (await checkImage(u)) out.push(u); }
  return out;
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

function feedXml(brand, title, rows) {
  const items = rows.map(({ it, file }) => `  <item>
    <g:id>${x(it.id)}</g:id>
    ${it.group ? `<g:item_group_id>${x(it.group)}</g:item_group_id>` : ''}
    <g:title>${x(it.title)}</g:title>
    <g:description>${x((it.description || it.title).slice(0, 4900))}</g:description>
    <g:link>${x(it.link)}</g:link>
    <g:image_link>${x(BASE + '/' + file)}</g:image_link>
    <g:brand>${x(it.brand)}</g:brand>
    <g:condition>${x(it.condition || 'new')}</g:condition>
    <g:availability>${x(it.availability)}</g:availability>
    <g:price>${it.price.toFixed(2)} TRY</g:price>
    <g:sale_price>${it.sale.toFixed(2)} TRY</g:sale_price>
    ${it.size ? `<g:size>${x(it.size)}</g:size>` : ''}
    ${it.product_type ? `<g:product_type>${x(it.product_type)}</g:product_type>` : ''}
    ${it.custom_label_0 ? `<g:custom_label_0>${x(it.custom_label_0)}</g:custom_label_0>` : ''}
  </item>`.replace(/\n\s*\n/g, '\n'));
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>${x(title)}</title>
  <link>${x(brand.site)}</link>
  <description>${x(brand.description)}</description>
${items.join('\n')}
</channel>
</rss>
`;
}

// TikTok Catalog Manager: ürün başına TEK satır (TikTok bedenleri ayrı ürün gibi yan yana gösteriyor).
// Satır, ürünün stoktaki ilk bedeni (Shopify sırası) üzerinden yazılır; o beden biterse sıradaki stoktaki bedene geçer,
// ürün ancak tüm bedenleri bitince feed'den çıkar. sku_id = o bedenin varyant ID'si (piksel content_id biçimiyle aynı).
function feedTiktokCsv(brand, rows) {
  const cols = ['sku_id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'sale_price', 'link', 'image_link', 'brand', 'product_type', 'google_product_category'];
  const q = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[",]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const seen = new Set();
  const lines = [];
  for (const { it, file } of rows) {
    const g = it.group || it.id;
    if (seen.has(g)) continue;
    seen.add(g);
    lines.push([
      it.id, g, it.title, (it.description || it.title).slice(0, 4900), it.availability, it.condition || 'new',
      `${it.price.toFixed(2)} TRY`, `${it.sale.toFixed(2)} TRY`, it.link.replace(/\?variant=\d+$/, ''), BASE + '/' + file, it.brand, it.product_type, brand.googleCategory || '',
    ].map(q).join(','));
  }
  return '\ufeff' + [cols.join(','), ...lines].join('\n') + '\n';
}

async function renderOne(page, html, ctx, outFile) {
  const ctxTag = `<script>window.__CTX=${JSON.stringify(ctx).replace(/</g, '\\u003c')};</script>`;
  await page.setContent(html.replace('<body>', '<body>' + ctxTag), { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForFunction(() => window.__READY === true, null, { timeout: 60000 });
  const broken = await page.evaluate(() => window.__BROKEN || []);
  if (broken.length) throw new Error('görsel yüklenemedi: ' + broken.join(', '));
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await page.screenshot({ path: outFile, type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1080, height: 1080 } });
}

function previewHtml(brand, slug, summary) {
  const cards = summary.map((s) => `
<section><h2>${x(s.title)} <small>${s.rows.length} ürün · ${s.designs} tasarım · <a href="feeds/${x(s.key)}.xml">feed</a></small></h2>
<p class="meta">Kurala uyan ${s.matched} kalem · atlanan: stok dışı ${s.skipped.stok}, indirimsiz ${s.skipped.indirim}, görselsiz ${s.skipped.gorsel}, render hatası ${s.failed}</p>
<div class="grid">${[...new Map(s.rows.map((r) => [r.file, r])).values()].map((r) =>
    `<a href="${x(r.it.link)}" target="_blank" rel="noopener"><img loading="lazy" src="../${x(r.file)}" alt=""><span>${x(r.it.title)}</span></a>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${x(brand.name)} katalog önizleme</title><style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px 16px;background:#f4f4f2;color:#111}h1{margin:0 0 4px}h2{margin:32px 0 4px}small{font-weight:400;color:#666}
.meta{color:#666;margin:0 0 12px;font-size:14px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px}
.grid a{display:block;background:#fff;color:#111;text-decoration:none;font-size:12px;border-radius:6px;overflow:hidden}.grid img{width:100%;display:block}.grid span{display:block;padding:6px 8px}
</style></head><body><h1>${x(brand.name)} · katalog önizleme</h1><p class="meta">Son güncelleme: ${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</p>${cards}</body></html>`;
}

async function buildBrand(slug, browser) {
  const brand = require(path.join(__dirname, 'brands', slug, 'brand.js'));
  const t0 = Date.now();
  const items = await SOURCES[brand.source.type].load(brand.source, brand.name);
  console.log(`[${slug}] kaynak: ${items.length} varyant`);
  const ctx = brand.prepare ? brand.prepare(items) : {};
  const html = fs.readFileSync(brand.template, 'utf8');
  const tplHash = crypto.createHash('sha1').update(html).digest('hex').slice(0, 8);
  const logo = 'data:image/png;base64,' + fs.readFileSync(brand.logo).toString('base64');
  const outDir = path.join(OUT, slug);
  fs.mkdirSync(path.join(outDir, 'feeds'), { recursive: true });

  // 1) seçim + tasarım anahtarları
  const jobs = new Map(); // file -> { key, p }
  const summary = [];
  for (const f of brand.feeds) {
    const all = items.filter(f.select);
    const skipped = { stok: 0, indirim: 0, gorsel: 0 };
    let ok = all.filter((it) => {
      if (it.availability !== 'in stock') { skipped.stok++; return false; }
      if (!(it.sale > 0 && it.sale < it.price)) { skipped.indirim++; return false; }
      if (!it.images.length) { skipped.gorsel++; return false; }
      return true;
    });
    if (LIMIT) ok = ok.slice(0, LIMIT);
    const imgs = new Array(ok.length);
    await pool(ok, 16, async (it, k) => { imgs[k] = await workingImages(it.images, brand.maxImgs); });
    const rows = [];
    for (const [k, it] of ok.entries()) {
      if (!imgs[k].length) { skipped.gorsel++; continue; }
      const p = brand.toProduct(it, imgs[k], ctx);
      const h = crypto.createHash('sha1').update(JSON.stringify([tplHash, f.template, p])).digest('hex').slice(0, 16);
      const file = `${slug}/img/${f.key}/${h}.jpg`;
      if (!jobs.has(file)) jobs.set(file, { key: f.template, p });
      rows.push({ it, file });
    }
    summary.push({ ...f, rows, matched: all.length, skipped, designs: new Set(rows.map((r) => r.file)).size, failed: 0 });
  }

  // 2) önceki yayında aynı dosya varsa kopyala, yoksa render et
  let reused = 0;
  const todo = [];
  for (const [file, job] of jobs) {
    const prev = PREV && path.join(PREV, file);
    if (prev && fs.existsSync(prev)) {
      fs.mkdirSync(path.dirname(path.join(OUT, file)), { recursive: true });
      fs.copyFileSync(prev, path.join(OUT, file));
      reused++;
    } else todo.push([file, job]);
  }
  console.log(`[${slug}] tasarım: ${jobs.size} benzersiz · ${reused} önceki yayından · ${todo.length} render edilecek`);

  const failed = new Set();
  if (todo.length) {
    const bctx = await browser.newContext({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });
    let i = 0;
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (i < todo.length) {
        const [file, job] = todo[i++];
        for (let attempt = 0; attempt < 2; attempt++) {
          const page = await bctx.newPage();
          try { await renderOne(page, html, { logo, key: job.key, p: job.p }, path.join(OUT, file)); failed.delete(file); break; }
          catch (e) { failed.add(file); if (attempt) console.warn(`! ${file}: ${e.message}`); }
          finally { await page.close(); }
        }
      }
    }));
    await bctx.close();
  }

  // 3) feed'ler (render'ı başarısız olan ürün feed'e girmez)
  for (const s of summary) {
    s.failed = s.rows.filter((r) => failed.has(r.file)).length;
    s.rows = s.rows.filter((r) => !failed.has(r.file));
    fs.writeFileSync(path.join(outDir, 'feeds', `${s.key}.xml`), feedXml(brand, `${brand.name} · ${s.title}`, s.rows));
    fs.writeFileSync(path.join(outDir, 'feeds', `${s.key}.tiktok.csv`), feedTiktokCsv(brand, s.rows));
    console.log(`[${slug}] ${s.key.padEnd(14)} kurala uyan ${String(s.matched).padStart(3)} · feed ${String(s.rows.length).padStart(3)} · tasarım ${s.designs} · atlanan ${JSON.stringify(s.skipped)} · hata ${s.failed}`);
  }
  fs.writeFileSync(path.join(outDir, 'index.html'), previewHtml(brand, slug, summary));
  const status = {
    brand: brand.name, updated: new Date().toISOString(), template: tplHash, seconds: Math.round((Date.now() - t0) / 1000),
    feeds: Object.fromEntries(summary.map((s) => [s.key, { url: `${BASE}/${slug}/feeds/${s.key}.xml`, items: s.rows.length, failed: s.failed }])),
  };
  fs.writeFileSync(path.join(outDir, 'status.json'), JSON.stringify(status, null, 1));
  return { slug, status, renderFailRate: jobs.size ? failed.size / jobs.size : 0 };
}

(async () => {
  const slugs = ONLY ? [ONLY] : fs.readdirSync(path.join(__dirname, 'brands')).filter((d) => fs.existsSync(path.join(__dirname, 'brands', d, 'brand.js')));
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
  const results = [];
  let bad = false;
  // Bir markada sorun çıkarsa o markanın önceki yayını aynen korunur; diğer markalar etkilenmez.
  const keepPrevious = (slug, why) => {
    console.log(`::error::[${slug}] ${why} → önceki yayın korunuyor`);
    fs.rmSync(path.join(OUT, slug), { recursive: true, force: true });
    const prev = PREV && path.join(PREV, slug);
    if (prev && fs.existsSync(prev)) fs.cpSync(prev, path.join(OUT, slug), { recursive: true });
    else bad = true; // korunacak önceki yayın yoksa
  };
  for (const slug of slugs) {
    try {
      const r = await buildBrand(slug, browser);
      if (r.renderFailRate > 0.2) keepPrevious(slug, `render hatası oranı çok yüksek (%${Math.round(r.renderFailRate * 100)})`);
      else results.push(r);
    } catch (e) { console.error(e); keepPrevious(slug, `üretim hatası: ${e.message}`); }
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  fs.writeFileSync(path.join(OUT, 'status.json'), JSON.stringify({ updated: new Date().toISOString(), brands: Object.fromEntries(results.map((r) => [r.slug, r.status])) }, null, 1));
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Adverwise katalog şablonları</title><body style="font-family:system-ui;padding:24px 16px"><h1>Katalog şablonları</h1><ul>${results.map((r) => `<li><a href="${r.slug}/">${x(r.status.brand)}</a> · ${Object.values(r.status.feeds).reduce((a, f) => a + f.items, 0)} kalem</li>`).join('')}</ul></body>`);
  if (!results.length) { console.error('Hiçbir marka üretilemedi, yayın durduruldu.'); process.exit(1); }
  if (bad) console.log('::warning::Bazı markalar üretilemedi; diğerleri yayınlanıyor.');
})().catch((e) => { console.error(e); process.exit(1); });
