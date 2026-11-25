import type { CustomerDocument } from "../queries";
import { documentCompletion } from "../domain/progress";

/** Evrak ilerlemesi (BR-110…BR-114): süreç ilerlemesinden ayrı; isteğe bağlı evrak eksiklik sayılmaz. */
export function DocumentProgress({
  documents,
}: {
  readonly documents: readonly CustomerDocument[];
}) {
  const completion = documentCompletion(documents);
  return (
    <section
      aria-labelledby="documents-progress-title"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      data-testid="document-progress"
    >
      <h2 id="documents-progress-title" className="text-lg leading-7 font-semibold">
        Evrak İlerlemem
      </h2>
      {completion.percent === null ? (
        <p className="text-base text-foreground">Zorunlu evrak bulunmuyor.</p>
      ) : (
        <>
          <p
            className="text-base text-foreground tabular-nums"
            data-testid="document-progress-text"
          >
            {completion.requiredUploaded} / {completion.requiredTotal} zorunlu evrak yüklendi · %
            {completion.percent}
          </p>
          <div
            role="progressbar"
            aria-label="Zorunlu evrak yükleme ilerlemesi"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={completion.percent}
            className="h-3 w-full overflow-hidden rounded-full bg-muted"
          >
            {/* SVG genişlik niteliği: satır içi style yok (nonce'lu CSP — D-064). */}
            <svg aria-hidden="true" className="block h-full w-full">
              {/* viewBox yok: yüzde genişlik + piksel yarıçap → uçlar gerilmeden yuvarlak. */}
              <rect
                width={`${completion.percent}%`}
                height="100%"
                rx="6"
                className="fill-primary"
              />
            </svg>
          </div>
        </>
      )}
      <ul className="grid gap-1 text-sm text-muted-foreground">
        <li>
          Toplam evrak: {completion.total} ({completion.requiredTotal} zorunlu,{" "}
          {completion.total - completion.requiredTotal} isteğe bağlı)
        </li>
        {completion.requiredTotal > 0 ? (
          <li>Eksik zorunlu evrak: {completion.requiredMissing}</li>
        ) : null}
        {completion.requiredApproved > 0 ? (
          <li>
            Onaylanan zorunlu evrak: {completion.requiredApproved} / {completion.requiredTotal}
          </li>
        ) : null}
        {completion.revisionCount > 0 ? (
          <li className="font-medium text-warning-strong">
            Düzeltme bekleyen evrak: {completion.revisionCount}
          </li>
        ) : null}
      </ul>
    </section>
  );
}
