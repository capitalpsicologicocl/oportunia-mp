"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SyncMercadoPublicoButton } from "@/components/dashboard/sync-mp-button";

interface OrgUser {
  id: string;
  rut: string;
  rut_dv: string;
  nombre: string;
  role: string;
}

export function AjustesClient() {
  const [anthropicKey, setAnthropicKey] = useState("");
  const [chilecompraTicket, setChilecompraTicket] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [keyStatus, setKeyStatus] = useState("missing");
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [newUserRut, setNewUserRut] = useState("");
  const [newUserNombre, setNewUserNombre] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [resetPass, setResetPass] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => setKeyStatus(data.settings?.anthropic_api_key_status ?? "missing"))
      .catch(() => undefined);

    fetch("/api/users")
      .then((r) => r.json())
      .then((data) => {
        setUsers(data.users ?? []);
        setIsOwner(data.role === "owner");
      })
      .catch(() => undefined);
  }, []);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "conexiones",
          anthropic_api_key: anthropicKey,
          chilecompra_ticket: chilecompraTicket,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStatus("Configuración guardada correctamente");
      setKeyStatus("valid");
      setAnthropicKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  async function addUser() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut: newUserRut, nombre: newUserNombre, password: newUserPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewUserRut("");
      setNewUserNombre("");
      setNewUserPass("");
      const refreshed = await fetch("/api/users").then((r) => r.json());
      setUsers(refreshed.users ?? []);
      setStatus("Usuario agregado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function resetUserPassword(userId: string) {
    const password = resetPass[userId];
    if (!password) return;
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetPass((prev) => ({ ...prev, [userId]: "" }));
      setStatus("Clave actualizada");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Configuración</p>
          <h1 className="text-2xl font-semibold">Ajustes</h1>
        </div>
        <Link href="/">
          <Button variant="outline">Volver</Button>
        </Link>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {status && (
        <Alert>
          <AlertDescription>{status}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sincronización Mercado Público</CardTitle>
          <CardDescription>Actualiza el listado con procesos publicados recientemente.</CardDescription>
        </CardHeader>
        <CardContent>
          <SyncMercadoPublicoButton scope="compra_agil" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Estado Anthropic: <strong>{keyStatus}</strong></CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="anthropic">Nueva API key Anthropic</Label>
            <Input id="anthropic" type="password" value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ticket">Ticket ChileCompra</Label>
            <Input id="ticket" type="password" value={chilecompraTicket} onChange={(e) => setChilecompraTicket(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={loading || (!anthropicKey && !chilecompraTicket)}>
            {loading ? "Validando…" : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Usuarios de la empresa</CardTitle>
            <CardDescription>Hasta 5 usuarios con RUT personal y clave. ({users.length}/5)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {users.map((u) => (
              <div key={u.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{u.nombre}</p>
                <p className="text-muted-foreground">{u.rut}-{u.rut_dv} · {u.role === "owner" ? "Principal" : "Usuario"}</p>
                {u.role !== "owner" && (
                  <div className="mt-2 flex gap-2">
                    <Input
                      type="password"
                      placeholder="Nueva clave"
                      value={resetPass[u.id] ?? ""}
                      onChange={(e) => setResetPass((p) => ({ ...p, [u.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" disabled={loading} onClick={() => resetUserPassword(u.id)}>
                      Blanquear
                    </Button>
                  </div>
                )}
              </div>
            ))}

            {users.length < 5 && (
              <div className="space-y-2 border-t pt-4">
                <Label>Agregar usuario</Label>
                <Input placeholder="RUT personal" value={newUserRut} onChange={(e) => setNewUserRut(e.target.value)} />
                <Input placeholder="Nombre" value={newUserNombre} onChange={(e) => setNewUserNombre(e.target.value)} />
                <Input type="password" placeholder="Clave inicial" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} />
                <Button variant="brand" disabled={loading} onClick={addUser}>Agregar usuario</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
