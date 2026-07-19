import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Kanban,
  RefreshCw,
  Search,
  Users,
  AlertCircle,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function HomePage() {
  const session = await getSessionUser().catch(() => null);

  return (
    <div className="min-h-full bg-[#f4f6f9]">
      <header className="brand-header border-b border-[#d4a017]/20">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Image
            src="/oportunia-logo.png"
            alt="OportunIA"
            width={140}
            height={44}
            className="h-9 w-auto"
            priority
          />
          {session ? (
            <Link href="/compra-agil" className={cn(buttonVariants({ variant: "brand" }), "gap-1.5")}>
              Ir al dashboard
              <ArrowRight className="size-4" />
            </Link>
          ) : (
            <Link href="/login" className={buttonVariants({ variant: "brand" })}>
              Acceder
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#d4a017]">
            Herramienta de gestión · Mercado Público Chile
          </p>
          <h1 className="font-heading mt-3 text-3xl font-bold leading-tight text-[#11233d] sm:text-4xl">
            OportunIA MP
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Primera versión pensada para{" "}
            <strong className="font-medium text-[#11233d]">OTEC, consultoras y equipos de capacitación</strong>{" "}
            que necesitan encontrar, filtrar y <em>administrar</em> oportunidades en Compra Ágil y licitaciones —
            sin perderse en plataformas genéricas de todo rubro.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {session ? (
              <Link href="/compra-agil" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Compra Ágil
              </Link>
            ) : (
              <Link href="/login" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Acceder a mi espacio
              </Link>
            )}
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Iniciar sesión
            </Link>
          </div>
        </section>

        <section className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Search, title: "Descubrimiento", text: "Keywords, rubros UNSPSC y sync con ChileCompra." },
            { icon: RefreshCw, title: "Dashboard vivo", text: "REV/DESC, historial y sync incremental." },
            { icon: Kanban, title: "Kanban CRM", text: "Pre-evaluación → cierre con tarjetas y análisis financiero." },
            { icon: Users, title: "Equipo (5)", text: "Usuarios con RUT por organización." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="brand-card p-4">
              <Icon className="mb-2 size-5 text-[#d4a017]" />
              <h3 className="font-heading text-sm font-semibold text-[#11233d]">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>

        <section className="mt-14 brand-card overflow-hidden">
          <div className="bg-[#11233d] px-6 py-5">
            <h2 className="font-heading text-lg font-semibold text-white">
              Diferenciador: Kanban de administración comercial
            </h2>
            <p className="mt-1 text-sm text-white/75">
              No es solo un buscador — es un flujo de trabajo.
            </p>
          </div>
          <div className="grid gap-6 p-6 sm:grid-cols-2">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#d4a017]" />
                Pre-evalúa desde el dashboard; solo lo relevante entra al CRM.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#d4a017]" />
                Columnas: Pre-evaluación → Preparación PT → Postulada → Ejecución → Cierre → Pagada.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#d4a017]" />
                Costos, utilidad, campos OTEC y enlaces a propuesta técnica.
              </li>
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Las plataformas masivas de licitación priorizan volumen y alertas para cualquier rubro.
              OportunIA MP prioriza <strong className="text-[#11233d]">tu pipeline comercial</strong> en capacitación
              y bienestar laboral, con datos que ya usas en el día a día.
            </p>
          </div>
        </section>

        <section className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="brand-card p-6">
            <h2 className="font-heading text-base font-semibold text-[#11233d]">Ventajas</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>· Filtro por keywords y rubros reales de tu empresa</li>
              <li>· Sync nocturno + manual por Compra Ágil / Licitaciones</li>
              <li>· Historial para limpiar el dashboard sin perder trazabilidad</li>
              <li>· Bandeja de adjudicaciones y cambios de estado</li>
              <li>· Una instancia = tu Supabase + tu deploy (datos aislados)</li>
            </ul>
          </div>
          <div className="brand-card border-amber-200/60 p-6">
            <h2 className="flex items-center gap-2 font-heading text-base font-semibold text-[#11233d]">
              <AlertCircle className="size-4 text-amber-600" />
              Limitaciones (v1)
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>· Nicho capacitación / RRHH / bienestar — no todos los rubros MP</li>
              <li>· Depende de la API de Mercado Público (rate limits, tiempos de sync)</li>
              <li>· No sustituye postulación ni firma en ChileCompra</li>
              <li>· Máximo 5 usuarios por organización</li>
              <li>· Sin app móvil nativa (web responsive)</li>
            </ul>
          </div>
        </section>

        <section className="mt-10 rounded-xl border border-[#d4a017]/30 bg-[#fef9ec] px-6 py-8 text-center">
          <h2 className="font-heading text-lg font-semibold text-[#11233d]">¿Listo para gestionar oportunidades?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Accede con tu RUT y clave de equipo. Sesión activa hasta 60 minutos sin uso.
          </p>
          <Link href="/login" className={cn(buttonVariants({ variant: "brand" }), "mt-4 inline-flex")}>
            {session ? "Continuar sesión" : "Acceder"}
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        OportunIA MP · Consultora Capital Psicológico · v1 capacitación
      </footer>
    </div>
  );
}
