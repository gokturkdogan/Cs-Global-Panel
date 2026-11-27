import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LinkEntryForm } from "@/features/customer-portal/components/link-entry-form";
import { messages } from "@/lib/messages";
import { isAccessTokenShape } from "@/server/customer-session/access";

/**
 * Müşteri bağlantısı ara sayfası `GET /b/[token]` (PHASE 12.1, D-141). Veritabanına ERİŞMEZ, oturum
 * açmaz, cookie yazmaz/değiştirmez; geçerli ve geçersiz bağlantılar aynı genel sayfayı görür (varlık
 * kahini yok). Oturum yalnızca kullanıcının açık eylemiyle `POST /b/enter` üzerinden açılır; böylece
 * bağlantıyı GET/HEAD ile izleyen önizleme istemcileri müşteri verisine ulaşamaz.
 *
 * Token bu sayfanın URL'sinde zaten vardır. Biçimsiz girdi (herkesçe bilinen biçim kuralı; varlık bilgisi
 * değil) veritabanına gitmeden genel geçersiz ekrana yönlendirilir → uzun/bozuk girdi geri yansıtılmaz.
 * Yanıt `no-store`, noindex.
 *
 * Referrer politikası (D-146): `no-referrer` altında tarayıcılar form POST'unda `Origin: null` gönderir ve
 * köken/CSRF kontrolü (D-069) meşru girişi de reddeder. Bu sayfa bu yüzden `strict-origin` kullanır:
 * Referer EN FAZLA köken içerir, yol/token asla gönderilmez; sayfada harici kaynak/bağlantı yoktur (CSP).
 * Portal ve diğer müşteri sayfaları `no-referrer` kalır.
 */
export const metadata: Metadata = { referrer: "strict-origin" };

export default async function LinkEntryPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  if (!isAccessTokenShape(token)) redirect("/link-invalid");
  return (
    <section
      aria-labelledby="link-entry-title"
      className="grid justify-items-center gap-4 rounded-xl border bg-card px-5 py-8 text-center shadow-sm"
      data-portal-state="entry"
    >
      <span
        aria-hidden="true"
        className="inline-flex size-12 items-center justify-center rounded-full bg-primary-light text-primary-dark"
      >
        <ShieldCheck className="size-6" />
      </span>
      <h1 id="link-entry-title" className="text-2xl leading-8 font-semibold text-foreground">
        {messages.portal.entryTitle}
      </h1>
      <p className="max-w-md text-base text-muted-foreground">{messages.portal.entryDescription}</p>
      <LinkEntryForm token={token} />
    </section>
  );
}
