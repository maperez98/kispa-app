// Motor local determinista del asistente (sin llamadas externas).
// Entiende intenciones en español, consulta el snapshot real del negocio
// inyectado en el system prompt y propone parches de configuración
// estructurados (mismo esquema que los modelos reales).
import {
  detectSector,
  proposeFromProfile,
  SECTOR_INFO,
  type AssistantOutput,
  type BusinessProfile,
} from "../config/patch";
import { formatCOP } from "../brand";
import type { ChatMessage } from "./providers";

interface LocalCtx {
  profile?: BusinessProfile;
  modules?: Array<{ key: string; enabled?: boolean }>;
  snapshot?: Record<string, any>;
  onboarding?: boolean;
}

function parseCtx(messages: ChatMessage[]): LocalCtx {
  const sys = messages.find((m) => m.role === "system")?.content ?? "";
  const marker = "CONTEXTO_JSON:";
  const idx = sys.indexOf(marker);
  if (idx === -1) return {};
  try {
    return JSON.parse(sys.slice(idx + marker.length).trim());
  } catch {
    return {};
  }
}

function extractSells(text: string): string[] {
  const m = text.match(/(?:vendo|vendemos|vendo productos de|productos como)\s+([^.!?]{3,120})/i);
  if (!m) return [];
  return m[1]
    .split(/,| y | e /i)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 40)
    .slice(0, 8);
}

