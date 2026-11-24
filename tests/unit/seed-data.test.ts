import { describe, expect, it } from "vitest";

import { DEMO_SERVICES } from "../../scripts/db/seed-data";

describe("demo seed verisi", () => {
  it("yalnızca açıkça demo olarak adlandırılmış üç hizmet içerir", () => {
    expect(DEMO_SERVICES.map((service) => service.name)).toEqual([
      "Almanya Çalışma Vizesi — Demo",
      "Turistik Vize — Demo",
      "Öğrenci Vizesi — Demo",
    ]);
  });

  it("her hizmette evrak başlıkları benzersiz ve şema sınırları içindedir", () => {
    for (const service of DEMO_SERVICES) {
      const titles = service.requirements.map((requirement) => requirement.title);
      expect(new Set(titles).size).toBe(titles.length);
      for (const title of titles) expect(title.length).toBeGreaterThanOrEqual(2);
    }
  });
});
