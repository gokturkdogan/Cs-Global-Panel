import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

/** Çıkış formu (Server Action; oturum sunucuda silinir). */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction} className={className}>
      <Button type="submit" variant="outline" className={cn("w-full justify-center")}>
        <LogOut aria-hidden="true" />
        Çıkış Yap
      </Button>
    </form>
  );
}
