"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/compra-agil";
  const timeout = searchParams.get("reason") === "timeout";

  const [rut, setRut] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [nombre, setNombre] = useState("");

  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated) router.replace(next);
        else if (data.needsSetup) setNeedsSetup(true);
      })
      .catch(() => undefined);
  }, [router, next]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const url = needsSetup ? "/api/auth/setup" : "/api/auth/login";
      const body = needsSetup ? { rut, password, nombre } : { rut, password };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al ingresar");
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-[#11233d] px-4 py-10">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-[#d4a017]/30 bg-white p-8 shadow-2xl">
        <div className="text-center">
          <Image src="/oportunia-logo.png" alt="OportunIA" width={180} height={56} className="mx-auto h-12 w-auto" />
          <p className="mt-2 text-xs uppercase tracking-widest text-[#d4a017]">OportunIA MP</p>
          <h1 className="mt-1 font-heading text-xl font-semibold text-[#11233d]">
            {needsSetup ? "Crear usuario principal" : "Iniciar sesión"}
          </h1>
        </div>

        {timeout && (
          <Alert>
            <AlertDescription>Tu sesión expiró por inactividad (60 min). Vuelve a ingresar.</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {!needsSetup && " Si es tu primera vez, la pantalla debería decir «Crear usuario principal». Si no aparece, ejecuta la migración org_users en Supabase."}
            </AlertDescription>
          </Alert>
        )}

        {needsSetup && (
          <Alert>
            <AlertDescription>
              <strong>Primera vez:</strong> elige tu RUT personal y una clave (mín. 4 caracteres). Serás el usuario principal de la empresa.
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          {needsSetup && (
            <div className="space-y-1">
              <Label htmlFor="nombre">Tu nombre</Label>
              <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre completo" />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="rut">RUT personal</Label>
            <Input id="rut" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-9" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Clave</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
          </div>
          <Button type="submit" variant="brand" className="w-full" disabled={loading}>
            {loading ? "Ingresando…" : needsSetup ? "Crear cuenta" : "Ingresar"}
          </Button>
        </form>
      </div>
    </div>
  );
}