export function localRespond(messages: ChatMessage[]): AssistantOutput {
  const ctx = parseCtx(messages);
  const profile = (ctx.profile ?? {}) as BusinessProfile;
  const snap = ctx.snapshot ?? {};
  const modulesActive = (ctx.modules ?? []).filter((m) => m.enabled !== false).length;
  const last = (messages.filter((m) => m.role === "user").pop()?.content ?? "").trim();
  const t = last.toLowerCase();

  // 0) En onboarding, una descripción del negocio dispara la configuración completa primero
  const sectorNow = detectSector(last) ?? profile.sector;
  if (sectorNow && modulesActive === 0) {
    const newProfile: BusinessProfile = {
      ...profile,
      businessType: profile.businessType ?? last.slice(0, 200),
      sector: sectorNow,
      sells: profile.sells?.length ? profile.sells : extractSells(last),
    };
    const patch = proposeFromProfile(newProfile);
    return {
      intent: "configure",
      proposal: patch,
      proposalDescription: `Configuración inicial para: ${SECTOR_INFO[sectorNow].label}`,
      reply: `Entiendo: tienes una ${SECTOR_INFO[sectorNow].label.toLowerCase()}. Ya preparé una propuesta completa para tu espacio de trabajo: módulos, categorías, panel con tus indicadores y automatizaciones iniciales (incluida la alerta de stock bajo). Revísala en la tarjeta de abajo; nada se aplica hasta que la apruebes.`,
    };
  }

  // 1) Consultas sobre datos reales del negocio
  if (
    /(cu[aá]nto|vend[ií]|gan[eé]|factur|ingresos|ventas del mes|informe|reporte|resumen|ganancia|utilidad|estado (actual )?de mi negocio)/.test(
      t,
    )
  ) {
    const lines = [
      "Con gusto. Estos son los datos **reales** de tu negocio, consultados ahora en tu base de datos:",
      `• Ingresos del mes: ${formatCOP(snap.revenueMonthCents)}`,
      `• Ingresos de hoy: ${formatCOP(snap.revenueTodayCents)}`,
      `• Gastos del mes: ${formatCOP(snap.expensesMonthCents)}`,
      `• Ganancia del mes: ${formatCOP(snap.profitMonthCents)}`,
      `• Ventas completadas este mes: ${snap.salesCountMonth ?? 0}`,
      `• Productos con poco stock: ${snap.lowStockCount ?? 0}`,
      `• Total por cobrar: ${formatCOP(snap.receivablesCents)}`,
      `• Clientes registrados: ${snap.clientsCount ?? 0}`,
    ];
    if (snap.topProducts?.length)
      lines.push(`• Lo que más se vende este mes: ${snap.topProducts.map((p: any) => `${p.name} (${formatCOP(p.revenue)})`).join(", ")}`);
    return { intent: "report", reply: lines.join("\n") };
  }
  if (/(m[aá]s vendid|top|popular|qu[eé] se vende|producto estrella)/.test(t)) {
    if (snap.topProducts?.length)
      return {
        intent: "report",
        reply: `Estos son tus productos más vendidos del mes (datos reales):\n${snap.topProducts
          .map((p: any, i: number) => `${i + 1}. ${p.name} — ${p.qty} unidades, ${formatCOP(p.revenue)}`)
          .join("\n")}`,
      };
    return { intent: "report", reply: "Todavía no hay ventas registradas este mes, así que aún no hay productos estrella. Registra tu primera venta en el módulo Ventas y vuelvo a consultar." };
  }

  // 2) Crear automatización de alerta por stock
  const numMatch = t.match(/(?:menos de|bajo de|queden?|hasta)\s*(\d+)\s*(?:unidades?|und|piezas?)?/);
  if (/(avisa|alerta|notifica|que me avise|av[ií]same)/.test(t) && (numMatch || /stock|inventario|agota|queden|existencias/.test(t))) {
    const n = numMatch ? Number(numMatch[1]) : 5;
    return {
      intent: "automation",
      proposalDescription: `Automatización: alerta cuando un producto tenga ${n} unidades o menos.`,
      proposal: {
        automations: [
          {
            name: `Alerta cuando queden ${n} unidades o menos`,
            trigger: "inventory.low",
            description: `Se genera una alerta en el panel cada vez que el stock de un producto baje a ${n} unidades o menos.`,
            conditions: [{ field: "stock", op: "lte", value: n }],
            actions: [
              {
                type: "create_alert",
                params: {
                  severity: "warning",
                  title: "Stock bajo: {name}",
                  message: "Quedan {stock} unidades de {name}. Es momento de reponer.",
                },
              },
            ],
            enabled: true,
          },
        ],
      },
      reply: `Perfecto. Te propongo crear la automatización «Alerta cuando queden ${n} unidades o menos»: cada vez que el inventario de un producto baje a ${n} o menos, se creará una alerta en tu panel. Revísala en la tarjeta de abajo y apruébala para activarla.`,
    };
  }

  // 3) Agregar un campo personalizado a productos
  if (/(agregar|añadir|nuevo) (un )?campo|campo (para|de|llamado)/.test(t)) {
    const m = t.match(/campo (?:para |de |llamado |llamada )?["'«]?([a-záéíóúñ0-9 ]{3,40})/);
    const label = m ? m[1].trim() : "Nuevo campo";
    const name =
      label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "campo_nuevo";
    const labelFmt = label.charAt(0).toUpperCase() + label.slice(1);
    return {
      intent: "add_field",
      proposalDescription: `Agregar el campo «${labelFmt}» a la ficha de productos.`,
      proposal: { productFields: [{ name, label: labelFmt, type: "text" }] },
      reply: `Listo. Te propongo agregar el campo «${labelFmt}» a la ficha de cada producto, para que guardes ahí lo que necesites (por ejemplo, el proveedor). Aprueba la propuesta para aplicarla.`,
    };
  }

  // 4) Crear una categoría
  if (/categor[ií]a/.test(t) && /(agregar|crear|nueva)/.test(t)) {
    const m = t.match(/categor[ií]a (?:de (?:productos|gastos) )?(?:llamada |llamado |[«"'])?([a-záéíóúñ0-9 ]{3,40})/);
    const name = m ? m[1].trim() : null;
    if (name) {
      const isExpense = /gasto/.test(t);
      return {
        intent: "add_category",
        proposalDescription: `Crear la categoría «${name}».`,
        proposal: isExpense
          ? { categories: { expenses: [{ name: name.charAt(0).toUpperCase() + name.slice(1) }] } }
          : { categories: { products: [{ name: name.charAt(0).toUpperCase() + name.slice(1) }] } },
        reply: `Perfecto, te propongo crear la categoría «${name.charAt(0).toUpperCase() + name.slice(1)}». Apruébala para crearla.`,
      };
    }
  }

  // 5) Activar módulos por intención
  if (/pagos pendientes|por cobrar|fiado|cr[eé]dito|deudas|qui[eé]n me debe|clientes que deben/.test(t))
    return {
      intent: "module",
      proposalDescription: "Activar los módulos Clientes y Cuentas por cobrar.",
      proposal: {
        modules: [
          { key: "clients", enabled: true },
          { key: "receivables", enabled: true },
        ],
        profile: { goals: [...(profile.goals ?? []), "controlar pagos pendientes de clientes"] },
      },
      reply: "Entiendo: quieres controlar quién te debe y los pagos pendientes. Te propongo activar los módulos **Clientes** y **Cuentas por cobrar**: podrás registrar deudas, anotar abonos y recibir alertas cuando una cuenta se venza. Aprueba la propuesta.",
    };
  if (/pedidos?|citas|agendar|orden(es)? de servicio|trabajos pendientes/.test(t))
    return {
      intent: "module",
      proposalDescription: "Activar el módulo Pedidos.",
      proposal: { modules: [{ key: "orders", enabled: true }] },
      reply: "De acuerdo. Te propongo activar el módulo **Pedidos** para registrar trabajos, citas y órdenes de servicio con estados (pendiente, en progreso, completado). Aprueba para activarlo.",
    };
  const teamMatch = t.match(/(\d+)\s*(?:personas|empleados|trabajamos)/);
  if (/empleados|personas trabajan|cu[aá]ntas personas|equipo|n[oó]mina/.test(t))
    return {
      intent: "module",
      proposalDescription: "Activar el módulo Equipo (empleados, roles y permisos).",
      proposal: {
        modules: [{ key: "employees", enabled: true }],
        profile: { teamSize: teamMatch ? Number(teamMatch[1]) : profile.teamSize },
      },
      reply: "Perfecto. Te propongo activar el módulo **Equipo** para invitar personas a tu sistema con roles y permisos (operador, administrador, solo lectura). Aprueba para activarlo.",
    };

  // 7) Preguntas guiadas de onboarding cuando falta información
  if (ctx.onboarding) {
    if (!profile.businessType)
      return {
        intent: "question",
        reply: "¡Hola! Soy tu asistente empresarial y voy a construir el sistema de administración de tu negocio. Para empezar, cuéntame: **¿qué tipo de negocio tienes y qué vendes o qué servicios ofreces?**",
      };
    if (!profile.teamSize)
      return {
        intent: "question",
        reply: "Perfecto. ¿Cuántas personas trabajan en el negocio, incluyéndote a ti?",
      };
    if (!profile.currentTools?.length)
      return {
        intent: "question",
        reply: "¿Cómo administras hoy tu negocio? Por ejemplo: cuaderno, Excel, WhatsApp, solo en la cabeza...",
      };
    if (!profile.goals?.length)
      return {
        intent: "question",
        reply: "¿Qué te gustaría automatizar o controlar primero? Por ejemplo: las ventas, el inventario, los gastos, los pagos pendientes de tus clientes...",
        proposal: proposeFromProfile({ ...profile, goals: ["automatizar la administración del negocio"] }),
        proposalDescription: "Configuración propuesta a partir de lo que me has contado",
      };
  }

  return {
    intent: "chat",
    reply:
      "Entendido. Puedo ayudarte a: configurar módulos de tu negocio, crear automatizaciones (por ejemplo «avísame cuando queden menos de 5 unidades»), agregar campos o categorías, o consultar los datos reales de tu negocio (ventas del mes, gastos, productos más vendidos, por cobrar). ¿Qué quieres hacer?",
  };
}
