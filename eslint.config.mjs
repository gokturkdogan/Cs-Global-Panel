import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Hassas veride cache yasağı (D-016, ARCHITECTURE §9). */
const cacheRestrictions = [
  {
    selector: "ExpressionStatement[directive=/^use cache/]",
    message: "'use cache' yasaktır (D-016): hassas veri cache'lenmez.",
  },
  {
    selector: "ExportNamedDeclaration VariableDeclarator[id.name='revalidate']",
    message: "`revalidate` segment ayarı yasaktır (D-016).",
  },
  {
    selector:
      "ExportNamedDeclaration VariableDeclarator[id.name='dynamic'][init.value='force-static']",
    message: "`dynamic = 'force-static'` yasaktır (D-016).",
  },
  {
    selector: "Property[key.name='cache'][value.value='force-cache']",
    message: "`cache: 'force-cache'` yasaktır (D-016).",
  },
];

const nextCacheImportRestriction = {
  name: "next/cache",
  importNames: ["unstable_cache", "cacheLife", "cacheTag"],
  message: "Next.js cache API'leri yasaktır (D-016).",
};

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react/no-danger": "error",
      "no-restricted-syntax": ["error", ...cacheRestrictions],
      "no-restricted-imports": ["error", { paths: [nextCacheImportRestriction] }],
    },
  },
  {
    // Client'a gidebilen veya izomorfik kod sunucu modüllerini içe aktaramaz (ARCHITECTURE §7).
    files: ["src/components/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            nextCacheImportRestriction,
            { name: "server-only", message: "Bu klasör sunucuya özel olamaz." },
          ],
          patterns: [
            {
              group: ["@/server", "@/server/*"],
              message: "src/server yalnızca sunucu tarafında kullanılabilir.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
  ]),
]);
