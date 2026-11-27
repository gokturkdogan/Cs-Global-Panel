"use client";

import { RefreshCw } from "lucide-react";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { describedBy, FormField } from "@/components/dashboard/form-field";
import { useUnsavedChangesWarning } from "@/components/dashboard/use-unsaved-changes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_PDF_SIZE_BYTES } from "@/config/constants";
import { RequiredBadge } from "@/features/services/components/status-badges";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";

import { createApplicationAction, getServicePreviewAction } from "../actions";
import type { ServiceOption, ServicePreview } from "../queries";
import { customerFieldsSchema } from "../schemas";
import type { CreatedApplication } from "../service";
import { CreateSuccess } from "./create-success";

const EMPTY = { firstName: "", lastName: "", phone: "", email: "", serviceId: "" };
type Field = keyof typeof EMPTY;
const ORDER: Field[] = ["firstName", "lastName", "phone", "email", "serviceId"];
const MAX_PDF_MB = MAX_PDF_SIZE_BYTES / (1024 * 1024);

/**
 * Yeni başvuru formu. Hizmet seçilince aktif evraklar sunucudan önizlenir; gönderimde önizlemenin
 * parmak izi gönderilir — şablon bu arada değiştiyse sunucu reddeder ve önizleme yenilenir (D-079).
 * Aynı form gönderimi (çift tıklama/ağ hatası) aynı idempotency anahtarıyla tekrar edilir → tek kayıt.
 */
