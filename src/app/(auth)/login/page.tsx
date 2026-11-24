import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Logo } from "@/components/shared/logo";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { company } from "@/config/company";
import { LoginForm } from "@/features/auth/components/login-form";
import { getCurrentStaff } from "@/server/auth/staff";

export const metadata: Metadata = { title: "Personel Girişi | CS Global" };

/** Tek ortak personel giriş ekranı (ADMIN ve EMPLOYEE aynı ekranı kullanır — OD-24). */
export default async function LoginPage() {
  if ((await getCurrentStaff()) !== null) redirect("/dashboard");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-md shadow-sm md:[--card-spacing:--spacing(6)]">
        <CardHeader className="gap-4">
          <Logo withTagline />
          <Separator />
          <div className="grid gap-1">
            <p className="text-sm font-medium text-muted-foreground">{company.productName}</p>
            <h1 className="font-heading text-2xl leading-tight font-semibold text-foreground">
              Personel Girişi
            </h1>
            <CardDescription className="text-base">
              Kullanıcı adınız ve şifrenizle giriş yapın.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
