import { AppHeader } from "@/components/layout/app-header";
import { PerfilClient } from "@/app/perfil/perfil-client";

export default function PerfilPage() {
  return (
    <div className="min-h-full bg-background">
      <AppHeader />
      <PerfilClient />
    </div>
  );
}
