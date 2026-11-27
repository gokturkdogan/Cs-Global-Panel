import { sql } from "drizzle-orm";
import { bigint, check, pgTable, smallint } from "drizzle-orm/pg-core";

import { timestamptz } from "./helpers";

/**
 * Depolama kotası durumu — tek satır (`id = 1`, migration 0005 ile oluşturulur). İki amaç (D-101):
 * 1. Global kota kilidi: yükleme rezervasyonu bu satırı `FOR UPDATE` ile kilitler; eşzamanlı yüklemeler
 *    aynı boş kapasiteyi kullanamaz. Kilit sırası: applications → requirements → files → storage_quota_state.
 * 2. Sağlayıcı mutabakatı: `pnpm storage:reconcile --apply` bucket'ta DB kaydıyla eşleşmeyen nesnelerin
 *    (sahipsiz, bilinmeyen, yinelenen fiziksel versiyonlar) toplam boyutunu `untracked_bytes`'a yazar;
 *    kota hesabı bu değeri de içerir (bilinmeyen kullanım yok sayılmaz).
 * Kullanım miktarı burada tutulmaz; her rezervasyonda dosya metadata'sından hesaplanır (tek kaynak).
 * 3. Muhasebe nesli (PHASE 10.2, D-130): fiziksel silme veya dosya kaydının sonlandırılması/silinmesi
 *    `accounting_epoch`'u artırır. Mutabakat nesli listelemeden ÖNCE okur ve sonucunu yalnızca nesil
 *    değişmemişse yazar (yazarken artırır) → bayat/zaman kaymalı envanter veya eski eşzamanlı mutabakat
 *    `untracked_bytes`'ın üzerine yazamaz.
 */
export const storageQuotaState = pgTable(
  "storage_quota_state",
  {
    id: smallint("id").primaryKey(),
    untrackedBytes: bigint("untracked_bytes", { mode: "number" }).notNull().default(0),
    accountingEpoch: bigint("accounting_epoch", { mode: "number" }).notNull().default(0),
    reconciledAt: timestamptz("reconciled_at"),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("storage_quota_state_singleton_check", sql`${t.id} = 1`),
    check("storage_quota_state_untracked_check", sql`${t.untrackedBytes} >= 0`),
    check("storage_quota_state_epoch_check", sql`${t.accountingEpoch} >= 0`),
  ],
);
