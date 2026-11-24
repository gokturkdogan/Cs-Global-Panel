import { Info } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { company } from "@/config/company";

/**
 * PHASE 01 altyapı önizleme sayfası. Gerçek panel veya müşteri ekranı değildir;
 * giriş, veri veya işlev içermez. Kalıcı `/` davranışı (yönlendirme) PHASE 03'te gelir.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <Card className="w-full max-w-lg shadow-sm md:[--card-spacing:--spacing(6)]">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Logo withTagline />
            <Badge variant="info">Geliştirme aşamasında</Badge>
          </div>
          <Separator />
          <div className="grid gap-2">
            <h1 className="font-heading text-2xl leading-tight font-semibold text-foreground">
              {company.productName}
            </h1>
            <CardDescription className="text-base">
              Başvuru, evrak ve danışmanlık süreçleri tek bir güvenli platformda buluşacak.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {/* Statik bilgi: canlı bölge (role="alert") olarak duyurulmaz. */}
          <Alert variant="info" role="note">
            <Info aria-hidden="true" />
            <AlertTitle>Platform altyapısı hazırlanıyor.</AlertTitle>
            <AlertDescription>
              Bu sayfa yalnızca teknik altyapının önizlemesidir. Henüz giriş, başvuru veya evrak
              işlemi bulunmamaktadır.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </main>
  );
}
