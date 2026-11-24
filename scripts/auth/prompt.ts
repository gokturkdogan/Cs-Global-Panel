/**
 * Etkileşimli terminal girişi. Şifreler ekrana yansıtılmadan okunur (raw mode); komut argümanı,
 * ortam değişkeni veya pipe ile şifre alınmaz — shell geçmişine ve süreç listesine düşmez.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";

export function assertInteractiveTerminal(): void {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "Bu komut yalnızca etkileşimli bir terminalde çalıştırılabilir (pipe/argüman kabul edilmez).",
    );
  }
}

export async function askVisible(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return await rl.question(question);
  } finally {
    rl.close();
  }
}

/** Girilen karakterleri göstermeden bir satır okur. Ctrl+C işlemi iptal eder. */
export function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";

    const finish = (error?: Error) => {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u0003") return finish(new Error("İşlem iptal edildi."));
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        if (char >= " ") value += char;
      }
    };
    stdin.on("data", onData);
  });
}

/** Şifreyi iki kez gizli olarak sorar; eşleşmezse yeniden ister (en fazla 3 deneme). */
export async function askNewPassword(label: string): Promise<string> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const password = await askHidden(`${label} şifresi: `);
    const repeated = await askHidden(`${label} şifresi (tekrar): `);
    if (password === repeated) return password;
    console.log("Şifreler eşleşmiyor, tekrar deneyin.");
  }
  throw new Error("Şifreler eşleşmedi. İşlem iptal edildi.");
}
