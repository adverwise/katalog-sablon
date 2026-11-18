// Tekrar denemeli indirme yardımcıları
async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (katalog-sablon)' }, signal: AbortSignal.timeout(90000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      if (i === tries - 1) throw new Error(`İndirilemedi (${url.slice(0, 80)}…): ${e.message}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
}
const fetchJson = async (url) => JSON.parse(await fetchText(url));
module.exports = { fetchText, fetchJson };
