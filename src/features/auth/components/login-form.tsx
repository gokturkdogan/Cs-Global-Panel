"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { signInAction } from "../actions";
import type { SignInState } from "../schemas";

const initialState: SignInState = { error: null };

/** Tek ortak personel giriş formu (iki hesap için aynı — OD-24). E-posta, kayıt, şifremi unuttum yok. */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="grid gap-5" noValidate>
      <div className="grid gap-2">
        <Label htmlFor="username">Kullanıcı adı</Label>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={64}
          required
          aria-invalid={state.error !== null}
          aria-describedby={state.error !== null ? "login-error" : undefined}
          className="h-11 text-base"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Şifre</Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            maxLength={128}
            required
            aria-invalid={state.error !== null}
            aria-describedby={state.error !== null ? "login-error" : undefined}
            className="h-11 pr-12 text-base"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0.5 right-0.5"
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
            aria-pressed={showPassword}
            aria-controls="password"
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
      </div>

      <div aria-live="polite" className="min-h-6">
        {state.error !== null ? (
          <p id="login-error" role="alert" className="text-sm font-medium text-destructive-strong">
            {state.error}
          </p>
        ) : null}
      </div>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? (
          <>
            <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            Giriş yapılıyor…
          </>
        ) : (
          "Giriş Yap"
        )}
      </Button>
    </form>
  );
}
