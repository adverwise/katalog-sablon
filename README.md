# Adverwise · katalog şablonları (çok markalı)

Markaların e-ticaret ürünlerini onaylı tasarımlarla 1080×1080 görsele çevirir ve her şablon için ayrı bir Meta katalog XML feed'i yayınlar. FramePX'in yerine geçer, ücretsizdir (GitHub Actions + GitHub Pages).

**Her saat** (:23, UTC) iş akışı çalışır: ürünleri okur → feed kurallarıyla seçer → değişen ürünleri render eder → `gh-pages` dalına yayınlar.

## Yapı

```
build.js                 # motor: node build.js [--brand <marka>] [--limit N]
lib/sources/shopify.js   # Shopify /products.json okuyucu (varyant başına kayıt)
lib/sources/ikas.js      # ikas XML/CSV feed okuyucu
brands/<marka>/
  brand.js               # kaynak, feed'ler, seçim kuralları, fiyat/başlık kuralları
  template.html          # onaylı şablonların HTML'i (ürün başına açılıp ekran görüntüsü alınır)
  assets/                # logo
  *.json                 # marka verisi (ör. bestseller listesi)
```

Yeni marka = `brands/` altına yeni klasör. Motordaki bir düzeltme tüm markalara gider.
Bir markanın üretimi hata verirse o markanın önceki yayını aynen korunur, diğer markalar etkilenmez.

## Yayın adresleri

`https://adverwise.github.io/katalog-sablon/<marka>/` önizleme · `…/<marka>/feeds/<feed>.xml` Meta feed · `…/<marka>/feeds/<feed>.tiktok.csv` TikTok feed (aynı görseller, `sku_id` alan adlarıyla) · `…/<marka>/status.json` durum

### Barbarian Woman · Black Friday 2026 (20–30 Kasım)

| Feed | Şablon | Ürünler |
|---|---|---|
| `barbarian/feeds/a1-takimlar.xml` | A1 Tiger (zebra) | Takımlar menüsü: adında DIVA, JADE, RAGNA, GILDA, DOJA, YOKO, MADDY, NANCY, CERSEI geçen üst ve eşofman altları |
| `barbarian/feeds/a2-takimlar.xml` | A2 Now Live (kırmızı-siyah) | aynı |
| `barbarian/feeds/b1-bestseller.xml` | B1 Tiger · BESTSELLER | `brands/barbarian/bestsellers.json` (33 ürün-renk) |
| `barbarian/feeds/b2-bestseller.xml` | B2 Now Live · BESTSELLER | aynı |

## Kurallar (Barbarian)

- Feed'e sadece **stokta + indirimli** varyantlar girer; stoğa gelen ürün bir sonraki saatte kendiliğinden girer. Etekler girmez.
- `id` = Shopify varyant ID'si, `item_group_id` = Shopify ürün ID'si (Meta pikseli ve mevcut katalogla aynı biçim).
- Görsel düzeni ürünün görsel sayısına göre seçilir: 3+ görsel → üçlü, 2 → ikili, 1 → tekli. Silinmiş görseller atlanır.
- Fiyat: eski fiyat aşağı, yeni fiyat yukarı yuvarlanır; indirim yüzdesi aşağı yuvarlanır (asla olduğundan büyük görünmez).
- Takım fiyatı: ürünün indirimli fiyatı + aynı modelin karşı parçalarından (üst ↔ eşofman altı) stokta olan en ucuzu. Karşı parça stokta yoksa satır gizlenir.
- Görsel dosya adı içerik hash'idir (şablon dahil): fiyat ya da şablon değişince adres değişir, Meta yeniden çeker.

## Bakım

- Bestseller listesi değişecekse `brands/barbarian/bestsellers.json` güncellenir.
- Kampanya bitince: **Actions → Katalog görselleri ve feed'ler → ⋯ → Disable workflow** (ya da markayı `brands/` altından kaldır).
- Yerelde: `npm ci && npx playwright install chromium && node build.js --brand barbarian --limit 3`
