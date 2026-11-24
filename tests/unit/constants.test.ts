import { describe, expect, it } from "vitest";

import {
  ACCESS_TOKEN_BYTES,
  ALLOWED_FILE_EXTENSION,
  ALLOWED_FILE_MIME,
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  MAX_PDF_SIZE_BYTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STAFF_SESSION_MAX_AGE_SECONDS,
} from "@/config/constants";

describe("sabit yapılandırma (D-037)", () => {
  it("PDF üst sınırı tam olarak 10 485 760 bayttır (OD-16)", () => {
    expect(MAX_PDF_SIZE_BYTES).toBe(10_485_760);
  });

  it("yalnızca PDF kabul edilir (OD-16)", () => {
    expect(ALLOWED_FILE_MIME).toBe("application/pdf");
    expect(ALLOWED_FILE_EXTENSION).toBe(".pdf");
  });

  it("şifre uzunluğu 8–128 karakterdir (OD-22)", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it("personel ve müşteri oturumları 7 gündür (OD-22)", () => {
    expect(STAFF_SESSION_MAX_AGE_SECONDS).toBe(604_800);
    expect(CUSTOMER_SESSION_MAX_AGE_SECONDS).toBe(604_800);
  });

  it("erişim token'ı 256 bittir (OD-01)", () => {
    expect(ACCESS_TOKEN_BYTES * 8).toBe(256);
  });
});
