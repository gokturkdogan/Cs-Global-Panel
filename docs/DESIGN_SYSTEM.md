# Tasarım Sistemi

> Hedef: modern, sade, kurumsal, **açık tema** (dark mode kapsam dışı). Erişilebilirlik hedefi **WCAG 2.2 AA**.
> Uygulama: Tailwind CSS v4 (CSS-first `@theme` token'ları) + shadcn/ui bileşenleri + Lucide ikonları. Token'lar PHASE 01'de `src/app/globals.css` içinde tanımlanır.
> Logo: gerçek kurumsal kimlik sağlanana kadar **metin logo** — "CS Global" (Primary Dark, 600 ağırlık). Rastgele logo tasarlanmaz (OD-15).

## 1. Renkler

### 1.1 Önerilen palet ve kontrast doğrulaması

Kontrast oranları WCAG 2.x göreli parlaklık formülüyle hesaplanmıştır (2026-11-24). AA eşikleri: normal metin **4.5:1**, büyük metin (≥24px veya ≥18.66px kalın) ve UI bileşen sınırları **3:1**.

| Token | Hex | Kullanım | Ölçüm | Sonuç |
|---|---|---|---|---|
| `primary-dark` | `#1E3A8A` | Logo, başlık vurgusu, sidebar aktif | Beyaz metin üstünde 10.36 · `#EFF6FF` üstünde 9.52 | ✅ |
| `primary` | `#2563EB` | Birincil buton, link, odak halkası | Beyaz üzerinde 5.17 · `#F8FAFC` üstünde 4.94 · `#EFF6FF` üstünde 4.75 | ✅ normal metin |
| `primary-light` | `#EFF6FF` | Seçili satır, bilgi kutusu zemini | — | Zemin |
| `white` | `#FFFFFF` | Kart, yüzey | — | |
| `background` | `#F8FAFC` | Sayfa zemini | — | |
| `text-primary` | `#0F172A` | Ana metin | Beyaz 17.85 · `#F8FAFC` 17.06 | ✅ |
| `text-secondary` | `#64748B` | Yardımcı metin | Beyaz 4.76 · `#F8FAFC` 4.55 · `#EFF6FF` **4.37** · `#F1F5F9` **4.34** | ⚠️ `#EFF6FF`/`#F1F5F9` zeminde AA altı → bu zeminlerde `#475569` (6.92) kullan |
| `border` | `#E2E8F0` | Ayırıcılar, kart kenarı (dekoratif) | Beyaz üzerinde **1.23** | ⚠️ Yalnızca dekoratif ayırıcı. **Form alanı sınırı olarak kullanılamaz** (WCAG 1.4.11: 3:1). `#94A3B8` de yetersiz (2.56). |
| `border-input` | `#64748B` | Input, select, checkbox, dosya alanı kenarı | Beyaz üzerinde 4.76 | ✅ (Proposed — eklenen token) |
| `success` | `#16A34A` | Başarı | Beyaz üzerinde **3.30** | ⚠️ Metin için AA altı → metin/ikon-yanında-metin için `success-strong` `#15803D` (5.02) |
| `warning` | `#D97706` | Uyarı | Beyaz üzerinde **3.19** | ⚠️ Metin için AA altı → `warning-strong` `#B45309` (5.02) |
| `error` | `#DC2626` | Hata | Beyaz üzerinde 4.83 | ✅ (`#B91C1C` 6.47 tercih edilebilir) |

**Karar (D-028, Proposed):** Brief paleti korunur; yalnızca **metin olarak kullanıldığında** success/warning için koyu tonlar (`#15803D`, `#B45309`) kullanılır. Orijinal tonlar ikon, nokta, ilerleme çubuğu dolgusu, büyük metin gibi 3:1'in yeterli olduğu yerlerde kalır.

> **Form alanı sınırı notu:** WCAG 1.4.11 (Non-text Contrast), bir input'un tanınması için gereken görsel sınırın 3:1 olmasını ister. Bu nedenle input kenarlığı için ayrı bir `border-input` (`#64748B`) token'ı önerilir; `#E2E8F0` yalnızca kart/ayırıcı gibi dekoratif çizgilerde kalır. Bu, formları bir miktar belirginleştirir; PHASE 01'de görsel prototiple teyit edilir.

### 1.2 Statü renkleri (rozetler)

Rozet: açık zemin + koyu metin + ikon (renk tek başına anlam taşımaz — WCAG 1.4.1).

| Statü | Zemin | Metin | Ölçüm | İkon (Lucide) |
|---|---|---|---|---|
| Evrak Bekleniyor / Yüklenmedi | `#F1F5F9` | `#475569` | 6.92 | `Clock` / `CircleDashed` |
| İncelemede / İnceleme Bekliyor | `#EFF6FF` | `#1D4ED8` | 6.16 | `Search` |
| Düzeltme Bekleniyor / Düzeltme Gerekli | `#FFFBEB` | `#B45309` | 4.84 | `AlertTriangle` |
| Evraklar Onaylandı / Onaylandı | `#F0FDF4` | `#15803D` | 4.79 | `CheckCircle2` |
| Başvuru İşlemde | `#EFF6FF` | `#1E3A8A` | 9.52 | `Loader` (animasyonsuz) |
| Süreç Tamamlandı | `#F0FDF4` | `#15803D` | 4.79 | `BadgeCheck` |
| İptal Edildi | `#FEF2F2` | `#B91C1C` | 5.91 | `XCircle` |
| Yüklendi | `#F0FDF4` | `#15803D` | 4.79 | `FileCheck2` |
| Kontrol ediliyor (scan PENDING) | `#F1F5F9` | `#475569` | 6.92 | `ShieldEllipsis` |
| Reddedildi (scan REJECTED) | `#FEF2F2` | `#B91C1C` | 5.91 | `ShieldX` |

Statü → etiket/renk/ikon eşlemesi tek kaynaktan (`src/features/*/domain/*-labels.ts`) gelir; UI'da hardcoded değildir.

## 2. Tipografi

- Font: **Geist Sans** (`geist` paketi) — alternatif Inter (`next/font/google`). Türkçe karakter (ğ, ı, İ, ş, ç, ö, ü) desteği PHASE 01'de görsel test edilir. Mono: Geist Mono (başvuru numarası, kodlar).
- `font-variant-numeric: tabular-nums` tablolarda ve sayaçlarda.

| Token | Boyut / satır | Ağırlık | Kullanım |
|---|---|---|---|
| `text-xs` | 12 / 16 | 400 | Yardımcı etiket (min. — gövde için kullanılmaz) |
| `text-sm` | 14 / 20 | 400–500 | Tablo, form etiketleri (panel) |
| `text-base` | 16 / 24 | 400 | Gövde (müşteri paneli varsayılan; iOS'ta input zoom'u engeller) |
| `text-lg` | 18 / 28 | 600 | Kart başlığı |
| `text-xl` | 20 / 28 | 600 | Bölüm başlığı |
| `text-2xl` | 24 / 32 | 600 | Sayfa başlığı |
| `text-3xl` | 30 / 36 | 700 | Dashboard sayaçları |

Müşteri panelinde input `font-size` ≥ 16px (iOS Safari otomatik yakınlaştırmasını önler).

## 3. Spacing, Radius, Gölge

- Spacing: Tailwind 4px ölçeği. Yaygın: `2 (8px)`, `3 (12px)`, `4 (16px)`, `6 (24px)`, `8 (32px)`.
- Kart iç boşluğu: mobil 16px, desktop 24px. Bölümler arası 24–32px.
- Radius: `--radius: 0.5rem` (8px) temel; buton/input 8px, kart 12px, rozet `9999px`.
- Gölge: yalnızca `shadow-sm` (kart), `shadow-md` (dropdown/dialog). Gradient ve glassmorphism **yok**.
- Animasyon: yalnızca kısa geçişler (150–200ms, `opacity`/`transform`); `prefers-reduced-motion` desteklenir; skeleton pulse reduced-motion'da kapanır.

## 4. Breakpoint'ler

| Ad | Min genişlik | Not |
|---|---|---|
| (base) | 0 | Müşteri paneli tasarımı **320px'ten** başlar |
| `sm` | 640px | |
| `md` | 768px | Tablet; panelde sidebar drawer → kalıcı sidebar geçişi `lg`'de |
| `lg` | 1024px | Panel sabit sidebar |
| `xl` | 1280px | |
| `2xl` | 1536px | İçerik maks genişliği `max-w-7xl` |

Test genişlikleri: 320, 360, 375, 390, 414, 430, 768, 1024, 1440 px (TESTING_STRATEGY §6).

## 5. Bileşenler ve Durumlar

shadcn/ui'dan yalnızca ihtiyaç duyulanlar eklenir (Button, Input, Label, Textarea, Select, Command/Popover (combobox), Dialog, AlertDialog, DropdownMenu, Table, Badge, Card, Tabs, Skeleton, Sonner/Toast, Sheet (mobil drawer), Breadcrumb, Pagination, Progress, Tooltip, Form).

| Durum | Kural |
|---|---|
| Default / Hover / Active | Hover yalnızca pointer cihazlarda (`@media (hover:hover)`) |
| **Focus visible** | 2px `primary` halka + 2px offset (her zaman görünür, `outline: none` yasak); kontrast ≥3:1 |
| Disabled | `opacity-50` + `cursor-not-allowed` + `aria-disabled`; bilgi verici metin gizlenmez |
| Loading | Buton içi spinner + "Kaydediliyor…" metni; buton disabled (**çift gönderim engeli**) |
| Error | Alan altında kırmızı metin + `aria-invalid` + `aria-describedby`; özet hata bölgesi `role="alert"` |
| Success | Toast (kısa) + kalıcı durum değişimi (rozet) |
| Empty | İkon + açıklayıcı başlık + (varsa) birincil aksiyon |
| Skeleton | Liste/kart iskeletleri (`loading.tsx`) |
| Confirmation | Geri alınamaz / önemli işlemler `AlertDialog` (iptal, pasifleştirme, bağlantı yenileme/iptal, evrak düzeltme isteği, gönderim) |

Dokunma hedefi: müşteri panelinde tüm etkileşimli öğeler **≥ 44×44 px** (WCAG 2.2 2.5.8 minimumu 24×24; hedef 44).

## 6. Şirket Paneli Düzeni

- `lg+`: sol sabit sidebar (240px), üst header (kullanıcı menüsü, çıkış), içerik alanında breadcrumb + sayfa başlığı + aksiyonlar.
- `<lg`: header'da menü butonu → `Sheet` drawer.
- Sidebar: Dashboard, Başvurular, Hizmetler*, Çalışanlar*, İşlem Geçmişi*, Ayarlar* (*yalnızca ADMIN — gizleme UX içindir, güvenlik sunucuda).
- Tablolar: sticky header, satır hover, `md` altında kart listesine dönüşüm veya yatay scroll (tablo içinde, sayfada değil).
- Filtre çubuğu: arama input'u + hizmet select + statü select + tarih aralığı + "Temizle".
- Sayfalama: önceki/sonraki + sayfa numarası + toplam kayıt.

## 7. Müşteri Paneli Düzeni (mobile-first)

Tek sütun, maks genişlik `max-w-2xl`, sidebar/tablo/grafik **yok**.

1. Header: "CS Global" metin logo + (sağda) "Çıkış".
2. Hoş geldiniz kartı: "Merhaba {Ad}," + başvuru no + hizmet + oluşturma tarihi + statü rozeti.
3. **Süreç göstergesi:** 5 adım. `<sm`: dikey stepper (taşma yok); `sm+`: yatay. Aktif adım `aria-current="step"`. Düzeltme durumunda adım 2'de uyarı rozeti (BR §11.1).
4. **Evrak tamamlanma:** "3 / 5 zorunlu evrak yüklendi · %60" + `Progress` (`aria-valuenow`). Altında küçük metin "2 / 5 onaylandı" (varsa).
5. Bilgi kutusu (statüye göre): ne yapması gerektiği tek cümleyle.
6. **Evrak kartları** (sıralı):
   - Başlık + "Zorunlu"/"İsteğe bağlı" etiketi + durum rozeti.
   - Açıklama, talimat (açılır-kapanır "Nasıl yüklemeliyim?").
   - Düzeltme gerekçesi (varsa) — uyarı kutusu, kartın üstünde, `role="status"`.
   - Dosya listesi: ad (`truncate` + tam ad `title`), boyut ("2,4 MB"), tarih ("24.11.2026 14:05"), "Görüntüle", (izinliyse) "Kaldır".
   - Yükleme alanı: tam genişlik büyük buton "PDF Yükle" (native `<input type="file" accept="application/pdf,.pdf">` — mobilde dosya/iCloud/Drive seçici açılır), sürükle-bırak yalnızca desktop'ta ek olarak.
   - Yükleme sırasında: gerçek % ilerleme çubuğu + "Yükleniyor… %45" + iptal; sonrasında "Kontrol ediliyor…" → "Yüklendi".
   - Hatalar (Türkçe): "Yalnızca PDF dosyası yükleyebilirsiniz.", "Dosya boyutu en fazla 10 MB olabilir.", "Bu evrak için en fazla 3 dosya yükleyebilirsiniz.", "Şifre korumalı PDF yüklenemez.", "Dosyanız güvenlik kontrolünden geçemedi. Lütfen farklı bir dosya yükleyin.", "Bağlantı sorunu nedeniyle yükleme tamamlanamadı. Lütfen tekrar deneyin."
7. **"İncelemeye Gönder"** butonu: mobilde ekran altına sabit (safe-area inset'li) birincil buton; koşullar sağlanmadıysa disabled + nedenler listesi ("Pasaport evrakı henüz yüklenmedi"). Onay dialog'u.
8. İletişim kartı: şirket telefonu (`tel:`), e-posta (`mailto:`), WhatsApp (`https://wa.me/...`), mesaj.
9. Footer: aydınlatma metni linki (hukuki metin sağlandığında), "Bu bağlantı size özeldir, başkalarıyla paylaşmayın."

Uzun içerik kuralları: `min-w-0`, `break-words`, `overflow-wrap:anywhere` dosya adlarında; sayfada **yatay overflow yok** (E2E'de `document.scrollingElement.scrollWidth <= innerWidth` kontrolü).

## 8. Metin ve Ton

- Sade, kısa, resmî-samimi ("Lütfen", "-iniz"). Teknik terim yok ("token", "session", "upload" yerine "bağlantı", "oturum", "yükleme").
- Tarih: `dd.MM.yyyy HH:mm` (Europe/Istanbul). Boyut: `Intl.NumberFormat('tr-TR')` ("2,4 MB").
- Hiçbir metin vize sonucu garantisi veya olasılığı ifade etmez.

## 9. Erişilebilirlik Kontrol Listesi (WCAG 2.2 AA)

- Semantik HTML (landmark: `header`, `nav`, `main`, `footer`), tek `h1`/sayfa, sıralı başlıklar.
- Tüm form alanlarında görünür `label`; zorunlu alan `aria-required` + görsel işaret ve açıklama.
- Klavye: tüm işlemler klavyeyle; dialog'larda focus trap + ESC + odak iadesi; "İçeriğe atla" linki.
- 2.4.11 Focus Not Obscured: sabit alt buton odaklanan öğeyi örtmemeli (`scroll-padding-bottom`).
- 2.5.7 Dragging: sürükle-bırak'ın buton alternatifi var.
- 3.3.7 Redundant Entry / 3.3.8 Accessible Authentication: OTP alanı yapıştırmaya izin verir, `autocomplete="one-time-code"`, `inputmode="numeric"`; şifre alanlarında yapıştırma engellenmez.
- Canlı bölgeler: yükleme ilerlemesi ve sonuçları `aria-live="polite"`.
- Renk tek başına anlam taşımaz (ikon + metin).
- Otomatik test: axe (Playwright `@axe-core/playwright` — bağımlılık PHASE 11'de değerlendirilir) + manuel VoiceOver (iOS) / TalkBack (Android) kontrolü.
