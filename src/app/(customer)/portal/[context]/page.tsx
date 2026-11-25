import { AccessMessage } from "@/features/customer-portal/components/access-message";
import { ContactCard } from "@/features/customer-portal/components/contact-card";
import { DocumentCard } from "@/features/customer-portal/components/document-card";
import { DocumentProgress } from "@/features/customer-portal/components/document-progress";
import { ProcessStepper } from "@/features/customer-portal/components/process-stepper";
import { RevalidateOnReturn } from "@/features/customer-portal/components/revalidate-on-return";
import { SubmitPlaceholder } from "@/features/customer-portal/components/submit-placeholder";
import { WelcomeCard } from "@/features/customer-portal/components/welcome-card";
import { isCustomerEditable } from "@/features/customer-portal/domain/progress";
import { getCustomerPortalView, type CustomerPortalView } from "@/features/customer-portal/queries";
import { requireCustomerAccess } from "@/server/customer-session/access";
import { getDb } from "@/server/db/client";
import { pgErrorCode } from "@/server/db/errors";

type PageProps = { params: Promise<{ context: string }> };

/**
 * Müşteri paneli `/portal/<bağlam>` (D-087…D-092). Her istekte: imzalı cookie → süre → URL bağlamı =
 * cookie bağlamı → token aktif + başvuru silinmemiş (veritabanı). Erişim yoksa yalnızca genel ekran.
 * Personel oturumu kullanılmaz. Sayfa dinamik ve `no-store`; sekmeye dönüşte yeniden doğrulanır.
 */
export default async function PortalPage({ params }: PageProps) {
  const { context } = await params;
  const access = await requireCustomerAccess(context);
  if (!access.ok) {
    return (
      <>
        <RevalidateOnReturn />
        <AccessMessage kind={access.reason === "missing" ? "invalid" : access.reason} />
      </>
    );
  }

  let view: CustomerPortalView | null;
  try {
    view = await getCustomerPortalView(getDb(), access.access);
  } catch (error) {
    console.error("[portal] Başvuru okunamadı", { code: pgErrorCode(error) ?? "unknown" });
    return <AccessMessage kind="unavailable" />;
  }
  if (view === null) return <AccessMessage kind="invalid" />;

  const editable = isCustomerEditable(view.application.status);
  return (
    <div className="grid gap-5">
      <RevalidateOnReturn />
      <WelcomeCard view={view} />
      <ProcessStepper status={view.application.status} />
      <DocumentProgress documents={view.documents} />
      <section aria-labelledby="documents-title" className="grid gap-3">
        <h2 id="documents-title" className="text-xl leading-7 font-semibold">
          Evraklarım
        </h2>
        {view.documents.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-base text-muted-foreground">
            Bu başvuru için evrak listesi bulunmuyor.
          </p>
        ) : (
          <ol className="grid gap-3" data-testid="portal-documents">
            {view.documents.map((document, index) => (
              <DocumentCard
                key={`${index}-${document.title}`}
                document={document}
                index={index}
                editable={editable}
              />
            ))}
          </ol>
        )}
      </section>
      {editable ? <SubmitPlaceholder /> : null}
      <ContactCard />
    </div>
  );
}
