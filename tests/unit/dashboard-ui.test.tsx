import { readFileSync } from "node:fs";

import { Inbox } from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { EmptyState } from "@/components/dashboard/empty-state";
import { ErrorState } from "@/components/dashboard/error-state";
import { LoadingSkeleton } from "@/components/dashboard/loading-skeleton";
import { DASHBOARD_NAV_ITEMS, isNavItemActive } from "@/config/navigation";
import { APPLICATION_STATUSES } from "@/config/statuses";
import { ApplicationStatusBadge } from "@/features/applications/components/application-status-badge";
import { APPLICATION_STATUS_PRESENTATION } from "@/features/applications/domain/status-labels";
import { RecentApplications } from "@/features/dashboard/components/recent-applications";
import { ReviewQueue } from "@/features/dashboard/components/review-queue";
import { DASHBOARD_STAT_STATUSES } from "@/features/dashboard/domain";
import { formatDateTime, initialOf } from "@/lib/format";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

describe("başvuru statü etiketleri", () => {
  it("her statü tam olarak bir kez eşlenir (eksik/fazla yok)", () => {
    expect(Object.keys(APPLICATION_STATUS_PRESENTATION).sort()).toEqual(
      [...APPLICATION_STATUSES].sort(),
    );
  });

  it("etiketler STATE_TRANSITIONS §1 ile aynıdır", () => {
    const doc = readFileSync("docs/STATE_TRANSITIONS.md", "utf8");
    for (const status of APPLICATION_STATUSES) {
      const label = APPLICATION_STATUS_PRESENTATION[status].label;
      expect(doc).toContain(`| \`${status}\` | ${label} |`);
    }
  });

  it("rozet metin + dekoratif ikon içerir (renk tek başına anlam taşımaz)", () => {
    for (const status of APPLICATION_STATUSES) {
      const html = renderToStaticMarkup(<ApplicationStatusBadge status={status} />);
      expect(html).toContain(APPLICATION_STATUS_PRESENTATION[status].label);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-status="${status}"`);
    }
  });
});

describe("dashboard sayaç tanımları (D-070)", () => {
  it("Evrak Bekleyen düzeltme bekleyenleri de kapsar; tüm değerler geçerli statü", () => {
    expect(DASHBOARD_STAT_STATUSES.awaitingDocuments).toEqual([
      "AWAITING_DOCUMENTS",
      "REVISION_REQUIRED",
    ]);
    for (const statuses of Object.values(DASHBOARD_STAT_STATUSES)) {
      for (const status of statuses) expect(APPLICATION_STATUSES).toContain(status);
    }
  });

  it("sorgular yalnızca izinli kolonları okur; başka tablo yok; silme talepli kayıtlar dışlanır", () => {
    const source = readFileSync("src/features/dashboard/queries.ts", "utf8");
    const columns = new Set([...source.matchAll(/applications\.(\w+)/g)].map((match) => match[1]));
    expect([...columns].sort()).toEqual(
      [
        "applicationNumber",
        "id",
        "createdAt",
        "customerFirstName",
        "customerLastName",
        "deletionRequestedAt",
        "serviceNameSnapshot",
        "status",
        "statusChangedAt",
      ].sort(),
    );
    expect(source).toMatch(/import \{ applications \} from "@\/server\/db\/schema"/);
    expect(source).toContain("isNull(applications.deletionRequestedAt)");
  });
});

describe("menü", () => {
  it("dört öğe, iki hesap için aynı; ayarlar/hesap/çalışan yok", () => {
    expect(DASHBOARD_NAV_ITEMS.map((item) => item.label)).toEqual([
      "Genel Bakış",
      "Başvurular",
      "Hizmetler",
      "İşlem Geçmişi",
    ]);
    expect(JSON.stringify(DASHBOARD_NAV_ITEMS)).not.toMatch(/settings|account|employee|ayar/i);
  });

  it("aktif öğe: Genel Bakış yalnızca tam eşleşmede, diğerleri alt sayfalarıyla", () => {
    expect(isNavItemActive("/dashboard", "/dashboard")).toBe(true);
    expect(isNavItemActive("/dashboard", "/dashboard/services")).toBe(false);
    expect(isNavItemActive("/dashboard/applications", "/dashboard/applications/x")).toBe(true);
    expect(isNavItemActive("/dashboard/applications", "/dashboard/applicationsx")).toBe(false);
  });
});

describe("biçimlendirme", () => {
  it("tarih Europe/Istanbul saatinde gösterilir", () => {
    expect(formatDateTime("2026-01-01T21:30:00.000Z")).toBe("02.01.2026 00:30");
  });
  it("baş harf Türkçe büyük harf kuralına uyar", () => {
    expect(initialOf("ismail")).toBe("İ");
    expect(initialOf("  ayse")).toBe("A");
    expect(initialOf("")).toBe("?");
  });
});

describe("durum bileşenleri", () => {
  const row = {
    id: "11111111-1111-4111-8111-111111111111",
    applicationNumber: "CS-2026-000001",
    customerName: "Deneme Kişi",
    serviceName: "Örnek Hizmet",
    status: "UNDER_REVIEW",
    createdAt: "2026-11-24T09:00:00.000Z",
  } as const;

  it("boş, hata ve yükleniyor durumları birbirinden ayrıdır", () => {
    const empty = renderToStaticMarkup(<EmptyState icon={Inbox} title="Boş" />);
    const error = renderToStaticMarkup(<ErrorState />);
    const loading = renderToStaticMarkup(<LoadingSkeleton />);
    expect(empty).toContain('data-state="empty"');
    expect(empty).not.toContain('role="alert"');
    expect(error).toContain('role="alert"');
    expect(error).toContain("Veriler yüklenemedi.");
    expect(error).toContain("Tekrar dene");
    expect(loading).toContain('aria-busy="true"');
  });

  it("son başvurular: boş durum metinleri", () => {
    const html = renderToStaticMarkup(<RecentApplications rows={[]} />);
    expect(html).toContain("Henüz başvuru bulunmuyor.");
    expect(html).toContain("Oluşturulan başvurular burada görüntülenecektir.");
  });

  it("son başvurular: sütunlar; numara detaya bağlantı, telefon/e-posta yok", () => {
    const html = renderToStaticMarkup(<RecentApplications rows={[row]} />);
    for (const heading of ["Başvuru No", "Müşteri", "Hizmet", "Durum", "Oluşturulma Tarihi"]) {
      expect(html).toContain(heading);
    }
    expect(html).toContain("CS-2026-000001");
    expect(html).toContain("İncelemede");
    expect(html).toContain('href="/dashboard/applications/11111111-1111-4111-8111-111111111111"');
    expect(html).toContain('href="/dashboard/applications"'); // Tümünü Gör
  });

  it("inceleme kuyruğu: boş durum metni", () => {
    expect(renderToStaticMarkup(<ReviewQueue rows={[]} />)).toContain(
      "İnceleme bekleyen başvuru bulunmuyor.",
    );
  });
});
