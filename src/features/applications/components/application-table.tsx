"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

import type { ApplicationListItem } from "../queries";
import { ApplicationStatusBadge } from "./application-status-badge";
import { CopyLinkButton } from "./copy-link-button";
import { LinkStatusBadge } from "./link-status-badge";
import { WhatsAppShareDialog } from "./whatsapp-share-dialog";

function RowActions({
  item,
  mobile = false,
}: {
  readonly item: ApplicationListItem;
  readonly mobile?: boolean;
}) {
  return (
    <div
      className={
        mobile ? "grid gap-2 sm:grid-cols-3" : "flex flex-wrap items-start justify-end gap-2"
      }
    >
      <Button asChild variant="outline" size="sm" className={mobile ? "h-11" : "h-9"}>
        <Link
          href={`/dashboard/applications/${item.id}`}
          aria-label={`${item.applicationNumber} başvuru detayı`}
        >
          Detay
        </Link>
      </Button>
      {item.activeTokenId !== null ? (
        <>
          <CopyLinkButton applicationId={item.id} applicationNumber={item.applicationNumber} />
          <WhatsAppShareDialog
            applicationId={item.id}
            applicationNumber={item.applicationNumber}
            trigger={
              <Button
                variant="outline"
                size="sm"
                className={mobile ? "h-11" : "h-9"}
                aria-label={`${item.applicationNumber} için WhatsApp ile paylaş`}
              >
                <MessageCircle aria-hidden="true" />
                WhatsApp
              </Button>
            }
          />
        </>
      ) : null}
    </div>
  );
}

/** Başvuru listesi: ≥1024px tablo, altında kart. Telefon/e-posta listede gösterilmez (veri minimizasyonu). */
export function ApplicationTable({ items }: { readonly items: readonly ApplicationListItem[] }) {
  return (
    <>
      <div className="hidden overflow-x-auto xl:block">
        <table className="w-full text-left text-sm" data-testid="applications-table">
          <caption className="sr-only">Başvurular</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              {["Başvuru No", "Müşteri", "Hizmet", "Durum", "Oluşturulma", "Bağlantı"].map(
                (heading) => (
                  <th key={heading} scope="col" className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ),
              )}
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">İşlemler</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="px-4 py-3 font-medium whitespace-nowrap tabular-nums">
                  <Link
                    href={`/dashboard/applications/${item.id}`}
                    className="text-primary-dark hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {item.applicationNumber}
                  </Link>
                </td>
                <td className="max-w-44 px-4 py-3 break-words">{item.customerName}</td>
                <td className="max-w-44 px-4 py-3 break-words text-muted-foreground">
                  {item.serviceName}
                </td>
                <td className="px-4 py-3">
                  <ApplicationStatusBadge status={item.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                  <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                </td>
                <td className="px-4 py-3">
                  <LinkStatusBadge active={item.activeTokenId !== null} />
                </td>
                <td className="px-4 py-3">
                  <RowActions item={item} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y xl:hidden" data-testid="applications-list">
        {items.map((item) => (
          <li key={item.id} className="grid gap-2 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/dashboard/applications/${item.id}`}
                className="font-medium text-primary-dark tabular-nums hover:underline"
              >
                {item.applicationNumber}
              </Link>
              <ApplicationStatusBadge status={item.status} />
            </div>
            <p className="text-sm break-words text-foreground">{item.customerName}</p>
            <p className="text-sm break-words text-muted-foreground">{item.serviceName}</p>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
              </span>
              <LinkStatusBadge active={item.activeTokenId !== null} />
            </div>
            <RowActions item={item} mobile />
          </li>
        ))}
      </ul>
    </>
  );
}
