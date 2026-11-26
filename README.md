# OportunIA MP

Sistema de seguimiento de licitaciones y compras ágiles de Mercado Público (Chile), orientado a OTECs y consultoras de capacitación/bienestar.

## Modelo

- **Single-tenant por cliente**: cada instancia = 1 Supabase + 1 deploy Vercel
- **BYO API Key**: el cliente usa su propia clave Anthropic
- **Ingesta sin IA** para estados y adjudicaciones; Claude solo para procesos nuevos

## Stack

- Next.js 16 + Tailwind + shadcn/ui
- Supabase (Postgres + Auth + Storage)
- Vercel Cron → worker Node de ingesta

## Fase (a) — Estado actual

- [x] Scaffold Next.js + shadcn/ui
- [x] Schema SQL (`supabase/migrations/`)
- [x] Worker de ingesta (`/api/cron/ingest`)
- [x] Normalización de montos (enteros CLP)
- [x] Script migración desde CSV (`npm run migrate:sheets`)

## Setup local

```bash
npm install
cp .env.example .env.local
# Completa .env.local con credenciales de tu proyecto Supabase oportunia-mp
npm run dev
```

## Supabase

1. Crea un proyecto nuevo en [supabase.com](https://supabase.com) llamado `oportunia-mp`
2. Ve a **SQL Editor** y ejecuta el contenido de `supabase/migrations/20260316000000_initial_schema.sql`
3. Copia URL, anon key y service role key a `.env.local`

## Migración desde Google Sheets

Con Supabase configurado:

```bash
npm run migrate:sheets
```

Los CSV deben estar en `data/migration/`.

## Sync Compra Ágil (GitHub Actions)

La importación de CA abiertas **no corre en Vercel Hobby** (máx. ~10 s). Corre en GitHub Actions (~5–15 min), igual que el script local `npm run sync:ca-full`.

### Secretos del repo (Settings → Secrets and variables → Actions)

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Horario: **01:01 y 10:01 hora Chile**. El botón **Sincronizar Compra Ágil** dispara el mismo workflow.

### Botón del dashboard (Vercel)

Crea un PAT (fine-grained) con **Actions: Read and write** sobre este repo y agrégalo en Vercel:

- `GITHUB_SYNC_TOKEN`
- `GITHUB_REPO=capitalpsicologicocl/oportunia-mp` (opcional si el deploy ya trae `VERCEL_GIT_REPO_*`)

Para probar a mano:

```bash
gh workflow run sync-compra-agil.yml
```

## Fase (b) — Onboarding

- [x] Wizard `/onboarding` (empresa → API keys → rubros → confirmar)
- [x] API key Anthropic cifrada en DB
- [x] Validación ticket ChileCompra
- [x] Selector rubros UNSPSC + sugerencia por RUT
- [x] Página `/ajustes` para actualizar keys
- [x] Template keywords (~36 palabras, 5 categorías)

### Migración SQL adicional (Fase b)

Ejecuta en Supabase SQL Editor:

`supabase/migrations/20260316100000_unspsc_catalog.sql`

## Fase (c) — Dashboard

- [x] Tabla de procesos con paginación (25 por página)
- [x] Filtros: búsqueda, tipo, postulabilidad, keywords/rubros
- [x] Montos formateados en CLP, fechas en es-CL
- [x] Stats: total en DB vs coincidencias con filtro

## Fase (d) — Alertas y bandeja

- [x] Bandeja persistente en `/bandeja`
- [x] Badge contador en header
- [x] Marcar leída / marcar todas
- [x] Filtro «Adjudicado a ti» en dashboard
- [x] Sincronización adjudicados vs RUT de la org
- [x] Banner en dashboard si hay notificaciones sin leer

## Fase (e) — Kanban CRM

- [x] Tablero `/kanban` con 5 columnas (pre-evaluación → pagada)
- [x] Drag & drop entre columnas (`@dnd-kit`)
- [x] Panel de detalle: seguimiento comercial, análisis financiero, costos
- [x] Campos OTEC (modalidad, SENCE, participantes, horas)
- [x] Campos personalizados por tarjeta
- [x] Agregar proceso al CRM por código
- [x] Vista «Activos CRM» (postulabilidad alta/media, adjudicados, con datos)

## Próximo paso

## Historial dashboard (mejora operativa)

- Columna `dashboard_archived_at` en `processes` — migración `20260317000000_dashboard_historial.sql`
- Archivado automático al finalizar sync manual y en cron nocturno (00:01 Chile)
- Página `/historial` con restaurar al dashboard activo
- Botón **Archivar ahora** en Historial para limpiar terminales y cerradas >30 días

Reglas: no archiva procesos en Kanban activo ni adjudicados a tu empresa.

## Fase C — Descubrimiento por rubros UNSPSC

- Rubros MP mapeados a códigos UNSPSC reales (`src/lib/onboarding/rubros-unspsc.ts`)
- Migración `20260317100000_mp_rubros_unspsc.sql` (actualiza `selected_rubros` + unique por nombre)
- Filtro unificado en descubrimiento CA/lic: keyword **OR** nombre rubro **OR** familia UNSPSC
- Segunda pasada sync CA: listado reciente 72 h sin keyword, filtrado por UNSPSC/rubros
- Términos de búsqueda CA priorizan palabras de tus rubros MP

## Fase D — Keywords ampliadas

- Nuevas en template + migración `20260317200000_keywords_fase_d.sql`:
  `congreso`, `charla`, `entrenamiento`, `psicoeducación`, `mentorias`, `relator`, `monitoreo`
- Ya incluidas antes: `seminario`, `jornada`, `mentoría`, `relatoría`, `transcripción`
- Exclusiones anti-ruido: monitores/pantallas LCD (hardware), sin keyword suelta `monitor`

## Fase E — CRM visual en dashboard

- Badge CRM por etapa Kanban (dorado Pre-evaluación, azul Prep. PT, etc.) — `src/lib/dashboard/crm-styles.ts`
- Fila con borde/accento izquierdo según etapa CRM; texto sin negrita si está en CRM
- Filtro **Estado CRM**: Sin CRM · En CRM · cada columna · **Ejecución en adelante**
- Enlace **Ver Kanban** abre el tablero filtrado por código del proceso
- Ordenamiento respeta `/compra-agil` y `/licitaciones` (basePath)
