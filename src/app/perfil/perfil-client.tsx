"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function PerfilClient() {
  const router = useRouter();
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreFantasia, setNombreFantasia] = useState("");
  const [rutDisplay, setRutDisplay] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/onboarding").then((r) => r.json()),
      fetch("/api/auth/status").then((r) => r.json()),
    ]).then(([orgData, authData]) => {
      const org = orgData.organization;
      if (org) {
        setRazonSocial(org.razon_social ?? org.name ?? "");
        setNombreFantasia(org.nombre_fantasia ?? org.name ?? "");
        if (org.rut) setRutDisplay(`${org.rut}-${org.rut_dv ?? ""}`);
      }
      if (authData.user?.nombre) setUserName(authData.user.nombre);
    }).catch(() => undefined);
  }, []);

  async function handleSave() {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/org/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razon_social: razonSocial, nombre_fantasia: nombreFantasia }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Perfil actualizado");
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg space-y-6 px-4 py-8 sm:px-6">
      <div className="brand-card overflow-hidden">
        <div className="bg-[#11233d] px-6 py-8 text-center">
          <div className="mx-auto mb-3 flex size-16 items-center justify-center rounded-full bg-[#d4a017] text-2xl font-bold text-[#11233d]">
            {(userName?.[0] ?? "U").toUpperCase()}
          </div>
          <h2 className="font-heading text-xl font-semibold text-white">{userName || "Usuario"}</h2>
          <p className="mt-1 text-sm text-white/70">{nombreFantasia || "Empresa"}</p>
        </div>
        <div className="space-y-4 p-6 text-sm">
          <div className="space-y-1">
            <Label>Razón social</Label>
            <Input value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Nombre de fantasía (banner)</Label>
            <Input value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">RUT empresa</p>
            <p className="font-medium">{rutDisplay || "No configurado"}</p>
          </div>
          {status && (
            <Alert>
              <AlertDescription>{status}</AlertDescription>
            </Alert>
          )}
          <Button variant="brand" disabled={loading} onClick={handleSave}>
            {loading ? "Guardando…" : "Guardar perfil"}
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Link href="/ajustes">
          <Button variant="brand" className="w-full">Configuración y usuarios</Button>
        </Link>
        <Link href="/">
          <Button variant="outline" className="w-full">Volver al Dashboard</Button>
        </Link>
        <Button variant="outline" onClick={handleLogout}>
          Cerrar sesión
        </Button>
      </div>
    </main>
  );
}
