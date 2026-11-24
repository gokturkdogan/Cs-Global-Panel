import { FileQuestion } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { messages } from "@/lib/messages";

export default function DashboardNotFound() {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <EmptyState
        icon={FileQuestion}
        title={messages.dashboard.notFoundTitle}
        description={messages.dashboard.notFoundDescription}
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard">Genel Bakış&apos;a dön</Link>
          </Button>
        }
      />
    </div>
  );
}
