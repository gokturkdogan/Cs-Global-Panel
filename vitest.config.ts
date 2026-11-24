import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Unit testler sunucu modüllerini Node'da doğrudan çalıştırır. `server-only`
      // yalnızca React Server ortamında boş modüle çözülür; testte aynı davranış sağlanır.
      "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});
