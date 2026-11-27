# Tasarım Sistemi

> Hedef: modern, sade, kurumsal, **açık tema** (dark mode kapsam dışı). Erişilebilirlik hedefi **WCAG 2.2 AA**.
> Uygulama: Tailwind CSS v4 (CSS-first `@theme` token'ları) + shadcn/ui bileşenleri + Lucide ikonları. Token'lar `src/app/globals.css` içinde tanımlandı (PHASE 01 — §1.3, D-049).
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
| `text-secondary` | `#64748B` | Yardımcı metin | Beyaz 4.76 · `#F8FAFC` 4.55 · `#EFF6FF` **4.37** · `#F1F5F9` **4.34** | ⚠️ `#EFF6FF`/`#F1F5F9` zeminde AA altı → bu zeminlerde `#475569` (6.92) kullan. **PHASE 01:** `muted-foreground` = `#475569` (tüm yüzeylerde AA — §1.3) |
| `border` | `#E2E8F0` | Ayırıcılar, kart kenarı (dekoratif) | Beyaz üzerinde **1.23** | ⚠️ Yalnızca dekoratif ayırıcı. **Form alanı sınırı olarak kullanılamaz** (WCAG 1.4.11: 3:1). `#94A3B8` de yetersiz (2.56). |
| `border-input` | `#64748B` | Input, select, checkbox, dosya alanı kenarı | Beyaz üzerinde 4.76 | ✅ (PHASE 01'de `--input` token'ı olarak uygulandı) |
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
| Kontrol ediliyor (dosya `UPLOAD_PENDING`/`VALIDATING`) | `#F1F5F9` | `#475569` | 6.92 | `Loader` (animasyonsuz) |
| Dosya reddedildi (dosya `REJECTED`) | `#FEF2F2` | `#B91C1C` | 5.91 | `FileX2` |

Statü → etiket/renk/ikon eşlemesi tek kaynaktan (`src/features/*/domain/*-labels.ts`) gelir; UI'da hardcoded değildir.

### 1.3 Uygulanan semantik token'lar (PHASE 01)

CSS değişkenleri `:root` içinde, Tailwind 4 `@theme inline` ile `bg-*`/`text-*`/`border-*` sınıflarına bağlanır. Bileşenlerde renk hex olarak yazılmaz.

| Token | Değer | Not / ölçüm (WCAG 2.x, hesaplandı) |
|---|---|---|
| `background` / `foreground` | `#F8FAFC` / `#0F172A` | 17.06 |
| `card`, `popover` | `#FFFFFF` (metin `#0F172A`) | |
| `primary` / `primary-foreground` | `#2563EB` / `#FFFFFF` | 5.17 |
| `primary-hover` | `#1D4ED8` | Beyaz metinle 6.70 (önceki `primary/80` saydamlığı kontrastı düşürüyordu) |
| `primary-dark` / `primary-light` | `#1E3A8A` / `#EFF6FF` | 9.52 |
| `secondary`, `accent` | `#EFF6FF` (metin `#1E3A8A`) | 9.52 |
| `muted` / `muted-foreground` | `#F1F5F9` / **`#475569`** | Beyaz 7.58 · `#F8FAFC` 7.24 · `#F1F5F9` 6.92 · `#EFF6FF` 6.96. Palet `#64748B` bu iki zeminde AA altında kaldığından metin rengi koyulaştırıldı (D-049). |
| `destructive` / `destructive-foreground` | `#DC2626` / `#FFFFFF` | 4.83 |
| `destructive-strong` / `destructive-soft` | `#B91C1C` / `#FEF2F2` | 5.91 |
| `success` / `success-strong` / `success-soft` | `#16A34A` / `#15803D` / `#F0FDF4` | Metin: 4.79 (soft zemin), 5.02 (beyaz). `success` yalnızca ikon/dolgu |
| `warning` / `warning-strong` / `warning-soft` | `#D97706` / `#B45309` / `#FFFBEB` | Metin: 4.84 (soft zemin), 5.02 (beyaz). `warning` yalnızca ikon/dolgu |
| `info-strong` | `#1D4ED8` | `#EFF6FF` üzerinde 6.16 |
| `border` | `#E2E8F0` | Yalnızca dekoratif |
| `input` | `#64748B` | Form alanı sınırı, beyaz üzerinde 4.76 (≥3:1) |
| `ring` | `#2563EB` | Odak halkası; beyaz 5.17, `#F8FAFC` 4.94 (≥3:1) |
| `radius` | `0.5rem` | `rounded-lg` 8px (buton, input), `rounded-xl` 12px (kart) |

**Yalnızca açık tema:** `color-scheme: light` + `viewport.colorScheme = 'light'`; Tailwind `dark:` variant'ı hiç kullanılmayan `.dark` sınıfına bağlıdır, bu yüzden shadcn/ui bileşenlerindeki `dark:` sınıfları etkisizdir. İşletim sistemi koyu tema tercihinde arayüz açık kalır (E2E ile doğrulandı).

## 2. Tipografi

- Font: **Geist Sans** (`geist@1.9.2`, `next/font/local`, değişken font) — çalışma zamanında harici font isteği yok (E2E doğrulaması). Türkçe glifler (ç ğ ı İ ö ş ü Ç Ğ Ö Ş Ü â î û) font `cmap` tablosunda doğrulandı ve ekran görüntüsüyle görsel olarak kontrol edildi (PHASE 01). Yedek: `ui-sans-serif, system-ui, sans-serif`. Mono: Geist Mono (başvuru numarası, kodlar) — kullanıldığı fazda yüklenir.
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
| Confirmation | Önemli / geri alınamaz işlemler `AlertDialog`: başvuru iptali (gerekçe), yeniden açma/geri alma (gerekçe), **başvuru silme** (başvuru numarasını yazarak onay + "Bu işlem geri alınamaz" uyarısı), çalışan pasifleştirme, yeni şifre atama, bağlantı yenileme/iptal, evrak düzeltme isteği, gönderim, **WhatsApp ile paylaş** (hedef müşteri adı-soyadı ve telefon numarası büyük puntoyla gösterilir — BR-162) |

Dokunma hedefi: müşteri panelinde tüm etkileşimli öğeler **≥ 44×44 px** (WCAG 2.2 2.5.8 minimumu 24×24; hedef 44).

**PHASE 01'de eklenen bileşenler** (`src/components/ui`, shadcn/ui `radix-nova` stilinden uyarlandı — D-043): Button, Card, Badge, Alert, Separator, Input, Label.
- Button boyutları: `sm` 32px, `default` 40px, `lg` **44px** (müşteri paneli birincil aksiyonları), `icon` 40px, `icon-lg` 44px.
- Odak: tüm etkileşimli bileşenlerde `ring-2 ring-ring ring-offset-2` (saydam halka yerine tam renk).
- Disabled: `opacity-50` + `cursor-not-allowed` (`aria-disabled` de desteklenir).
- Input: yükseklik 40px, `text-base` (mobilde 16px — iOS yakınlaştırması yok), kenarlık `input` token'ı, hata durumunda `aria-invalid` → kırmızı kenarlık.
- Variant'lar: Badge `info`/`success`/`warning`/`destructive` (soft zemin + strong metin), Alert `info`/`destructive`. Statik bilgi kutuları `role="note"` ile kullanılır (`role="alert"` canlı bölgedir).

### 5.1 Logo (OD-15)
Tek paylaşılan bileşen `src/components/shared/logo.tsx`: "CS Global" metin logosu (Primary Dark, 600), isteğe bağlı alt açıklama "Vize Danışmanlık". Metin "CS Global" olarak kalır, büyük harf görünümü ("CS GLOBAL") CSS ile verilir — ekran okuyucular adı doğru okur. Değerler `src/config/company.ts`'ten gelir. Gerçek logo geldiğinde yalnızca bu bileşen değişir. Logo yükleme/yönetim yok; geçici logo gerçek kurumsal logo olarak sunulmaz.

## 6. Şirket Paneli Düzeni

- `lg+`: sol sabit sidebar (**248px**, PHASE 04), üst header (hesap menüsü: avatar + kullanıcı adı → "Çıkış Yap"), içerik alanında breadcrumb + sayfa başlığı + aksiyonlar.
- `<lg`: header'da menü butonu → `Sheet` drawer.
- Sidebar: Genel Bakış, Başvurular, Hizmetler, İşlem Geçmişi — **iki hesap için aynı** (OD-24); rol bazlı menü yok. Çalışanlar, Ayarlar ve hesap sayfası **yok**.
- Giriş ekranı: logo + kullanıcı adı + şifre + "Giriş yap". "Şifremi unuttum" / "Kayıt ol" **yok** (OD-11).
- Başvuru listesi: tek liste; üstte statü sekmeleri/filtreleri: Tüm Başvurular · Evrak Bekleniyor · İncelemede · Düzeltme Bekleniyor · Evraklar Onaylandı · Başvuru İşlemde · Tamamlandı · İptal Edildi (OD-23).
- Tablolar: sticky header, satır hover, `md` altında kart listesine dönüşüm veya tablo içinde yatay scroll.
- Filtre çubuğu: arama + hizmet + statü + tarih aralığı + "Temizle".
- Sayfalama: önceki/sonraki + sayfa numarası + toplam kayıt.
- Başvuru detayı — bağlantı kartı: bağlantı (kısmen gizli gösterim + "Göster"), "Kopyala", "WhatsApp ile Paylaş", "Yenile", "İptal et"; iptal edilmişse "Yeni bağlantı oluştur".
- Evrak kartı (personel): aktif dosya + versiyon geçmişi (açılır), inceleme geçmişi, Onayla / Düzeltme iste, (izinliyse) "Müşteri adına yükle/değiştir".

## 7. Müşteri Paneli Düzeni (mobile-first)

Tek sütun, maks genişlik `max-w-2xl`, sidebar/tablo/grafik **yok**.

1. Header: "CS Global" metin logo (giriş/çıkış öğesi yok — erişim yalnızca bağlantı ile).
2. Hoş geldiniz kartı: "Merhaba {Ad}," + başvuru no + hizmet + oluşturma tarihi + statü rozeti.
3. **Süreç göstergesi:** 5 adım. `<sm`: dikey stepper (taşma yok); `sm+`: yatay. Aktif adım `aria-current="step"`. Düzeltme durumunda adım 2'de uyarı rozeti (BR §11.1).
4. **Evrak tamamlanma:** "3 / 5 zorunlu evrak yüklendi · %60" + `Progress` (`aria-valuenow`). Altında küçük metin "2 / 5 onaylandı" (varsa).
5. Bilgi kutusu (statüye göre): ne yapması gerektiği tek cümleyle.
6. **Evrak kartları** (sıralı):
   - Başlık + "Zorunlu"/"İsteğe bağlı" etiketi + durum rozeti.
   - Açıklama, talimat (açılır-kapanır "Nasıl yüklemeliyim?").
   - Düzeltme gerekçesi (varsa) — uyarı kutusu, başlık ve rozetlerin hemen altında (önce hangi evrak olduğu okunur), `role="status"`.
   - Aktif dosya (en fazla bir): ad (`truncate` + tam ad `title`), boyut ("2,4 MB"), tarih ("24.11.2026 14:05"), "Görüntüle", (izinliyse) "Değiştir" ve "Kaldır".
   - Yükleme alanı (aktif dosya yoksa): tam genişlik büyük buton "PDF Yükle" (native `<input type="file" accept="application/pdf,.pdf">` — mobilde dosya/iCloud/Drive seçici), sürükle-bırak yalnızca desktop'ta ek olarak. Yardım metni: "Yalnızca PDF · en fazla 10 MB".
   - Yükleme sırasında: gerçek % ilerleme + "Yükleniyor… %45"; sonrasında "Kontrol ediliyor…" → "Yüklendi". Değiştirme sırasında mevcut dosya, yenisi kabul edilene kadar görünür kalır.
   - Hatalar (Türkçe): "Yalnızca PDF dosyası yükleyebilirsiniz.", "Dosya boyutu en fazla 10 MB olabilir.", "Şifre korumalı PDF yüklenemez.", "Dosyanız doğrulanamadı. Lütfen farklı bir PDF yükleyin.", "Bu evrak için devam eden bir yükleme var.", "Başvurunuzun durumu bu sırada değiştiği için dosya kaydedilemedi.", "Bağlantı sorunu nedeniyle yükleme tamamlanamadı. Lütfen tekrar deneyin." Dosyalar için "virüssüz/güvenli" ifadesi **kullanılmaz** (OD-07).
7. **"İncelemeye Gönder"** butonu: mobilde ekran altına sabit (safe-area inset'li) birincil buton; koşullar sağlanmadıysa disabled + nedenler listesi ("Pasaport evrakı henüz yüklenmedi"). Onay dialog'u.
8. İletişim kartı (OD-14): şirket telefonu (`tel:`) ve WhatsApp iletişim bağlantısı (`https://wa.me/...`) — `src/config/company.ts`'ten. Değer yoksa buton disabled + "İletişim bilgisi yakında eklenecek".
9. Footer: aydınlatma metni linki (hukuki metin sağlandığında), "Bu bağlantı size özeldir, başkalarıyla paylaşmayınız."
10. Salt okunur statülerde (`UNDER_REVIEW`, `DOCUMENTS_APPROVED`, `IN_PROCESS`, `COMPLETED`, `CANCELLED`) yükleme/değiştirme/kaldırma/gönderim öğeleri gösterilmez; statüye uygun bilgi kutusu gösterilir.

Uzun içerik kuralları: `min-w-0`, kullanıcı/şablon metinlerinde `wrap-anywhere` (`overflow-wrap:anywhere` — flex/grid içinde `break-words` yetmedi, PHASE 07 E2E'de 807px taşma yakalandı), dosya adlarında `truncate` + `title`; sayfada **yatay overflow yok** (E2E'de `document.scrollingElement.scrollWidth <= innerWidth` kontrolü). Tablo hücreleri ve sayfa başlıkları dahil kullanıcı metni taşıyan her yerde `wrap-anywhere`; yerel `<select>` en uzun seçeneğe göre genişlediği için `min-w-0` (ve grid hücresinde `min-w-0`) zorunlu; E2E veritabanı sınır uzunluklu boşluksuz adlarla ölçer (PHASE 12, SEC-12).

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
- 3.3.8 Accessible Authentication: personel giriş formunda şifre yöneticisi ve yapıştırma engellenmez (`autocomplete="username"` / `"current-password"`). Müşteri tarafında kimlik doğrulama adımı yoktur.
- Canlı bölgeler: yükleme ilerlemesi ve sonuçları `aria-live="polite"`.
- Renk tek başına anlam taşımaz (ikon + metin).
- Otomatik test: axe (Playwright `@axe-core/playwright` — bağımlılık PHASE 11'de değerlendirilir) + manuel VoiceOver (iOS) / TalkBack (Android) kontrolü.

## 10. PHASE 04 Uygulanan Panel Bileşenleri

| Bileşen | Dosya | Kurallar |
|---|---|---|
| DashboardShell | `src/components/dashboard/dashboard-shell.tsx` | "İçeriğe geç" atlama bağlantısı (ilk odak), sabit sidebar + sticky header + `main#main-content`; içerik `max-w-7xl`, kenar boşluğu 16/24/32px |
| Sidebar / NavLinks | `sidebar.tsx`, `nav-links.tsx` | Logo "CS GLOBAL" + "Vize Danışmanlık"; öğe yüksekliği ≥44px; aktif: `primary-light` zemin + `primary-dark` metin + `aria-current="page"`; ikonlar dekoratif (`aria-hidden`); altta avatar (baş harf, `tr-TR` büyük harf) + kullanıcı adı + "Çıkış Yap" |
| MobileNavigation | `mobile-navigation.tsx` | <1024px; "Menüyü aç" (44px) → sol drawer `min(18rem, 85vw)`; Radix Dialog (odak kapanı, Escape, overlay, kaydırma kilidi, odak iadesi); sayfa değişince kapanır; geçiş 150–200ms |
| DashboardHeader / AccountMenu | `dashboard-header.tsx`, `account-menu.tsx` | Mobilde menü butonu + logo; sağda hesap menüsü (`aria-label="Hesap menüsü: <ad>"`), içerik: kullanıcı adı + "Çıkış Yap" (menü öğesi ≥44px). Hesap/ayar sayfası yok |
| Breadcrumb / PageHeader | `breadcrumb.tsx`, `page-header.tsx` | `nav[aria-label="Konum"]` + `ol`; son öğe `aria-current="page"`; tek `h1`; açıklama `text-muted-foreground` |
| StatCard | `stat-card.tsx` | Etiket `h2` + sayı (`text-3xl`, `tabular-nums`, `tr-TR` biçimi) + açıklama; ikon dekoratif; 1 → 2 (≥640px) → 4 (≥1280px) sütun |
| EmptyState / ErrorState / LoadingSkeleton | `empty-state.tsx`, `error-state.tsx`, `loading-skeleton.tsx` | Boş: nötr ikon + başlık + açıklama (`data-state="empty"`). Hata: `role="alert"`, `destructive-soft` zemin, Türkçe genel mesaj + "Tekrar dene" (`router.refresh`/`reset`) — boş durumdan görsel ve semantik olarak ayrı. Yükleniyor: `aria-busy="true"` + ekran okuyucu metni; pulse reduced-motion'da kapanır |
| ApplicationStatusBadge | `src/features/applications/components/application-status-badge.tsx` | Etiket + ikon + renk (§1.2); tek kaynak `status-labels.ts`; Badge varyantları `neutral` (Evrak Bekleniyor), `info` (İncelemede), `warning` (Düzeltme), `success` (Onaylandı/Tamamlandı), `processing` (İşlemde), `destructive` (İptal) |
| NotReadyPage | `not-ready.tsx` | Hazır olmayan modül: konum yolu + başlık + "Henüz kullanıma hazır değil" (sahte aksiyon yok) |

Son başvurular: ≥768px tablo (`caption` sr-only, `th scope="col"`), altında kart listesi (yatay kaydırma yok); satırlar bağlantı değildir (detay PHASE 06). Pasif "Yeni Başvuru" butonu `disabled` + görünür açıklama metni (`aria-describedby`). Ekran görüntüleri (yerel, commit edilmez): `screenshots/phase-04/`.

## 11. PHASE 05 Uygulanan Bileşenler (hizmet yönetimi)

| Bileşen | Dosya | Kurallar |
|---|---|---|
| ConfirmDialog | `src/components/dashboard/confirm-dialog.tsx` | Radix AlertDialog; odak kapanı, Escape = iptal, kapanınca odak tetikleyiciye; onay sürerken iki buton pasif + "İşleniyor…"; yıkıcı işlemde `destructive` buton; açıklamada sonucun geri alınabilir olduğu ve geçmiş kayıtların silinmeyeceği yazılır |
| FormField | `src/components/dashboard/form-field.tsx` | Etiket (zorunlu `*` dekoratif, isteğe bağlı "(isteğe bağlı)" metni) + alan + yardım + hata; `aria-invalid` + `aria-describedby`; karakter sayacı (kod noktası) |
| Textarea | `src/components/ui/textarea.tsx` | Input ile aynı kenarlık/odak/hata stilleri; düz metin |
| ServiceList / ServiceFilters | `src/features/services/components/` | ≥768px tablo (`caption`, `th scope`), altında kart listesi (44px "Düzenle"); arama GET formu (`role="search"`); Tümü/Aktif/Pasif bağlantıları `aria-current="page"`; boş katalog ≠ sonuç yok ≠ hata |
| ServiceForm / RequirementForm | aynı klasör | Kontrollü alanlar; istemci doğrulaması + sunucu doğrulaması; ilk hatalı alana odak; "Kaydediliyor…" + pasif buton (çift gönderim kilidi); "Kaydedilmemiş değişiklikler var." göstergesi; çakışmada "Sayfayı yenile" |
| ActiveStatusBadge / RequiredBadge | `status-badges.tsx` | Aktif (success) / Pasif (neutral); Zorunlu (info) / İsteğe bağlı (outline) — metin + ikon |
| RequirementList | `requirement-list.tsx` | Sıra numarası + başlık + rozetler; talimat `whitespace-pre-line` düz metin; 44px "Yukarı/Aşağı taşı" ikon butonları (erişilebilir ad: "<evrak> evrakını yukarı taşı"), uçta pasif; taşıma sonrası odak taşınan evrakta kalır; işlem sonucu `role="status"` |

Hizmet detay düzeni: konum yolu + başlık → (oluşturulduysa) başarı bildirimi → snapshot bilgi notu → [Genel bilgiler | Durum + Dosya kuralları (sabit)] → Evrak gereksinimleri. Ekran görüntüleri (yerel, commit edilmez): `screenshots/phase-05/`.

## 12. PHASE 06 Uygulanan Bileşenler (başvuru yönetimi)

| Bileşen | Dosya (`src/features/applications/components/`) | Kurallar |
|---|---|---|
| ApplicationsBrowser / ApplicationTable | `applications-browser.tsx`, `application-table.tsx` | Arama (URL'ye yazılmaz, "Temizle"), Durum/Hizmet/Sayfa başına seçimleri (`label`'lı native select), sayfalama "N kayıt · Sayfa X / Y" + Önceki/Sonraki; ≥1280px tablo (kart içinde yatay kaydırma — sayfa taşmaz), altında kart; telefon/e-posta listede yok; satırda Detay, Bağlantıyı kopyala, WhatsApp (yalnızca aktif bağlantıda); boş katalog ≠ sonuç yok ≠ hata |
| ApplicationCreateForm / CreateSuccess | `application-create-form.tsx`, `create-success.tsx` | İki bölüm (Müşteri Bilgileri, Hizmet Bilgileri); hizmet seçilince evrak önizlemesi (sıra, Zorunlu/İsteğe bağlı rozeti, talimat, sabit PDF kuralı, "Evrak listesini yenile"); ilk hatalı alana odak; "Oluşturuluyor…" + çift gönderim kilidi; başarıda "Başvuru başarıyla oluşturuldu!" + numara/müşteri/hizmet/durum + bağlantı + Kopyala / WhatsApp ile Paylaş / Başvuru Detayına Git / Yeni başvuru |
| CustomerInfoCard | `customer-info-card.tsx` | Görüntüleme `dl`; satır içi düzenleme formu; çakışmada "Sayfayı yenile"; iletişim değişince uyarı + bağlantı kartına bağlantı |
| AccessLinkCard | `access-link-card.tsx` | Durum rozeti (Bağlantı aktif / Bağlantı yok — başvuru statüsünden bağımsız); PHASE 07 uyarısı; bağlantı varsayılan gizli (Göster/Gizle); Kopyala; WhatsApp; Yenile ve İptal Et onay pencereleri (başvuru numarası + müşteri adı, sonuç açıklaması); bağlantı yoksa "Yeni bağlantı oluştur" |
| WhatsAppShareDialog | `whatsapp-share-dialog.tsx` | Radix Dialog; "Mesajı hazırla" → alıcı adı + telefon (BR-162) + mesaj önizlemesi; "WhatsApp'ta aç" yalnızca bağlantı (`target=_blank`, `noopener noreferrer`); "Mesajı kopyala"; kapanınca mesaj bellekten silinir |
| CopyLinkButton, LinkStatusBadge, DocumentStatusBadge | aynı klasör | Kopyalama sonucu `role=status/alert`; başarısızsa seçilebilir alan; evrak statüsü etiketleri STATE_TRANSITIONS §2 (metin + ikon) |

Hassas alanlar `data-sensitive` ile işaretlidir (ekran görüntüsü maskesi). Dashboard: Yeni Başvuru aktif; Son Başvurular ve İnceleme Bekleyenler satırları detaya, başlıkta "Tümünü Gör"; Toplam/İncelemede/Tamamlanan kartlarında "Listele" (Evrak Bekleyen iki statüyü kapsadığı için bağlantısız). Ekran görüntüleri: `screenshots/phase-06/` (yerel, commit edilmez).

## 13. PHASE 07 Uygulanan Bileşenler (müşteri paneli)

| Bileşen | Dosya (`src/features/customer-portal/components/`) | Kurallar |
|---|---|---|
| PortalShell | `portal-shell.tsx` | Header metin logo (giriş/çıkış öğesi yok), `main` `max-w-2xl`, safe-area dolgusu; footer "Bu bağlantı size özeldir, başkalarıyla paylaşmayınız." |
| WelcomeCard | `welcome-card.tsx` | "Merhaba, {Ad Soyad}" (h1), `dl`: Başvuru No, Durum rozeti, Hizmet (snapshot), Oluşturulma tarihi (`Europe/Istanbul`); statü mesajı bilgi kutusu; COMPLETED'a "(Resmî vize sonucu değildir.)" |
| ProcessStepper | `process-stepper.tsx` | `ol`; `<sm` dikey, `sm+` yatay; tamamlandı/aktif/sırada + düzeltmede uyarı ikonu; `aria-current="step"`; CANCELLED'da nötr bilgi kartı; "vize sonucu veya süre hakkında bilgi vermez" notu |
| DocumentProgress | `document-progress.tsx` | "X / Y zorunlu evrak yüklendi · %Z", `role="progressbar"` + `aria-valuenow`; çubuk SVG (CSP — satır içi stil yok); toplam/eksik/onaylanan/düzeltme bekleyen satırları; zorunlu evrak yoksa "Zorunlu evrak bulunmuyor" |
| DocumentCard | `document-card.tsx` | Sıra numaralı başlık, Zorunlu/İsteğe bağlı + durum rozeti, düzeltme açıklaması (`role="status"`), açıklama, "Nasıl yüklemeliyim?" (`details` varsayılan açık, klavyeyle aç/kapa), sabit dosya kuralı satırı; düzenlenebilir statüde onaylanmamış evrakta "PDF yükleme yakında kullanıma açılacak." kutusu (dosya seçici yok, sahte başarı yok) |
| SubmitPlaceholder | `submit-placeholder.tsx` | Devre dışı "İncelemeye Gönder" + "yakında" açıklaması (PHASE 09) |
| ContactCard | `contact-card.tsx` | `company.ts`; değer `null` → devre dışı Telefon/WhatsApp + "İletişim bilgisi yakında eklenecek." (uydurma numara yok) |
| AccessMessage | `access-message.tsx` | Geçersiz bağlantı / oturum sona erdi / sayfa güncel değil / şu anda erişilemiyor; ikon + başlık (h1) + tek cümle; geçici hatada "Yeniden dene"; kişisel veri yok |
| RevalidateOnReturn, ReloadButton | aynı klasör | Görünmez yeniden doğrulama; erişilebilir buton |

Doğrulama: 320, 360, 375, 390, 414, 430, 768, 1024, 1440 px'te uzun boşluksuz metinlerle yatay taşma yok ve 44px'ten alçak buton/`summary` yok (Chrome + WebKit); klavye odak görünür. Ekran görüntüleri: `screenshots/phase-07/` (yerel, sentetik, commit edilmez).

## 14. PHASE 08 Uygulanan Bileşenler (PDF yükleme ve dosya yönetimi)
- **`PdfUpload`** (`src/features/documents/components/pdf-upload.tsx`; müşteri ve personel ortak): gizli `input[type=file][accept="application/pdf,.pdf"]` + görünür buton (müşteride `lg` ≥ 44 px; personelde `default`). Buton hydration tamamlanana ve yükleme bitene kadar pasif (çift gönderim yok). Durumlar (`role="status"`, `aria-live="polite"`, butonla `aria-describedby`): "Dosya kontrol ediliyor…" → "Yükleniyor — %X" + yerel `<progress max=100 value>` (gerçek `upload.onprogress`; satır içi stil yok — CSP) → "Sunucuda doğrulanıyor ve kaydediliyor…" + belirsiz `<progress>` → "Yüklendi" (yalnızca sunucu başarısında; ✓ ikon, `text-success-strong`) / "Yükleme başarısız: …" (Türkçe neden + "Önceki dosyanız korunuyor."; `text-destructive`, `wrap-anywhere`). %100 aktarım "Yüklendi" sayılmaz. Personel değiştirmesinde `ConfirmDialog` ("Dosya değiştirilsin mi?" — eski dosyanın geçmişte korunacağı; onaylı evrakta onayın aktarılmayacağı uyarısı); onay tıklaması dosya seçiciyi aynı kullanıcı hareketinde açar.
- **Müşteri `DocumentCard`:** yer tutucu kaldırıldı. Aktif dosya kutusu (dosya ikonu, ad `wrap-anywhere` + `title`, boyut, yükleme tarihi, "Görüntüle" — yeni sekme — ve "İndir", ≥ 44 px bağlantılar); izinliyse "PDF Yükle" / "Dosyayı Değiştir". Eski versiyonlar müşteriye gösterilmez. "İncelemeye Gönder" PHASE 09'a kadar pasif.
- **`StaffDocumentCard`** (`src/features/documents/components/staff-document-card.tsx`): evrak adı, Zorunlu/İsteğe bağlı, evrak statüsü, aktif dosya (ad, `v<n>`, boyut, yükleyen — "Müşteri" veya personel kullanıcı adı, tarih), "Yapısal kontrol tamamlandı (antivirüs taraması değildir)" notu, "Dosyayı Görüntüle"/"Dosyayı İndir", "Müşteri Adına PDF Yükle"/"Dosyayı Değiştir", `<details>` "Dosya Geçmişi (n)" (v, müşteri/personel, Aktif/Önceki versiyon rozeti, tarih, ad, boyut, görüntüle/indir). Kalıcı silme, onay/ret/düzeltme, yorum butonları yok (PHASE 09/10). İki hesap aynı arayüzü görür.
- **`StorageCapacityCard`** (dashboard): "Dosya Depolama", `2,40 GB / 9 GB` (tr-TR; sınır yapılandırmadan — hedef 100 GB, OD-26), `role="meter"` + SVG çubuk (ok: `fill-primary`, ≥ 8 GB: `fill-warning`, ≥ 9 GB: `fill-destructive`), "%X kullanıldı · Kalan", aktif / önceki versiyon / devam eden / temizlik bekleyen dökümü, son sağlayıcı mutabakatı, uyarı kutusu (`role="alert"`: "Depolama kapasitesi dolmak üzere." / "Depolama kapasitesi dolu."). Not: "Uygulama kayıtlarından hesaplanır (sağlayıcı faturalama verisi değildir)." Yapılandırma yoksa "Depolama kullanımı şu anda hesaplanamıyor." Müşteri panelinde yok.
- Uzun dosya adları 320 px'te yatay taşma yapmaz (E2E); dosya adı her yerde `wrap-anywhere`.
- Gerçek cihazda (iOS Safari, Android Chrome, WhatsApp in-app) dosya seçici ve görüntüleme **doğrulanmadı**; testler tarayıcı emülasyonu.

## 15. PHASE 09 Uygulanan Bileşenler (iş akışı)
- **Personel `WorkflowPanel`** ("Başvuru durumu ve işlemler"): statü rozeti + yalnızca matristen çıkan aksiyon butonları (keyfî statü seçimi yok); koşulu sağlanmayanlar pasif, altında Türkçe nedenler. Her aksiyon `ConfirmDialog` ister; T7–T12'de "Gerekçe (personel içi, müşteriye gösterilmez)" zorunlu (boşsa pencere kapanmaz). İptal metni: "Başvuru ve yüklenmiş evraklar silinmeyecektir…". T12: onaylı evrak seçimi + her evrak için müşteriye görünür açıklama + gerekçe.
- **`ReviewActions`**: "İncelenen dosya: v<n>", "Onayla" (onay penceresi), "Düzeltme İste" (müşteriye görünür açıklama 10–1000, yardım metni + `aria-describedby`), izinliyse "Dosyayı Kaldır" (yıkıcı onay). Sonuç `role="status"`.
- **İnceleme geçmişi** (`<details>`): karar, dosya versiyonu, inceleyen, tarih, müşteriye açıklama. Dosya geçmişinde kaldırılan versiyon "Kaldırıldı".
- **Statü geçmişi** (personel): geçiş etiketi → hedef statü · aktör ("Müşteri", kullanıcı adı, "(müşteri adına)") · tarih; gerekçe ayrı satırda "Gerekçe (personel içi)".
- **Yorumlar** (personel): liste + "Müşteriye görünecek yorum" formu (düzenlenemez/silinemez uyarısı; çift gönderim kilidi).
- **Müşteri `SubmitPanel`**: "İncelemeye gönder" / "Yeniden incelemeye gönder"; engeller listesi (pasif buton `aria-describedby`); onay penceresi "İnceleme süresince evraklarınızı değiştiremezsiniz…"; `UNDER_REVIEW`'da kalıcı "Evraklarınız incelemeye gönderildi…" kutusu.
- **Müşteri `RemoveFileButton`** (izinli statülerde, ≥ 44 px, yıkıcı onay), **"CS Global'den mesajlar"** (yazar yok, HTML çalışmaz), **"Süreç geçmişi"** (statü + tarih).
- Gerçek cihaz doğrulanmadı.

## 16. PHASE 11 Polish (uygulandı)
- **PDF görüntüleyici** (`PdfViewerDialog` + tembel `PdfViewer`): "Görüntüle" düğmesi tam ekran Radix Dialog açar (mobilde kenarsız tam ekran, ≥640px kenar boşluklu yuvarlatılmış panel); başlık satırında belge adı (taşarsa kırpılır, `title` ile tamamı) ve "Görüntüleyiciyi kapat" (44 px); araç çubuğu `role="toolbar"`: Önceki/Sonraki sayfa, "Sayfa X / N" (`aria-live="polite"`), Uzaklaştır/Yakınlaştır (%50–%300); tuval `role="img"` + Türkçe ad; yükleme "Belge yükleniyor…" (`role="status"`); hata `role="alert"` + "Dosyayı İndir". Escape ve kapatma düğmesi; kapanınca odak tetikleyiciye döner. Müşteri tetikleyicisi 44 px (`size="large"`), personel 40/36 px.
- **Yükleme aşamaları** (11.C): "Dosya hazırlanıyor…" → "Gönderiliyor — %N" (tarayıcının gerçek aktarım ilerlemesi) → "Kontrol ediliyor ve kaydediliyor…" (belirsiz ilerleme çubuğu + "Sayfadan ayrılmayın" ipucu) → "Yüklendi" (yalnızca sunucu kaydından sonra). Üç adımlı görsel adım listesi (ekran okuyucuya tekrar edilmez). Sahte yüzde veya süre tahmini yoktur.
- **İşlem geçmişi filtreleri:** < 1024 px'de katlanır ("Filtreleri göster", etkin filtre sayısı rozeti, `aria-expanded`/`aria-controls`); masaüstünde her zaman açık.
- **Taşma/kesilme düzeltmeleri:** başvuru özetinde numara tek satır (`whitespace-nowrap`, numara sütunu `max-content`); müşteri bilgilerinde uzun e-posta/ad kart içinde kırılır (`min-w-0 wrap-anywhere`); Genel Bakış "Son Başvurular" tablosunda Hizmet sütunu yalnızca ≥1536 px (yan panelle Durum sütunu kesiliyordu).
- **Ön-getirme (D-137):** liste/tablo/kart/sayfalama bağlantıları `prefetch={false}`; görsel değişiklik yoktur.

## 17. PHASE 11.1 Ekleri
- **Görüntüleyici:** "Sayfa" sayı alanı + "Git" (ilk/son sınırına kırpılır; 3+ sayfalı belgelerde); klavye: ←/PageUp önceki, →/PageDown sonraki, Home/End ilk/son sayfa (görüntüleyici açıkken pencere düzeyinde; metin alanında yazarken devre dışı); ekran okuyucu ipucu (`aria-describedby`).
- **Başvuru detayı — evrak statü özeti** (`RequirementSummary`): "N evrak" + sıfır olmayan statü rozetleri ve sayıları; erişilebilir tek cümlelik özet etiketi; ek sorgu yok.

## PHASE 12.1 — Müşteri bağlantısı ara sayfası (D-141)

- `PortalShell` içinde (CS Global metin logosu, gizlilik altbilgisi "Bu bağlantı size özeldir…"); kart: ikon (ShieldCheck), `h1` "Başvuru Takip Paneli", açıklama "Başvurunuzun güncel durumunu takip etmek ve gerekli belgelerinizi yüklemek için devam edin.", birincil düğme "Başvurumu Görüntüle" (`lg`, ≥ 44 px, mobilde tam genişlik).
- Müşteri bilgisi yok; yeni logo/çerçeve yok. Bekleme durumu gerçek gezinmeye bağlı ("Açılıyor…", `aria-disabled`, ikinci tıklama yeni istek göndermez); geri tuşuyla dönüşte düğme yeniden etkin.
- 320 px'de taşma yok; klavye (Tab + Enter) ile gönderilir; JavaScript olmadan da çalışır (yerel form POST).
