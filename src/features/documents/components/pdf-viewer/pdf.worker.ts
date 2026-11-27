/**
 * pdf.js worker giriş noktası (PHASE 11, D-136). Worker paketten yerel olarak derlenir ve aynı kökenden
 * (`/_next/static`) sunulur — harici CDN yok; CSP'de yalnızca `worker-src 'self'`. Worker kapsamında
 * içe aktarıldığında pdf.js kendini mesaj portuna bağlar.
 */
import "pdfjs-dist/build/pdf.worker.min.mjs";
