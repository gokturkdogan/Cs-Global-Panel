/**
 * Server Action sonuç sözleşmesi (API_CONTRACTS §1). `message` Türkçe ve kullanıcıya gösterilebilir;
 * SQL, bağlantı veya iç ayrıntı içermez.
 */
export type ActionErrorCode =
  "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "DUPLICATE" | "UNAUTHENTICATED" | "INTERNAL";

export type ActionError = {
  readonly code: ActionErrorCode;
  readonly message: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
};

export type ActionResult<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ActionError };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const fail = (error: ActionError): ActionResult<never> => ({ ok: false, error });
