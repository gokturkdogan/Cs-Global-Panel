import type { MetadataRoute } from "next";

/** Tüm tarayıcı botlarına kapalı. Erişim kontrolü değildir; yalnızca indeksleme politikasıdır. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
