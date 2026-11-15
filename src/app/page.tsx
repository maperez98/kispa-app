import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plans } from "@/db/schema";
import { BRAND, formatCOP } from "@/lib/brand";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { InstallButton } from "@/components/install-button";

export const dynamic = "force-dynamic";

const SECTORS = [
  "Tiendas de barrio", "Restaurantes y cafeterías", "Panaderías", "Peluquerías y salones",
  "Talleres y mecánica", "Farmacias", "Tiendas de ropa", "Servicios profesionales",
];

const STEPS = [
  { icon: "download", title: "Instala Kispa", text: "Descarga la aplicación o instálala desde tu navegador. Sin contratos ni tarjeta." },
  { icon: "chat", title: "Conversa con tu asistente", text: "Cuéntale qué vendes, cómo trabajas y qué te preocupa. Haz preguntas como a una persona." },
  { icon: "check", title: "Aprueba tu sistema", text: "El asistente propone módulos, campos, categorías y automatizaciones. Tú revisas y apruebas." },
  { icon: "zap", title: "Opera tu negocio", text: "Registra ventas, controla inventario, gastos y clientes. Las automatizaciones trabajan solas." },
];

const FEATURES = [
  { icon: "sparkles", title: "Asistente que configura tu sistema", text: "Dile a tu negocio qué necesitas y Kispa propone los módulos, campos, categorías y paneles. Nada se aplica sin tu aprobación." },
  { icon: "zap", title: "Automatizaciones reales", text: "Alertas de stock bajo, recordatorios de cuentas vencidas y actualizaciones automáticas ante cada venta o gasto." },
  { icon: "dashboard", title: "Panel único para tu negocio", text: "Cada empresa ve un dashboard distinto, construido con datos reales de sus propias operaciones." },
  { icon: "box", title: "Inventario con movimientos", text: "Entradas, salidas y ajustes con historial. Las ventas descuentan stock automáticamente." },
  { icon: "refresh", title: "Sincronización y modo sin conexión", text: "Tus operaciones se encolan sin conexión y se sincronizan de forma segura al volver, sin duplicados." },
  { icon: "shield", title: "Seguridad empresarial", text: "Aislamiento total entre empresas, roles y permisos, auditoría de cada acción y sesiones protegidas." },
];

const FAQ = [
  { q: "¿Necesito saber de tecnología o programación?", a: "No. Kispa está pensada para que converses con el asistente en español común. Tú apruebas cada cambio antes de que suceda." },
  { q: "¿Funciona sin internet?", a: "Sí. La aplicación guarda tus datos localmente y encola las operaciones pendientes; cuando vuelva la conexión se sincronizan automáticamente sin duplicar nada." },
  { q: "¿Mis datos se mezclan con los de otros negocios?", a: "No. Cada empresa tiene su propio espacio aislado. Todas las consultas verifican tu empresa y tu rol en el servidor, no solo en la interfaz." },
  { q: "¿Puedo cambiar la configuración después?", a: "Sí. En cualquier momento le dices al asistente qué quieres modificar —agregar un campo, una categoría, una automatización— y lo propone para tu aprobación." },
  { q: "¿Cuánto cuesta?", a: "Puedes empezar gratis. Los planes de pago se activan cuando configures un proveedor de pagos; mientras tanto ves el catálogo de planes sin cobros." },
  { q: "¿Qué pasa con la inteligencia artificial?", a: "Kispa usa una capa intercambiable de proveedores de IA (OpenAI, Anthropic, Google, Ollama o un modelo local). La IA solo propone cambios estructurados; el sistema valida, tú apruebas y el servidor aplica con permisos." },
];

