import { AppHeader } from "@/components/layout/app-header";
import { AjustesClient } from "@/app/ajustes/ajustes-client";

export default function AjustesPage() {
  return (
    <div className="min-h-full bg-background">
      <AppHeader />
      <AjustesClient />
    </div>
  );
}
