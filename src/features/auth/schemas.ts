import { z } from "zod";

import { PASSWORD_MAX_LENGTH } from "@/config/constants";

/** Giriş formu girdisi. Üst sınırlar kötüye kullanıma karşıdır; şifre politikası CLI'da uygulanır. */
export const signInSchema = z
  .object({
    username: z.string().trim().min(1).max(64),
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  })
  .strict();

export type SignInState = { readonly error: string | null };