export default async function LandingPage() {
  const allPlans = await db.select().from(plans).where(eq(plans.active, true)).orderBy(plans.priceCopMonth);

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/"><Logo size={26} /></Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <a href="#como-funciona" className="hover:text-ink">Cómo funciona</a>
            <a href="#funciones" className="hover:text-ink">Funciones</a>
            <a href="#sectores" className="hover:text-ink">Sectores</a>
            <a href="#planes" className="hover:text-ink">Planes</a>
            <a href="#faq" className="hover:text-ink">Preguntas</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3.5 py-2 text-sm text-muted transition-colors hover:text-ink">Ingresar</Link>
            <Link href="/register" className="rounded-xl bg-ember px-4 py-2 text-sm font-semibold text-[#1a0b04] transition-colors hover:bg-ember-soft">
              Empezar gratis
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 50% at 50% 0%, rgba(255,90,31,0.13), transparent 70%)" }}
        />
        <div className="mx-auto max-w-6xl px-6 pb-20 pt-24 text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-ember/30 bg-ember/10 px-3.5 py-1.5 text-xs font-medium text-ember-soft animate-rise">
            <Icon name="flame" className="h-3.5 w-3.5" /> El sistema de tu negocio, construido conversando
          </div>
          <h1 className="mx-auto max-w-3xl font-display text-[clamp(2.4rem,6vw,4.4rem)] font-bold leading-[1.04] tracking-tight animate-rise">
            Dile a tu negocio lo que necesitas. <span className="text-ember">Kispa lo construye.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted animate-rise">
            La plataforma que convierte una conversación en tu sistema de administración: ventas, inventario,
            clientes, gastos, por cobrar y automatizaciones —sin contratar desarrolladores.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3 animate-rise">
            <Link href="/register" className="rounded-xl bg-ember px-6 py-3.5 text-sm font-semibold text-[#1a0b04] shadow-[0_8px_30px_-8px_rgba(255,90,31,0.6)] transition-all hover:bg-ember-soft">
              Crear mi cuenta gratis
            </Link>
            <InstallButton />
          </div>
          <p className="mt-4 text-xs text-faint">Mercado inicial: Colombia · Proyección: Latinoamérica</p>

          {/* Product mock */}
          <div className="mx-auto mt-16 max-w-4xl animate-rise">
            <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
              <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                <span className="h-2.5 w-2.5 rounded-full bg-ember/60" />
                <span className="ml-3 text-xs text-faint">kispa — Tienda El Buen Precio</span>
              </div>
              <div className="grid grid-cols-[150px_1fr] text-left md:grid-cols-[190px_1fr]">
                <div className="hidden border-r border-line bg-panel-2 p-4 sm:block">
                  {["Panel", "Asistente", "Ventas", "Productos", "Clientes", "Gastos"].map((m, i) => (
                    <div key={m} className={`mb-1 rounded-lg px-3 py-2 text-xs ${i === 1 ? "bg-ember/15 font-medium text-ember-soft" : "text-muted"}`}>{m}</div>
                  ))}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-br-md bg-ember px-4 py-2.5 text-xs text-[#1a0b04]">
                      Tengo una tienda de barrio. Vendo alimentos, bebidas y aseo. Quiero controlar ventas, inventario y recibir alertas cuando algo se esté agotando.
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-panel-2 px-4 py-3 text-xs text-ink">
                      Perfecto. Te propongo un sistema con <strong>Productos e inventario</strong>, <strong>Ventas</strong>,{" "}
                      <strong>Clientes</strong>, <strong>Gastos</strong> y una <strong>automatización de alerta cuando queden 5 unidades o menos</strong>.
                      ¿Lo aprobamos?
                    </div>
                  </div>
                  <div className="flex justify-start">
                    <div className="rounded-xl border border-ember/40 bg-ember/10 px-4 py-3 text-xs">
                      <p className="mb-1 font-semibold text-ember-soft">Vista previa de la configuración</p>
                      <p className="text-muted">7 módulos · 6 categorías de productos · panel con ingresos, gastos, stock bajo y ventas recientes · 2 automatizaciones</p>
                      <span className="mt-2 inline-block rounded-lg bg-ember px-3 py-1.5 text-[11px] font-semibold text-[#1a0b04]">Aprobar y aplicar</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[["Ingresos del mes", "$ 1.240.000"], ["Gastos", "$ 610.000"], ["Stock bajo", "3 productos"]].map(([l, v]) => (
                      <div key={l} className="rounded-xl border border-line bg-panel-2 p-3">
                        <p className="text-[10px] text-faint">{l}</p>
                        <p className="mt-0.5 font-display text-sm font-semibold">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">De la idea al sistema, en minutos</h2>
          <p className="mt-2 max-w-lg text-muted">Sin formularios técnicos, sin plantillas genéricas, sin développeurs.</p>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.title} className="rounded-2xl border border-line bg-panel p-5">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember/15 text-ember">
                    <Icon name={s.icon} className="h-4 w-4" />
                  </span>
                  <span className="text-xs text-faint">0{i + 1}</span>
                </div>
                <p className="font-display text-sm font-semibold">{s.title}</p>
                <p className="mt-1.5 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Funciones */}
      <section id="funciones" className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Un sistema completo, no una herramienta suelta</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-line bg-panel p-6 transition-colors hover:border-ember/30">
                <span className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-ember/15 text-ember">
                  <Icon name={f.icon} className="h-4.5 w-4.5 h-5 w-5" />
                </span>
                <p className="font-display text-base font-semibold">{f.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sectores */}
      <section id="sectores" className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Hecho para los negocios reales de Latinoamérica</h2>
          <p className="mt-2 max-w-lg text-muted">Cada negocio recibe una configuración distinta según su sector y sus necesidades.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            {SECTORS.map((s) => (
              <span key={s} className="rounded-full border border-line bg-panel px-4 py-2 text-sm text-muted">{s}</span>
            ))}
            <span className="rounded-full border border-ember/40 bg-ember/10 px-4 py-2 text-sm text-ember-soft">+ tu sector</span>
          </div>
        </div>
      </section>

      {/* Planes */}
      <section id="planes" className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Planes simples en pesos colombianos</h2>
          <p className="mt-2 max-w-lg text-muted">Empieza gratis y crece cuando tu negocio crezca.</p>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            {allPlans.map((p) => (
              <div key={p.id} className={`rounded-2xl border bg-panel p-6 ${p.id === "pro" ? "border-ember/50" : "border-line"}`}>
                {p.id === "pro" && <span className="mb-2 inline-block rounded-full bg-ember/15 px-2.5 py-0.5 text-[11px] font-semibold text-ember-soft">Recomendado</span>}
                <p className="font-display text-lg font-semibold">{p.name}</p>
                <p className="mt-2 font-display text-3xl font-bold">
                  {p.priceCopMonth === 0 ? "Gratis" : formatCOP(p.priceCopMonth * 100)}
                  {p.priceCopMonth > 0 && <span className="text-sm font-normal text-muted"> /mes</span>}
                </p>
                <ul className="mt-5 space-y-2 text-sm text-muted">
                  {(p.features as string[]).map((f) => <li key={f} className="flex gap-2"><Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ember" />{f}</li>)}
                </ul>
                <Link
                  href="/register"
                  className={`mt-6 block rounded-xl py-2.5 text-center text-sm font-semibold transition-colors ${p.id === "pro" ? "bg-ember text-[#1a0b04] hover:bg-ember-soft" : "border border-line hover:bg-white/5"}`}
                >
                  Empezar con {p.name}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-faint">Los cobros en línea se activan al configurar un proveedor de pagos (Stripe u otro) en las variables de entorno del servidor.</p>
        </div>
      </section>

      {/* Descarga */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-semibold tracking-tight">Tu negocio, en tu dispositivo</h2>
              <p className="mt-3 text-muted">
                Instala Kispa como aplicación en tu computador o celular. En Windows, macOS y Linux generamos
                instaladores nativos (MSI/EXE, .dmg, AppImage) con Tauri 2 sobre esta misma plataforma.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <InstallButton />
                <a href="#faq" className="rounded-xl border border-line px-5 py-3 text-sm text-muted transition-colors hover:bg-white/5">
                  Ver instrucciones de instalación
                </a>
              </div>
              <ul className="mt-6 space-y-2 text-sm text-muted">
                <li className="flex gap-2"><Icon name="monitor" className="mt-0.5 h-4 w-4 text-ember" /> Aplicación instalable (PWA) y empaquetado de escritorio con Tauri 2</li>
                <li className="flex gap-2"><Icon name="refresh" className="mt-0.5 h-4 w-4 text-ember" /> Sincronización con la nube y cola local sin conexión</li>
                <li className="flex gap-2"><Icon name="shield" className="mt-0.5 h-4 w-4 text-ember" /> Tus datos cifrados en tránsito y aislados por empresa</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-6">
              <p className="font-display text-sm font-semibold">Requisitos</p>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>Windows 10/11, macOS 12+ o Linux (x64)</li>
                <li>Navegador moderno para la versión web/PWA</li>
                <li>Conexión a internet para sincronizar (funciona sin conexión y sincroniza después)</li>
              </ul>
              <div className="mt-5 rounded-xl border border-line bg-panel-2 p-4 font-mono text-xs text-muted">
                <p># Empaquetado de escritorio (Tauri 2)</p>
                <p><span className="text-ember">npm</span> run tauri build</p>
                <p className="mt-1 text-faint">→ genera dist/…msi · .exe · .dmg · .AppImage</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-line bg-panel/40">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="font-display text-3xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-line bg-panel px-5 py-4">
                <summary className="cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <Icon name="plus" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-45" />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
            Tu negocio ya sabe cómo funciona. <span className="text-ember">Díselo.</span>
          </h2>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/register" className="rounded-xl bg-ember px-6 py-3.5 text-sm font-semibold text-[#1a0b04] hover:bg-ember-soft">
              Crear mi cuenta gratis
            </Link>
            <Link href="/login" className="rounded-xl border border-line px-6 py-3.5 text-sm text-muted hover:bg-white/5">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-faint md:flex-row">
          <Logo size={22} />
          <p>© {new Date().getFullYear()} {BRAND.name} · {BRAND.mission}</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-ink">Clientes</Link>
            <Link href="/register" className="hover:text-ink">Empezar</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
