import type pg from "pg";

/**
 * Geçici (`test-` önekli) personel hesaplarını ve bunlara bağlı sentetik kayıtları FK sırasıyla siler.
 * Gerçek hesaplara ve onların kayıtlarına dokunulmaz; audit kayıtları silinmez (append-only).
 *
 * Kullanım: integration global teardown (güvenlik ağı) ve hesap yaşam döngüsü testinin başlangıcı
 * (PHASE 12, SEC-13): izole modda bazı dosyalar geçici hesabı teardown'a kadar bırakır; yaşam döngüsü
 * testi boş hesap tablosu ön koşulunu dosya sırasından bağımsız kurar.
 */
export async function removeTemporaryTestData(client: pg.ClientBase): Promise<void> {
  await client.query("DELETE FROM applications WHERE created_by_user_id LIKE 'test-%'");
  await client.query(
    "DELETE FROM service_document_requirements WHERE service_id IN (SELECT id FROM services WHERE created_by_user_id LIKE 'test-%')",
  );
  await client.query("DELETE FROM services WHERE created_by_user_id LIKE 'test-%'");
  await client.query("DELETE FROM users WHERE id LIKE 'test-%'");
}
