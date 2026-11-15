# Kispa — Sistema de administración autoconfigurable para microempresas

> **Dile a tu negocio lo que necesitas. Kispa lo construye.**

Kispa es una plataforma tecnológica (mercado inicial: Colombia, proyección: Latinoamérica) que permite a
microempresas y comercios tradicionales obtener su propio sistema de administración **conversando con un
asistente inteligente**: el empresario describe su negocio, el asistente propone una configuración
(módulos, campos, categorías, panel y automatizaciones), el empresario la revisa y aprueba, y el sistema
construye el espacio de trabajo funcional con datos reales.

## Stack

- **Aplicación web/PWA + sitio comercial**: Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **API y lógica de negocio**: Route Handlers de Next.js (REST) con validación zod
- **Base de datos central**: PostgreSQL vía Drizzle ORM (aislamiento multi-tenant por `company_id`)
- **Escritorio descargable**: Tauri 2 (`desktop/`) + PWA instalable (`/manifest.webmanifest`, service worker)
- **IA desacoplada**: OpenAI / Anthropic / Google / Ollama / motor local (`AI_PROVIDER`), salida JSON validada
- **Almacenamiento local y cola offline**: cola en `localStorage` + outbox idempotente (`/api/outbox`);
  en el escritorio, SQLite como caché local (ver `docs/DESKTOP.md`)
- **Pruebas**: `node --experimental-strip-types --test tests/*.test.ts`

## Inicio rápido

```bash
cp .env.example .env   # o usa el .env incluido (DATABASE_URL local)
npm install
npx drizzle-kit generate --name init   # si cambias el esquema
psql "$DATABASE_URL" -f drizzle/0000_init.sql   # aplicar migración
# sembrar planes (ya incluido en la migración de ejemplo o vía SQL, ver docs/SETUP.md)
npm run dev
```

Abrir http://localhost:3000 → crear cuenta → registrar negocio → conversar con el asistente → aprobar la
configuración propuesta → usar el sistema.

## Flujo del MVP (criterios de aceptación)

1. El empresario se registra e instala/abre la app.
2. Registra su negocio y conversa con el asistente.
3. El asistente interpreta y propone una configuración (vista previa, nada se aplica sin aprobación).
4. Al aprobar, el motor configura módulos, categorías, panel y automatizaciones.
5. Registra clientes, productos y ventas; el inventario se descuenta solo.
6. Las automatizaciones generan alertas reales (stock bajo, cuentas vencidas).
7. El asistente consulta datos reales autorizados (ventas del mes, por cobrar, top productos).
8. Puede modificar la configuración conversando de nuevo.

## Estructura

```
src/
  app/                 # páginas (landing, login, register, onboarding, /app/*) y rutas /api/*
  components/          # UI: shell, chat, logo, iconos, primitives
  db/                  # Drizzle: schema.ts (todas las tablas) + conexión
  lib/
    http.ts            # sesiones, contexto multi-tenant, auditoría, helpers
    permissions.ts     # matriz roles × módulos (puro, testeado)
    modules.ts         # registro de módulos (campos, validación zod)
    config/patch.ts    # esquemas del motor de configuración + propuesta desde perfil (puro, testeado)
    config/engine.ts   # aplicación de parches, pending_changes, aprobación
    ai/providers.ts    # capa intercambiable de proveedores de IA
    ai/local.ts        # motor local determinista (demo/fallback)
    ai/assistant.ts    # orquestación del chat (historial, snapshot real, propuestas)
    automations/       # motor de automatización (condiciones puras + corredor con anti-duplicados)
    reports.ts         # consultas reales: snapshot, dashboard, reportes
    client/            # cliente HTTP con cola offline (outbox)
  middleware.ts        # protección de rutas /app y /api por sesión
desktop/               # empaquetado Tauri 2 (Windows MSI/NSIS, macOS DMG, Linux AppImage/DEB)
tests/                 # pruebas unitarias (node:test)
docs/                  # arquitectura, setup, API, seguridad, despliegue, modelo de negocio, marca
drizzle/               # migraciones SQL generadas
```

## Comandos

```bash
npm run dev          # desarrollo
npm run build        # build de producción
npm run start        # servir build
npx next typegen     # tipos de rutas
npm exec tsc -- --noEmit
node --experimental-strip-types --test tests/*.test.ts   # pruebas unitarias
npx drizzle-kit generate --name <nombre>   # nueva migración
npx drizzle-kit push                       # push directo (desarrollo)
```

## Documentación

Ver `docs/`: [ARCHITECTURE](docs/ARCHITECTURE.md) · [SETUP](docs/SETUP.md) · [API](docs/API.md) ·
[SECURITY](docs/SECURITY.md) · [DEPLOYMENT](docs/DEPLOYMENT.md) · [BUSINESS_MODEL](docs/BUSINESS_MODEL.md) ·
[DESKTOP](docs/DESKTOP.md) · [AI_PROVIDERS](docs/AI_PROVIDERS.md) · [BRAND](docs/BRAND.md)
