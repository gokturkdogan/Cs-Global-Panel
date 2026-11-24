import { describe, expect, it } from "vitest";

import { company } from "@/config/company";

const E164 = /^\+[1-9]\d{7,14}$/;

describe("şirket yapılandırması (OD-14, BR-170…BR-172)", () => {
  it("şirket adı ve ürün adı tanımlıdır", () => {
    expect(company.name).toBe("CS Global");
    expect(company.productName).toBe("Vize Danışmanlık Yönetim Platformu");
  });

  it.each(["phoneE164", "whatsappE164"] as const)(
    "%s ya boştur (null) ya da geçerli E.164 numarasıdır — uydurma biçim kabul edilmez",
    (field) => {
      const value = company[field];
      if (value !== null) expect(value).toMatch(E164);
    },
  );

  it("gerçek numaralar sağlanana kadar iletişim bilgisi boştur (BR-171)", () => {
    // Product Owner gerçek numarayı sağladığında bu test bilinçli olarak güncellenir.
    expect(company.phoneE164).toBeNull();
    expect(company.whatsappE164).toBeNull();
  });
});
