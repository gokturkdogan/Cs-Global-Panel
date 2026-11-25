/** Panoya yazar; gerçek sonucu döndürür (izin/HTTPS yoksa false — arayüz elle kopyalama sunar). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
