/**
 * Development demo verisi — YALNIZCA geliştirme/demo içindir. Resmî vize evrak gereksinimi
 * değildir; gerçek CS Global hizmet kataloğu henüz sağlanmamıştır (PB-11).
 * Personel/admin hesabı oluşturulmaz (PHASE 03). Müşteri veya başvuru verisi içermez.
 */
import type pg from "pg";

const DEMO_NOTE = "Demo verisidir; resmî vize evrak gereksinimi değildir.";

type DemoRequirement = { readonly title: string; readonly isRequired: boolean };
type DemoService = { readonly name: string; readonly requirements: readonly DemoRequirement[] };

export const DEMO_SERVICES: readonly DemoService[] = [
  {
    name: "Almanya Çalışma Vizesi — Demo",
    requirements: [
      { title: "Pasaport", isRequired: true },
      { title: "Kimlik fotokopisi", isRequired: true },
      { title: "İş sözleşmesi", isRequired: true },
      { title: "Banka hesap dökümü", isRequired: false },
    ],
  },
  {
    name: "Turistik Vize — Demo",
    requirements: [
      { title: "Pasaport", isRequired: true },
      { title: "Kimlik fotokopisi", isRequired: true },
      { title: "Banka hesap dökümü", isRequired: true },
      { title: "Otel rezervasyonu", isRequired: false },
    ],
  },
  {
    name: "Öğrenci Vizesi — Demo",
    requirements: [
      { title: "Pasaport", isRequired: true },
      { title: "Kimlik fotokopisi", isRequired: true },
      { title: "Öğrenci belgesi", isRequired: true },
      { title: "Okul kabul belgesi", isRequired: true },
    ],
  },
];

export type SeedResult = {
  readonly servicesCreated: number;
  readonly servicesSkipped: number;
  readonly requirementsCreated: number;
};

/**
 * İdempotent: hizmet adı (büyük/küçük harf duyarsız) zaten varsa o hizmete ve evraklarına hiç
 * dokunulmaz — sonradan yapılan düzenlemeler ezilmez, kayıt silinmez, kopya oluşmaz.
 * Tek transaction'da çalışır.
 */
export async function seedDemoServices(client: pg.ClientBase): Promise<SeedResult> {
  let servicesCreated = 0;
  let servicesSkipped = 0;
  let requirementsCreated = 0;

  await client.query("BEGIN");
  try {
    for (const [serviceIndex, service] of DEMO_SERVICES.entries()) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO services (name, description, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT ((lower(name))) DO NOTHING
         RETURNING id`,
        [service.name, DEMO_NOTE, (serviceIndex + 1) * 10],
      );
      const serviceId = inserted.rows[0]?.id;
      if (serviceId === undefined) {
        servicesSkipped += 1;
        continue;
      }
      servicesCreated += 1;
      for (const [requirementIndex, requirement] of service.requirements.entries()) {
        await client.query(
          `INSERT INTO service_document_requirements (service_id, title, description, is_required, sort_order)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            serviceId,
            requirement.title,
            DEMO_NOTE,
            requirement.isRequired,
            (requirementIndex + 1) * 10,
          ],
        );
        requirementsCreated += 1;
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }

  return { servicesCreated, servicesSkipped, requirementsCreated };
}