export function ApplicationCreateForm({
  services,
}: {
  readonly services: readonly ServiceOption[];
}) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<ServicePreview | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "error">("idle");
  const [result, setResult] = useState<CreatedApplication | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const idempotencyKey = useRef<string | null>(null);
  const previewRequest = useRef(0);
  const refs = useRef<Partial<Record<Field, HTMLInputElement | HTMLSelectElement | null>>>({});

  const dirty = result === null && JSON.stringify(values) !== JSON.stringify(EMPTY);
  useUnsavedChangesWarning(dirty && !pending);

  const set = (field: Field, value: string) =>
    setValues((current) => ({ ...current, [field]: value }));
  const focusFirst = (fieldErrors: Record<string, string>) => {
    const field = ORDER.find((name) => fieldErrors[name]);
    if (field) refs.current[field]?.focus();
  };

  async function loadPreview(serviceId: string) {
    const id = ++previewRequest.current;
    setPreview(null);
    if (serviceId === "") return setPreviewState("idle");
    setPreviewState("loading");
    const response = await getServicePreviewAction({ serviceId });
    if (id !== previewRequest.current) return;
    if (response.ok) {
      setPreview(response.data);
      setPreviewState("idle");
    } else {
      setPreviewState("error");
      setErrors((current) => ({ ...current, serviceId: response.error.message }));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitting.current) return;
    setFeedback(null);
    const { serviceId, ...customer } = values;
    const check = customerFieldsSchema.safeParse(customer);
    const fieldErrors = check.success ? {} : fieldErrorsOf(check.error);
    if (serviceId === "") fieldErrors.serviceId = messages.applications.validation.serviceRequired;
    else if (preview === null) fieldErrors.serviceId = messages.applications.serviceUnavailable;
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      focusFirst(fieldErrors);
      return;
    }
    setErrors({});
    submitting.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    const input = {
      ...customer,
      serviceId,
      idempotencyKey: idempotencyKey.current,
      templateFingerprint: preview!.fingerprint,
    };
    startTransition(async () => {
      let response: ActionResult<CreatedApplication>;
      try {
        response = await createApplicationAction(input);
      } catch {
        // Ağ hatası: anahtar korunur; tekrar gönderim aynı başvuruyu döndürür (çift kayıt yok).
        response = { ok: false, error: { code: "INTERNAL", message: messages.common.internal } };
      }
      submitting.current = false;
      if (response.ok) {
        setResult(response.data);
        window.scrollTo({ top: 0 });
        return;
      }
      if (response.error.code === "STALE_PREVIEW") {
        setFeedback(response.error.message);
        await loadPreview(serviceId);
        return;
      }
      setErrors(response.error.fieldErrors ?? {});
      focusFirst(response.error.fieldErrors ?? {});
      setFeedback(response.error.message);
    });
  }

  if (result !== null) {
    return (
      <CreateSuccess
        result={result}
        onNew={() => {
          setResult(null);
          setValues(EMPTY);
          setPreview(null);
          idempotencyKey.current = null; // bilinçli yeni başvuru: yeni anahtar
        }}
      />
    );
  }

  const field = (
    name: Exclude<Field, "serviceId">,
    label: string,
    props: React.ComponentProps<typeof Input>,
    hint?: string,
  ) => (
    <FormField id={`application-${name}`} label={label} required error={errors[name]} hint={hint}>
      <Input
        ref={(element) => {
          refs.current[name] = element;
        }}
        id={`application-${name}`}
        value={values[name]}
        onChange={(event) => set(name, event.target.value)}
        aria-invalid={errors[name] ? true : undefined}
        aria-describedby={describedBy(`application-${name}`, {
          hint: Boolean(hint),
          error: errors[name],
        })}
        {...props}
      />
    </FormField>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
    >
      <section
        aria-labelledby="customer-section"
        className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="customer-section" className="text-lg leading-7 font-semibold">
          Müşteri Bilgileri
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "Ad", { autoComplete: "off", maxLength: 120 })}
          {field("lastName", "Soyad", { autoComplete: "off", maxLength: 120 })}
        </div>
        {field(
          "phone",
          "Telefon numarası",
          {
            type: "tel",
            inputMode: "tel",
            autoComplete: "off",
            maxLength: 32,
            placeholder: "0532 123 45 67",
          },
          "Türkiye numaraları 0 ile; yurt dışı numaralar + ve ülke koduyla. Numara doğrulanmaz, yalnızca biçimi kontrol edilir.",
        )}
        {field(
          "email",
          "E-posta adresi",
          { type: "email", inputMode: "email", autoComplete: "off", maxLength: 254 },
          "Sistem e-posta göndermez.",
        )}
      </section>

      <section
        aria-labelledby="service-section"
        className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
      >
        <h2 id="service-section" className="text-lg leading-7 font-semibold">
          Hizmet Bilgileri
        </h2>
        {services.length === 0 ? (
          <Alert variant="destructive" role="note">
            <AlertDescription>{messages.applications.noActiveServices}</AlertDescription>
          </Alert>
        ) : (
          <FormField id="application-serviceId" label="Hizmet" required error={errors.serviceId}>
            <select
              ref={(element) => {
                refs.current.serviceId = element;
              }}
              id="application-serviceId"
              value={values.serviceId}
              onChange={(event) => {
                set("serviceId", event.target.value);
                setErrors((current) =>
                  Object.fromEntries(
                    Object.entries(current).filter(([key]) => key !== "serviceId"),
                  ),
                );
                void loadPreview(event.target.value);
              }}
              aria-invalid={errors.serviceId ? true : undefined}
              aria-describedby={describedBy("application-serviceId", { error: errors.serviceId })}
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none aria-invalid:border-destructive md:text-sm"
            >
              <option value="">Hizmet seçin</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        <div
          aria-live="polite"
          aria-busy={previewState === "loading"}
          data-testid="service-preview"
          className="grid gap-3"
        >
          {previewState === "loading" ? (
            <p className="text-sm text-muted-foreground">Evrak listesi yükleniyor…</p>
          ) : null}
          {preview !== null ? (
            <>
              {preview.service.description ? (
                <p className="text-sm whitespace-pre-line text-muted-foreground">
                  {preview.service.description}
                </p>
              ) : null}
              <h3 className="text-sm font-semibold text-foreground">
                Müşteriden istenecek evraklar ({preview.requirements.length})
              </h3>
              {preview.requirements.length === 0 ? (
                <Alert variant="destructive" role="note">
                  <AlertDescription>{messages.applications.noActiveRequirements}</AlertDescription>
                </Alert>
              ) : (
                <ol className="grid gap-2">
                  {preview.requirements.map((requirement, index) => (
                    <li key={requirement.id} className="grid gap-1 rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <span className="text-sm font-medium wrap-anywhere">
                          <span className="mr-1.5 text-muted-foreground tabular-nums">
                            {index + 1}.
                          </span>
                          {requirement.title}
                        </span>
                        <RequiredBadge isRequired={requirement.isRequired} />
                      </div>
                      {requirement.instructions ? (
                        <p className="text-sm wrap-anywhere whitespace-pre-line text-muted-foreground">
                          {requirement.instructions}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              <p className="text-xs text-muted-foreground">
                Tüm evraklar: yalnızca PDF, dosya başına en fazla {MAX_PDF_MB} MB, evrak başına tek
                aktif dosya.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => void loadPreview(values.serviceId)}
              >
                <RefreshCw aria-hidden="true" />
                Evrak listesini yenile
              </Button>
            </>
          ) : null}
        </div>
      </section>

      <div className="grid gap-3 xl:col-span-2">
        {errors._form ? (
          <Alert variant="destructive">
            <AlertDescription>{errors._form}</AlertDescription>
          </Alert>
        ) : null}
        {feedback ? (
          <p role="alert" className="text-sm text-destructive-strong">
            {feedback}
          </p>
        ) : null}
        <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
          {dirty && !pending ? (
            <span className="text-sm text-muted-foreground sm:mr-auto">
              {messages.common.unsavedChanges}
            </span>
          ) : null}
          <Button type="submit" size="lg" disabled={pending || services.length === 0}>
            {pending ? "Oluşturuluyor…" : "Başvuru Oluştur"}
          </Button>
        </div>
      </div>
    </form>
  );
}
