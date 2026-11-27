"use client";

import { Pencil } from "lucide-react";
import { useLayoutEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { describedBy, FormField } from "@/components/dashboard/form-field";
import { useUnsavedChangesWarning } from "@/components/dashboard/use-unsaved-changes";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { fieldErrorsOf } from "@/lib/field-errors";
import { messages } from "@/lib/messages";

import { updateCustomerInfoAction } from "../actions";
import { customerFieldsSchema } from "../schemas";

type Customer = { firstName: string; lastName: string; phone: string; email: string };
type Props = {
  readonly applicationId: string;
  readonly version: number;
  readonly customer: Customer;
};
const FIELDS: [keyof Customer, string, React.ComponentProps<typeof Input>][] = [
  ["firstName", "Ad", { autoComplete: "off", maxLength: 120 }],
  ["lastName", "Soyad", { autoComplete: "off", maxLength: 120 }],
  [
    "phone",
    "Telefon numarası",
    { type: "tel", inputMode: "tel", autoComplete: "off", maxLength: 32 },
  ],
  [
    "email",
    "E-posta adresi",
    { type: "email", inputMode: "email", autoComplete: "off", maxLength: 254 },
  ],
];

/**
 * Müşteri bilgileri (BR-03): değişiklik yalnızca bu başvuruyu etkiler; `expectedVersion` ile eski form
 * reddedilir. Telefon/e-posta değişince bağlantı KENDİLİĞİNDEN yenilenmez — önceki alıcı erişebilir
 * uyarısı ve bağlantı kartına geçiş gösterilir (D-083).
 */
export function CustomerInfoCard({ applicationId, version, customer }: Props) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(customer);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{
    kind: "status" | "alert" | "conflict";
    text: string;
  } | null>(null);
  const [contactWarning, setContactWarning] = useState(false);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Form açılınca odak ilk alana — açıldığı commit'te eşzamanlı ve YALNIZCA odak henüz formun içinde
  // değilse (PHASE 10.2, D-133). Önceki ertelenmiş (requestAnimationFrame) odak, kullanıcı başka alana
  // geçip yazmaya başladıktan sonra çalışıp odağı/metni "Ad" alanına taşıyabiliyordu.
  useLayoutEffect(() => {
    if (!editing) return;
    if (formRef.current?.contains(document.activeElement)) return;
    firstRef.current?.focus();
  }, [editing]);

  const dirty = editing && JSON.stringify(values) !== JSON.stringify(customer);
  useUnsavedChangesWarning(dirty && !pending);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || submitting.current) return;
    setFeedback(null);
    const check = customerFieldsSchema.safeParse(values);
    if (!check.success) {
      setErrors(fieldErrorsOf(check.error));
      firstRef.current?.focus();
      return;
    }
    setErrors({});
    submitting.current = true;
    startTransition(async () => {
      let result: ActionResult<{ version: number; changed: boolean; contactChanged: boolean }>;
      try {
        result = await updateCustomerInfoAction({
          applicationId,
          expectedVersion: version,
          ...values,
        });
      } catch {
        result = { ok: false, error: { code: "INTERNAL", message: messages.common.internal } };
      }
      submitting.current = false;
      if (result.ok) {
        setEditing(false);
        setContactWarning(result.data.contactChanged);
        setFeedback({ kind: "status", text: messages.common.saved });
        return;
      }
      setErrors(result.error.fieldErrors ?? {});
      setFeedback({
        kind: result.error.code === "CONFLICT" ? "conflict" : "alert",
        text: result.error.message,
      });
    });
  }

  return (
    <section
      aria-labelledby="customer-title"
      className="grid content-start gap-4 rounded-xl border bg-card p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="customer-title" className="text-lg leading-7 font-semibold">
          Müşteri bilgileri
        </h2>
        {!editing ? (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => {
              setValues(customer);
              setEditing(true);
              setFeedback(null);
            }}
          >
            <Pencil aria-hidden="true" />
            Düzenle
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <dl className="grid gap-3 sm:grid-cols-2" data-testid="customer-info">
          {FIELDS.map(([name, label]) => (
            <div key={name} className="grid min-w-0 gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              {/* PHASE 11: uzun e-posta/ad kart dışına taşmaz (grid öğesi min-w-0 + her yerde kırılabilir). */}
              <dd className="min-w-0 font-medium wrap-anywhere text-foreground">
                {customer[name]}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <form
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          aria-busy={pending}
          aria-label="Müşteri bilgilerini düzenle"
          className="grid gap-4"
        >
          <p className="text-sm text-muted-foreground">
            Değişiklik yalnızca bu başvuruyu etkiler; aynı kişinin diğer başvuruları değişmez.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(([name, label, props], index) => (
              <FormField
                key={name}
                id={`customer-${name}`}
                label={label}
                required
                error={errors[name]}
              >
                <Input
                  ref={index === 0 ? firstRef : undefined}
                  id={`customer-${name}`}
                  value={values[name]}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [name]: event.target.value }))
                  }
                  aria-invalid={errors[name] ? true : undefined}
                  aria-describedby={describedBy(`customer-${name}`, { error: errors[name] })}
                  {...props}
                />
              </FormField>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Telefon veya e-posta değişirse mevcut müşteri bağlantısı önceki alıcıda kalmış olabilir;
            bağlantı kendiliğinden yenilenmez.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setErrors({});
                setFeedback(null);
              }}
            >
              Vazgeç
            </Button>
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </form>
      )}

      {feedback ? (
        <div role={feedback.kind === "status" ? "status" : "alert"} className="grid gap-2">
          <p
            className={
              feedback.kind === "status"
                ? "text-sm text-primary-dark"
                : "text-sm text-destructive-strong"
            }
          >
            {feedback.text}
          </p>
          {feedback.kind === "conflict" ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => window.location.reload()}
            >
              Sayfayı yenile
            </Button>
          ) : null}
        </div>
      ) : null}
      {contactWarning ? (
        <Alert variant="destructive" role="note">
          <AlertDescription>
            {messages.applications.contactChangedWarning}{" "}
            <a href="#access-link-title" className="font-medium underline">
              Bağlantı yönetimine git
            </a>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
