"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { describedBy, FormField } from "@/components/dashboard/form-field";
import { useUnsavedChangesWarning } from "@/components/dashboard/use-unsaved-changes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_TEXT_LIMITS } from "@/config/constants";
import type { ActionResult } from "@/lib/action-result";
import { messages } from "@/lib/messages";

import { createRequirementAction, updateRequirementAction } from "../actions";
import type { RequirementDetail } from "../queries";
import { createRequirementSchema, fieldErrorsOf, updateRequirementSchema } from "../schemas";

type Props = {
  readonly serviceId: string;
  /** Verilmezse yeni evrak eklenir. */
  readonly requirement?: RequirementDetail;
  readonly onDone: (message: string) => void;
  readonly onCancel: () => void;
};

/**
 * Evrak gereksinimi formu. Talimat düz metindir (satır sonları korunur; HTML yorumlanmaz).
 * Dosya tipi/boyutu/sayısı alanı yoktur — sistem genelinde sabittir (OD-16).
 */
export function RequirementForm({ serviceId, requirement, onDone, onCancel }: Props) {
  const editing = requirement !== undefined;
  const prefix = editing ? `requirement-${requirement.id}` : "requirement-new";
  const initial = {
    title: requirement?.title ?? "",
    description: requirement?.description ?? "",
    instructions: requirement?.instructions ?? "",
    isRequired: requirement?.isRequired ?? true,
  };
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<{ message: string; conflict: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  // Render beklenmeden gelen ikinci tıklamaya karşı eşzamanlı kilit (çift gönderim yok).
  const submitting = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const instructionsRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => titleRef.current?.focus(), []);
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(dirty && !pending);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  function focusFirstError(fieldErrors: Record<string, string>) {
    if (fieldErrors.title) titleRef.current?.focus();
    else if (fieldErrors.description) descriptionRef.current?.focus();
    else if (fieldErrors.instructions) instructionsRef.current?.focus();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitting.current) return;
    setFailure(null);
    const input = editing
      ? {
          ...values,
          serviceId,
          requirementId: requirement.id,
          expectedVersion: requirement.version,
        }
      : { ...values, serviceId };
    const check = (editing ? updateRequirementSchema : createRequirementSchema).safeParse(input);
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
        result = editing
          ? await updateRequirementAction(input)
          : await createRequirementAction(input);
      } catch {
        result = { ok: false, error: { code: "INTERNAL", message: messages.common.internal } };
      }
      if (result.ok) {
        // Form kapanır (bileşen kaldırılır); kilit yeniden açılmaz.
        onDone(editing ? messages.common.saved : messages.services.requirementCreated);
        return;
      }
      submitting.current = false;
      setErrors(result.error.fieldErrors ?? {});
      focusFirstError(result.error.fieldErrors ?? {});
      setFailure({ message: result.error.message, conflict: result.error.code === "CONFLICT" });
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={pending}
      aria-label={editing ? `${requirement.title} evrakını düzenle` : "Yeni evrak gereksinimi"}
      className="grid gap-4 rounded-lg border border-primary/30 bg-primary-light/40 p-4"
    >
      <FormField
        id={`${prefix}-title`}
        label="Evrak adı"
        required
        error={errors.title}
        counter={{ length: [...values.title].length, max: SERVICE_TEXT_LIMITS.requirementTitleMax }}
      >
        <Input
          ref={titleRef}
          id={`${prefix}-title`}
          value={values.title}
          onChange={(event) => set("title", event.target.value)}
          autoComplete="off"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy(`${prefix}-title`, { error: errors.title })}
        />
      </FormField>
      <FormField
        id={`${prefix}-instructions`}
        label="Müşteriye gösterilecek yükleme talimatı"
        hint="Düz metin; satır sonları korunur. HTML/biçimlendirme desteklenmez."
        error={errors.instructions}
        counter={{
          length: [...values.instructions].length,
          max: SERVICE_TEXT_LIMITS.requirementInstructionsMax,
        }}
      >
        <Textarea
          ref={instructionsRef}
          id={`${prefix}-instructions`}
          value={values.instructions}
          onChange={(event) => set("instructions", event.target.value)}
          rows={4}
          aria-invalid={errors.instructions ? true : undefined}
          aria-describedby={describedBy(`${prefix}-instructions`, {
            hint: true,
            error: errors.instructions,
          })}
        />
      </FormField>
      <FormField
        id={`${prefix}-description`}
        label="Açıklama"
        hint="Evrak hakkında kısa ek bilgi (düz metin)."
        error={errors.description}
        counter={{
          length: [...values.description].length,
          max: SERVICE_TEXT_LIMITS.requirementDescriptionMax,
        }}
      >
        <Textarea
          ref={descriptionRef}
          id={`${prefix}-description`}
          value={values.description}
          onChange={(event) => set("description", event.target.value)}
          rows={2}
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={describedBy(`${prefix}-description`, {
            hint: true,
            error: errors.description,
          })}
        />
      </FormField>
      <label className="inline-flex min-h-11 items-center gap-3 text-sm font-medium text-foreground">
        <input
          type="checkbox"
          checked={values.isRequired}
          onChange={(event) => set("isRequired", event.target.checked)}
          className="size-5 rounded border-input accent-primary"
        />
        Zorunlu evrak
      </label>

      {errors._form && !failure ? (
        <Alert variant="destructive">
          <AlertDescription>{errors._form}</AlertDescription>
        </Alert>
      ) : null}
      {failure ? (
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
          {failure.conflict ? (
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
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={pending}>
          Vazgeç
        </Button>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Kaydediliyor…" : editing ? "Evrakı Kaydet" : "Evrakı Ekle"}
        </Button>
      </div>
    </form>
  );
}
