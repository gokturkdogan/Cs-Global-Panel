import { AccessMessage } from "@/features/customer-portal/components/access-message";
import { ContactCard } from "@/features/customer-portal/components/contact-card";
import { DocumentCard } from "@/features/customer-portal/components/document-card";
import { DocumentProgress } from "@/features/customer-portal/components/document-progress";
import { ProcessStepper } from "@/features/customer-portal/components/process-stepper";
import { RevalidateOnReturn } from "@/features/customer-portal/components/revalidate-on-return";
import {
  CustomerComments,
  CustomerTimeline,
} from "@/features/customer-portal/components/comments-and-timeline";
import { SubmitPanel } from "@/features/customer-portal/components/submit-panel";
import { WelcomeCard } from "@/features/customer-portal/components/welcome-card";
import {
  submissionBlockers,
  submissionTransition,
} from "@/features/applications/domain/application-status";
import { canRemoveFile } from "@/features/documents/domain/document-status";
import { canUploadDocument } from "@/features/documents/domain/upload-rules";
import { messages } from "@/lib/messages";
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

  const status = view.application.status;
  const submitKind = submissionTransition(status);
  const pending = new Set(view.pendingUploadRequirementIds);
  // BR-50 guard'ları sunucu verisinden (istemci ilerleme değeri değil); asıl kontrol aksiyonda kilit altında.
  const blockers = submissionBlockers(
    status,
    view.documents.map((document) => ({
      isRequired: document.isRequired,
      status: document.status,
      hasActiveFile: document.activeFile !== null,
      hasPendingUpload: pending.has(document.requirementId),
    })),
  )
    .filter((blocker) => blocker !== "WRONG_STATUS")
    .map((blocker) => messages.workflow.blockers[blocker]);
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
                key={document.requirementId}
                document={document}
                index={index}
                context={context}
                canUpload={canUploadDocument("CUSTOMER", status, document.status)}
                canRemove={canRemoveFile("CUSTOMER", status, document.status)}
              />
            ))}
          </ol>
        )}
      </section>
      {submitKind !== null ? (
        <SubmitPanel
          contextId={context}
          expectedVersion={view.application.version}
          kind={submitKind}
          blockers={blockers}
        />
      ) : null}
      {status === "UNDER_REVIEW" ? (
        <p
          role="status"
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-base"
          data-testid="submitted-notice"
        >
          {messages.workflow.submitted} İnceleme süresince evraklarınızı değiştiremezsiniz; gerekli
          görülürse danışmanlarımız sizden düzeltme isteyecektir.
        </p>
      ) : null}
      <CustomerComments comments={view.comments} />
      <CustomerTimeline timeline={view.timeline} />
      <ContactCard />
    </div>
  );
}
