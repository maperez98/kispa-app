// Orquestación del asistente conversacional: historial, contexto real del
// negocio, proveedor de IA intercambiable, persistencia y propuestas con
// vista previa + aprobación (pending_changes).
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { chatMessages, conversations, workspaceConfigs } from "@/db/schema";
import { getProvider } from "./providers";
import {
  AssistantOutputSchema,
  ConfigPatchSchema,
  describePatch,
  type AssistantOutput,
} from "../config/patch";
import { createPendingChange, getOrCreateConfig, isDuplicateProposal } from "../config/engine";
import { getBusinessSnapshot } from "../reports";
import type { Ctx } from "../http";

export function buildSystemPrompt(a: {
  companyName: string;
  onboarding: boolean;
  profile: Record<string, unknown>;
  modules: Array<Record<string, unknown>>;
  snapshot: Record<string, unknown>;
}): string {
  return `Eres el asistente empresarial de Kispa, la plataforma que construye sistemas de administración para microempresas conversando con el empresario.
Empresa: ${a.companyName}. Modo onboarding (configuración inicial): ${a.onboarding ? "sí" : "no"}.

DEBES responder ÚNICAMENTE con un objeto JSON válido con esta forma exacta:
{
  "reply": "respuesta en español, natural, humana y profesional. Usa \\n para saltos de línea.",
  "intent": "question | configure | automation | add_field | add_category | module | report | chat",
  "question": "pregunta de seguimiento opcional",
  "proposal": null,
  "proposalDescription": "descripción humana de la propuesta"
}
Cuando propongas cambios de configuración, "proposal" debe ser un ConfigPatch con alguna de estas claves:
- profile: { businessType?, sector?, sells?[], teamSize?, currentTools?[], problems?[], goals?[] }
- modules: [{ key: "clients|products|sales|orders|expenses|receivables|employees|reports|automations", enabled: bool, label? }]
- categories: { products?: [{name}], expenses?: [{name}] }
- productFields: [{ name, label, type: "text|number|date" }]
- dashboard: { widgets: [{ type: "stat|chart|table|alerts", metric: string, title?, size: "half|full" }] }
- automations: [{ name, trigger, description?, conditions: [{field, op: "lt|lte|gt|gte|eq|neq|contains", value}], actions: [{type: "create_alert|create_reminder|update_order_status|log", params}], enabled }]

REGLAS ESTRICTAS:
1. No propongas módulos, campos, categorías o automatizaciones que ya existan (revisa los módulos activos del contexto).
2. Toda propuesta se muestra en vista previa y SOLO se aplica con aprobación explícita del empresario. Nunca confirmes que algo "ya quedó aplicado".
3. Para preguntas sobre cifras, ventas, gastos, inventario o clientes, usa ÚNICAMENTE los datos reales del CONTEXTO_JSON. Nunca inventes números.
4. Haz preguntas cuando falte información clave: tipo de negocio, qué vende, cuántas personas trabajan, herramientas actuales, problemas y qué quiere automatizar.
5. No propongas eliminar datos, mover dinero ni cambiar permisos. Esas operaciones requieren autorización explícita fuera del chat.
6. Sé breve y claro. No uses emojis.

DATOS REALES DEL NEGOCIO (solo para responder consultas, nunca los modifiques):
CONTEXTO_JSON:
${JSON.stringify({
  profile: a.profile,
  modules: a.modules,
  onboarding: a.onboarding,
  snapshot: a.snapshot,
})}`;
}

export async function runAssistantTurn(
  ctx: Ctx,
  conversationId: string | null,
  message: string,
): Promise<{
  conversationId: string;
  message: typeof chatMessages.$inferSelect;
  provider: string;
  pendingChangeId: string | null;
}> {
  const config = await getOrCreateConfig(ctx.company.id);

  let convId = conversationId;
  if (!convId) {
    const [c] = await db
      .insert(conversations)
      .values({ companyId: ctx.company.id, userId: ctx.user.id, title: message.slice(0, 60) || "Nueva conversación" })
      .returning();
    convId = c.id;
  } else {
    const ok = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.id, convId), eq(conversations.companyId, ctx.company.id)))
      .limit(1);
    if (!ok[0]) throw new Error("Conversación no encontrada");
  }

  await db.insert(chatMessages).values({ conversationId: convId, role: "user", content: message });

  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(30);
  history.reverse();

  const snapshot = await getBusinessSnapshot(ctx.company.id);
  const provider = getProvider();
  const sys = buildSystemPrompt({
    companyName: ctx.company.name,
    onboarding: !ctx.company.onboardingCompleted,
    profile: config.businessProfile as Record<string, unknown>,
    modules: config.modules,
    snapshot: snapshot as Record<string, unknown>,
  });
  const msgs = [
    { role: "system" as const, content: sys },
    ...history
      .filter((h) => h.role !== "system")
      .map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
  ];

  let structured: AssistantOutput;
  try {
    structured = await provider.chat(msgs);
  } catch (err) {
    const { LocalProvider } = await import("./providers");
    structured = await new LocalProvider().chat(msgs);
    structured = {
      ...structured,
      reply: `${structured.reply}\n\n(Nota técnica: ${err instanceof Error ? err.message : String(err)} — se usó el motor local.)`,
    };
  }


  const parsed = AssistantOutputSchema.safeParse(structured);
  const out: AssistantOutput = parsed.success
    ? parsed.data
    : { reply: String((structured as { reply?: string })?.reply ?? "No pude procesar la respuesta."), intent: "chat" };

  // Aprendizaje incremental del perfil (memoria de la conversación).
  if (out.proposal?.profile) {
    await db
      .update(workspaceConfigs)
      .set({
        businessProfile: { ...(config.businessProfile as Record<string, unknown>), ...out.proposal.profile },
        updatedAt: new Date(),
      })
      .where(eq(workspaceConfigs.id, config.id));
  }

  let pendingChangeId: string | null = null;
  if (out.proposal) {
    const valid = ConfigPatchSchema.safeParse(out.proposal);
    if (valid.success) {
      const dup = await isDuplicateProposal(ctx.company.id, valid.data);
      if (!dup) {
        const pc = await createPendingChange(
          ctx,
          valid.data,
          out.proposalDescription ?? describePatch(valid.data).join("; "),
          convId,
          !ctx.company.onboardingCompleted,
        );
        pendingChangeId = pc.id;
      }
    }
  }

  const [saved] = await db
    .insert(chatMessages)
    .values({
      conversationId: convId,
      role: "assistant",
      content: out.reply,
      structured: out as unknown as Record<string, unknown>,
      pendingChangeId,
    })
    .returning();

  return { conversationId: convId, message: saved, provider: provider.id, pendingChangeId };
}
