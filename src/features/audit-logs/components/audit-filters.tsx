"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AUDIT_PAGE_SIZES } from "@/config/constants";
import { AUDIT_ACTOR_TYPES, AUDIT_RESOURCE_TYPES, type StaffRole } from "@/config/statuses";
import { messages } from "@/lib/messages";

import { resolveAuditApplicationAction } from "../actions";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_LABELS,
  AUDIT_RESOURCE_LABELS,
  KNOWN_AUDIT_ACTIONS,
} from "../domain/labels";
import { auditUrl } from "../domain/url";
import type { AuditFilters } from "../schemas";

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

const ACCOUNT_LABELS = { admin: "ADMIN", employee: "EMPLOYEE" } as const;

type Props = {
  readonly filters: AuditFilters;
  readonly staff: readonly { id: string; username: string; accountType: StaffRole }[];
  readonly applicationNumber: string | null;
};

export function AuditFiltersForm({ filters, staff, applicationNumber }: Props) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState(applicationNumber ?? "");
  // PHASE 11 (11.B): mobilde 7 alanlı form ilk ekranı kaplıyordu → < 1024px katlanır; etkin filtre
  // sayısı düğmede görünür. Masaüstünde her zaman açık.
  const activeCount = [
    filters.from,
    filters.to,
    filters.action,
    filters.actorType,
    filters.staffId,
    filters.resourceType,
    filters.applicationId,
  ].filter((value) => value !== undefined && value !== null && value !== "").length;
  const [expanded, setExpanded] = useState(false);
  const sortedActions = [...KNOWN_AUDIT_ACTIONS].sort((a, b) =>
    AUDIT_ACTION_LABELS[a].localeCompare(AUDIT_ACTION_LABELS[b], "tr"),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const from = String(data.get("from") ?? "");
    const to = String(data.get("to") ?? "");
    if (from !== "" && to !== "" && from > to) {
      setError(messages.auditLogs.invalidRange);
      return;
    }
    setError(null);
    const base = {
      from,
      to,
      action: String(data.get("action") ?? ""),
      actorType: String(data.get("actorType") ?? ""),
      staffId: String(data.get("staffId") ?? ""),
      resourceType: String(data.get("resourceType") ?? ""),
      pageSize: Number(data.get("pageSize") ?? 20),
    };
    const trimmed = number.trim();
    startTransition(async () => {
      if (trimmed === "") {
        router.push(auditUrl(base));
        return;
      }
      const result = await resolveAuditApplicationAction({ applicationNumber: trimmed });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      router.push(auditUrl({ ...base, applicationId: result.data.applicationId }));
    });
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        className="justify-between lg:hidden"
        aria-expanded={expanded}
        aria-controls={`${id}-form`}
        onClick={() => setExpanded((value) => !value)}
        data-testid="audit-filters-toggle"
      >
        {expanded ? "Filtreleri gizle" : "Filtreleri göster"}
        {activeCount > 0 ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary tabular-nums">
            {activeCount} etkin
          </span>
        ) : null}
      </Button>
      <form
        id={`${id}-form`}
        onSubmit={onSubmit}
        className={`${expanded ? "grid" : "hidden"} gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid lg:grid-cols-4`}
        data-testid="audit-filters"
        aria-label="İşlem geçmişi filtreleri"
      >
        <label className="grid gap-1 text-sm" htmlFor={`${id}-from`}>
          <span className="font-medium">Başlangıç tarihi</span>
          <Input id={`${id}-from`} type="date" name="from" defaultValue={filters.from ?? ""} />
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-to`}>
          <span className="font-medium">Bitiş tarihi</span>
          <Input id={`${id}-to`} type="date" name="to" defaultValue={filters.to ?? ""} />
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-action`}>
          <span className="font-medium">İşlem türü</span>
          <select
            id={`${id}-action`}
            name="action"
            className={selectClass}
            defaultValue={filters.action ?? ""}
          >
            <option value="">Tümü</option>
            {sortedActions.map((action) => (
              <option key={action} value={action}>
                {AUDIT_ACTION_LABELS[action]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-actor`}>
          <span className="font-medium">Aktör türü</span>
          <select
            id={`${id}-actor`}
            name="actorType"
            className={selectClass}
            defaultValue={filters.actorType ?? ""}
          >
            <option value="">Tümü</option>
            {AUDIT_ACTOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUDIT_ACTOR_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-staff`}>
          <span className="font-medium">Personel</span>
          <select
            id={`${id}-staff`}
            name="staffId"
            className={selectClass}
            defaultValue={filters.staffId ?? ""}
          >
            <option value="">Tümü</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.username} ({ACCOUNT_LABELS[member.accountType]})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-resource`}>
          <span className="font-medium">Kayıt türü</span>
          <select
            id={`${id}-resource`}
            name="resourceType"
            className={selectClass}
            defaultValue={filters.resourceType ?? ""}
          >
            <option value="">Tümü</option>
            {AUDIT_RESOURCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {AUDIT_RESOURCE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-number`}>
          <span className="font-medium">Başvuru numarası</span>
          <Input
            id={`${id}-number`}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="CS-2026-000001"
            autoComplete="off"
            maxLength={32}
          />
        </label>
        <label className="grid gap-1 text-sm" htmlFor={`${id}-size`}>
          <span className="font-medium">Sayfa boyutu</span>
          <select
            id={`${id}-size`}
            name="pageSize"
            className={selectClass}
            defaultValue={filters.pageSize}
          >
            {AUDIT_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Uygulanıyor…" : "Filtrele"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setNumber("");
              setError(null);
              startTransition(() => router.push("/dashboard/audit-logs"));
            }}
          >
            Filtreleri temizle
          </Button>
          <p role="alert" aria-live="polite" className="text-sm text-destructive">
            {error}
          </p>
        </div>
      </form>
    </div>
  );
}
