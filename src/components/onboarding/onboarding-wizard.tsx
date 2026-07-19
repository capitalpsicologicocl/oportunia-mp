"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RUBROS_MERCADO_PUBLICO_TEMPLATE } from "@/lib/onboarding/templates";

interface Rubro {
  codigo_unspsc: string;
  nombre: string;
  sugerido_por_rut?: boolean;
}

const STEPS = [
  { id: 1, title: "Tu empresa" },
  { id: 2, title: "Conexiones API" },
  { id: 3, title: "Rubros UNSPSC" },
  { id: 4, title: "Confirmar" },
] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [nombreFantasia, setNombreFantasia] = useState("");
  const [rut, setRut] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [chilecompraTicket, setChilecompraTicket] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Rubro[]>([]);
  const [selectedRubros, setSelectedRubros] = useState<Rubro[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);

  useEffect(() => {
    fetch("/api/onboarding")
      .then((r) => r.json())
      .then((data) => {
        if (data.organization?.name) setName(data.organization.name);
        if (data.organization?.razon_social) setRazonSocial(data.organization.razon_social);
        if (data.organization?.nombre_fantasia) setNombreFantasia(data.organization.nombre_fantasia);
        if (data.organization?.rut) {
          setRut(`${data.organization.rut}-${data.organization.rut_dv ?? ""}`);
        }
        if (data.organization?.onboarding_completed) {
          router.replace("/");
        }
      })
      .catch(() => undefined);
  }, [router]);

  const searchRubros = useCallback(async (q: string) => {
    const res = await fetch(`/api/rubros/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setSearchResults(data.results ?? []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 3) searchRubros(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, step, searchRubros]);

  async function saveStep(payload: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al guardar");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function handleEmpresa() {
    await saveStep({
      step: "empresa",
      name: name || nombreFantasia || razonSocial,
      razon_social: razonSocial || name,
      nombre_fantasia: nombreFantasia || name,
      rut,
    });
    setStep(2);
  }

  async function handleConexiones() {
    await saveStep({
      step: "conexiones",
      anthropic_api_key: anthropicKey,
      chilecompra_ticket: chilecompraTicket,
    });
    setStep(3);
  }

  async function handleRubros() {
    await saveStep({ step: "rubros", rubros: selectedRubros });
    setStep(4);
  }

  async function handleComplete() {
    await saveStep({ step: "completar" });
    router.push("/login");
    router.refresh();
  }

  function loadMisRubrosMP() {
    setSelectedRubros(
      RUBROS_MERCADO_PUBLICO_TEMPLATE.map((r) => ({
        codigo_unspsc: r.codigo,
        nombre: r.nombre,
      }))
    );
    setError(null);
  }

  async function handleSuggestRubros() {
    if (!rut.trim()) {
      setError("Ingresa tu RUT en el paso 1 para usar sugerencias");
      return;
    }
    setSuggestLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rubros/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rut }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudieron obtener sugerencias");

      const suggested: Rubro[] = (data.rubros ?? []).map((r: Rubro) => ({
        ...r,
        sugerido_por_rut: true,
      }));

      if (!suggested.length) {
        setError(
          "La API de Mercado Público no devuelve rubros por RUT (solo código de empresa). Usa «Cargar mis rubros de MP» o selecciona manualmente."
        );
        return;
      }

      setSelectedRubros((prev) => {
        const codes = new Set(prev.map((p) => p.codigo_unspsc));
        return [...prev, ...suggested.filter((s) => !codes.has(s.codigo_unspsc))];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al sugerir rubros");
    } finally {
      setSuggestLoading(false);
    }
  }

  function toggleRubro(rubro: Rubro) {
    setSelectedRubros((prev) => {
      const exists = prev.some((r) => r.codigo_unspsc === rubro.codigo_unspsc);
      if (exists) return prev.filter((r) => r.codigo_unspsc !== rubro.codigo_unspsc);
      return [...prev, rubro];
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="text-sm text-muted-foreground">Configuración inicial</p>
        <h1 className="text-2xl font-semibold">Bienvenido a OportunIA MP</h1>
      </div>

      <div className="flex gap-2">
        {STEPS.map((s) => (
          <Badge
            key={s.id}
            variant={step === s.id ? "default" : step > s.id ? "secondary" : "outline"}
          >
            {s.id}. {s.title}
          </Badge>
        ))}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Tu empresa</CardTitle>
            <CardDescription>
              Usamos tu RUT para detectar cuando un proceso es adjudicado a ti.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="razon">Razón social</Label>
              <Input id="razon" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} placeholder="Ej: CAPACITACIONES CLAUDIO RODRIGUEZ CACERES EIRL" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fantasia">Nombre de fantasía (banner)</Label>
              <Input id="fantasia" value={nombreFantasia} onChange={(e) => setNombreFantasia(e.target.value)} placeholder="Ej: OTEC Capital Psicológico" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre corto / referencia</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Opcional si usas fantasía arriba" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rut">RUT empresa (con guión)</Label>
              <Input id="rut" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="Ej: 76123456-7" />
            </div>
            <Button onClick={handleEmpresa} disabled={loading || !(razonSocial.trim() || nombreFantasia.trim() || name.trim())}>
              {loading ? "Guardando…" : "Continuar"}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Conexiones API</CardTitle>
            <CardDescription>
              Tu API key de Anthropic se guarda cifrada. Tú pagas tus propios tokens — yo no administro ni asumo costos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="anthropic">API key Anthropic</Label>
              <Input
                id="anthropic"
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ticket">Ticket ChileCompra / Mercado Público</Label>
              <Input
                id="ticket"
                type="password"
                value={chilecompraTicket}
                onChange={(e) => setChilecompraTicket(e.target.value)}
                placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
              />
              <p className="text-xs text-muted-foreground">
                Solicítalo en{" "}
                <a href="https://api.mercadopublico.cl" className="underline" target="_blank" rel="noreferrer">
                  api.mercadopublico.cl
                </a>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>
                Atrás
              </Button>
              <Button onClick={handleConexiones} disabled={loading || !anthropicKey || !chilecompraTicket}>
                {loading ? "Validando…" : "Validar y continuar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Rubros de Mercado Público</CardTitle>
            <CardDescription>
              Marca los rubros donde postulas. No necesitas copiar todo el árbol de categorías — usa el preset con tus 12 rubros o busca más abajo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="default" onClick={loadMisRubrosMP}>
              Cargar mis 12 rubros de Mercado Público
            </Button>
            <Button variant="secondary" onClick={handleSuggestRubros} disabled={suggestLoading}>
              {suggestLoading ? "Consultando…" : "Intentar sugerencia por RUT (experimental)"}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="search">Buscar rubro</Label>
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ej: capacitación, psicología, consultoría…"
              />
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
              {searchResults.map((rubro) => {
                const checked = selectedRubros.some((r) => r.codigo_unspsc === rubro.codigo_unspsc);
                return (
                  <label key={rubro.codigo_unspsc} className="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-muted">
                    <Checkbox checked={checked} onCheckedChange={() => toggleRubro(rubro)} />
                    <div>
                      <p className="text-sm font-medium">{rubro.nombre}</p>
                      <p className="text-xs text-muted-foreground">{rubro.codigo_unspsc}</p>
                    </div>
                  </label>
                );
              })}
            </div>

            {selectedRubros.length > 0 && (
              <>
                <Separator />
                <p className="text-sm font-medium">Seleccionados ({selectedRubros.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selectedRubros.map((r) => (
                    <Badge key={r.codigo_unspsc} variant={r.sugerido_por_rut ? "default" : "secondary"}>
                      {r.nombre.slice(0, 40)}
                      {r.sugerido_por_rut ? " ★" : ""}
                    </Badge>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={loading}>
                Atrás
              </Button>
              <Button onClick={handleRubros} disabled={loading || selectedRubros.length === 0}>
                {loading ? "Guardando…" : "Continuar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Confirmar configuración</CardTitle>
            <CardDescription>
              Al finalizar cargamos el template de keywords de bienestar/capacitación y marcamos el onboarding como completo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li>✓ Empresa: <strong>{name}</strong> (RUT {rut || "—"})</li>
              <li>✓ API key Anthropic: configurada y cifrada</li>
              <li>✓ Ticket ChileCompra: configurado</li>
              <li>✓ Rubros seleccionados: {selectedRubros.length}</li>
              <li>✓ Keywords template: ~36 palabras en 5 categorías</li>
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} disabled={loading}>
                Atrás
              </Button>
              <Button onClick={handleComplete} disabled={loading}>
                {loading ? "Finalizando…" : "Finalizar onboarding"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
