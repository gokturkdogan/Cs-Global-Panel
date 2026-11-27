import type pg from "pg";

/**
 * Ortak veritabanı veri parmak izi (PHASE 10.2, D-129): Neon'da test çalıştırmalarının öncesi/sonrası
 * karşılaştırılır; fark varsa çalıştırma başarısız sayılır. Yalnızca sayılar ve özet hash'ler döner
 * (kişisel veri, bağlantı bilgisi, secret yok). Test oturumları (`test-session-*`) ve kısa ömürlü rate
 * limit anahtarları hariçtir.
 */
export async function dataFingerprint(client: Pick<pg.Client, "query">) {
  const result = await client.query<Record<string, string | number>>(`SELECT
    (SELECT count(*) FROM users)::int AS users,
    (SELECT coalesce(left(md5(string_agg(id || coalesce(password, '') || updated_at::text, ',' ORDER BY id)), 8), '') FROM accounts) AS accounts,
    (SELECT count(*) FROM sessions WHERE id NOT LIKE 'test-%')::int AS sessions,
    (SELECT count(*) FROM services)::int AS services,
    (SELECT count(*) FROM service_document_requirements)::int AS templates,
    (SELECT count(*) FROM applications)::int AS applications,
    (SELECT count(*) FROM application_document_requirements)::int AS requirements,
    (SELECT count(*) FROM application_document_files)::int AS files,
    (SELECT count(*) FROM storage_write_attempts)::int AS write_attempts,
    (SELECT count(*) FROM application_deletions)::int AS deletions,
    (SELECT count(*) FROM application_access_tokens)::int AS tokens,
    (SELECT count(*) FROM document_reviews)::int AS reviews,
    (SELECT count(*) FROM document_comments)::int AS comments,
    (SELECT count(*) FROM application_internal_notes)::int AS notes,
    (SELECT count(*) FROM application_status_history)::int AS history,
    (SELECT count(*) FROM audit_logs)::int AS audit,
    (SELECT coalesce(max(id), 0) FROM audit_logs)::bigint::text AS audit_max_id,
    (SELECT md5(row(untracked_bytes, reconciled_at)::text) FROM storage_quota_state WHERE id = 1) AS quota`);
  return result.rows[0]!;
}

export function fingerprintDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return Object.keys(before).filter((key) => before[key] !== after[key]);
}
