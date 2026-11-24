"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { describedBy, FormField } from "@/components/dashboard/form-field";
import { useUnsavedChangesWarning } from "@/components/dashboard/use-unsaved-changes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_TEXT_LIMITS } from "@/config/constants";
import type { ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";

import { createServiceAction, updateServiceAction } from "../actions";
import { createServiceSchema, fieldErrorsOf, updateServiceSchema } from "../schemas";

type ServiceFormProps =
  | { readonly mode: "create" }
  | {
      readonly mode: "edit";
      readonly serviceId: string;
      readonly version: number;
      readonly initial: { readonly name: string; readonly description: string | null };
    };

type Feedback = { readonly kind: "success" | "error" | "conflict"; readonly message: string };

/**
 * Hizmet genel bilgileri formu. Kontrollü alanlar (hata durumunda girilen veri kaybolmaz); istemci
 * doğrulaması yalnızca kullanıcı deneyimi içindir, asıl doğrulama sunucudadır. Gönderim sürerken
 * buton pasiftir (çift gönderim yok).
 */
export function ServiceForm(props: ServiceFormProps) {
  const router = useRouter();
  const initialName = props.mode === "edit" ? props.initial.name : "";
  const initialDescription = props.mode === "edit" ? (props.initial.description ?? "") : "";
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isActive, setIsActive] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pending, startTransition] = useTransition();
  // Render beklenmeden gelen ikinci tıklamaya karşı eşzamanlı kilit (çift gönderim yok).
  const submitting = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const dirty =
    props.mode === "create"
      ? name !== "" || description !== "" || isActive
      : name !== initialName || description !== initialDescription;
  useUnsavedChangesWarning(dirty && !pending);

  function focusFirstError(fieldErrors: Record<string, string>) {
    if (fieldErrors.name) nameRef.current?.focus();
    else if (fieldErrors.description) descriptionRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitting.current) return;
    setFeedback(null);
    const input =
      props.mode === "create"
        ? { name, description, isActive }
        : { serviceId: props.serviceId, expectedVersion: props.version, name, description };
    const check = (props.mode === "create" ? createServiceSchema : updateServiceSchema).safeParse(
      input,
    );
    if (!check.success) {
      const fieldErrors = fieldErrorsOf(check.error);
      setErrors(fieldErrors);
      focusFirstError(fieldErrors);
      return;
    }
    setErrors({});
    submitting.current = true;
    startTransition(async () => {
      let result: ActionResult<unknown>;
      try {
        result =
          props.mode === "create"
            ? await createServiceAction(input)
            : await updateServiceAction(input);
      } catch {
        result = { ok: false, error: { code: "INTERNAL", message: messages.common.internal } };
      }
      if (result.ok && props.mode === "create") {
        // Yönlendirme tamamlanana kadar kilit açık kalmaz (ikinci gönderim yok).
        const { serviceId } = result.data as { serviceId: string };
        router.push(`/dashboard/services/${serviceId}?created=1`);
        return;
      }
      submitting.current = false;
      if (result.ok) {
        setFeedback({ kind: "success", message: messages.common.saved });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      focusFirstError(result.error.fieldErrors ?? {});
      setFeedback({
        kind: result.error.code === "CONFLICT" ? "conflict" : "error",
        message: result.error.message,
      });
    });
  }

  const nameError = errors.name;
  const descriptionError = errors.description;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-5" aria-busy={pending}>
      {errors._form && !feedback ? (
        <Alert variant="destructive">
          <AlertDescription>{errors._form}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        id="service-name"
        label="Hizmet adı"
        required
        error={nameError}
        counter={{ length: [...name].length, max: SERVICE_TEXT_LIMITS.nameMax }}
      >
        <Input
          ref={nameRef}
          id="service-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={SERVICE_TEXT_LIMITS.nameMax + 20}
          autoComplete="off"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={describedBy("service-name", { error: nameError })}
        />
      </FormField>
      <FormField
        id="service-description"
        label="Açıklama"
        hint="Personel için kısa açıklama. Düz metin olarak saklanır."
        error={descriptionError}
        counter={{ length: [...description].length, max: SERVICE_TEXT_LIMITS.descriptionMax }}
      >
        <Textarea
          ref={descriptionRef}
          id="service-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={describedBy("service-description", {
            hint: true,
            error: descriptionError,
          })}
        />
      </FormField>
      {props.mode === "create" ? (
        <div className="grid gap-1.5">
          <label className="inline-flex min-h-11 items-center gap-3 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              aria-describedby="service-active-hint"
              className="size-5 rounded border-input accent-primary"
            />
            Hizmeti hemen aktifleştir
          </label>
          <p id="service-active-hint" className="text-xs text-muted-foreground">
            Önerilen: hizmeti pasif oluşturun, evrak gereksinimlerini ekledikten sonra
            aktifleştirin. Aktif evrak gereksinimi olmayan hizmetle başvuru oluşturulamaz.
          </p>
        </div>
      ) : null}

      {feedback ? (
        <div role={feedback.kind === "success" ? "status" : "alert"}>
          <Alert variant={feedback.kind === "success" ? "info" : "destructive"} role="presentation">
            <AlertDescription
              className={feedback.kind === "success" ? "text-primary-dark" : undefined}
            >
              {feedback.message}
            </AlertDescription>
            {feedback.kind === "conflict" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-fit"
                onClick={() => window.location.reload()}
              >
                Sayfayı yenile
              </Button>
            ) : null}
          </Alert>
        </div>
      ) : null}

      <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end">
        {dirty && !pending ? (
          <span
            className="text-sm text-muted-foreground sm:mr-auto"
            data-testid="unsaved-indicator"
          >
            {messages.common.unsavedChanges}
          </span>
        ) : null}
        {props.mode === "create" ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => router.push("/dashboard/services")}
            disabled={pending}
          >
            Vazgeç
          </Button>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Kaydediliyor…" : props.mode === "create" ? "Hizmeti Oluştur" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}
