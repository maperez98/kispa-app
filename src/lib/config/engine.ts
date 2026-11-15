// Motor de configuración con acceso a datos: aplica parches validados al
// workspace de una empresa (módulos, campos, categorías, dashboard,
// automatizaciones), con protección anti-duplicados y auditoría.
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRules,
  companies,
  expenseCategories,
  pendingChanges,
  productCategories,
  workspaceConfigs,
} from "@/db/schema";
import {
  ConfigPatchSchema,
  describePatch,
  hashPatch,
  mergeModules,
  type ConfigPatch,
} from "./patch";
import { audit, type Ctx } from "../http";

export async function getOrCreateConfig(companyId: string) {
  const rows = await db
    .select()
    .from(workspaceConfigs)
    .where(eq(workspaceConfigs.companyId, companyId))
    .limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db
    .insert(workspaceConfigs)
    .values({ companyId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const again = await db
    .select()
    .from(workspaceConfigs)
    .where(eq(workspaceConfigs.companyId, companyId))
    .limit(1);
  return again[0];
}

export async function isDuplicateProposal(companyId: string, patch: ConfigPatch): Promise<boolean> {
  const hash = hashPatch(patch);
  const config = await getOrCreateConfig(companyId);
  if ((config.appliedHashes ?? []).includes(hash)) return true;
  const pending = await db
    .select({ id: pendingChanges.id })
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.companyId, companyId),
        eq(pendingChanges.patchHash, hash),
        eq(pendingChanges.status, "pending"),
      ),
    )
    .limit(1);
  return pending.length > 0;
}

export async function createPendingChange(
  ctx: Ctx,
  patch: ConfigPatch,
  description: string,
  conversationId: string | null,
  onboarding: boolean,
) {
  const patchHash = hashPatch(patch);
  const dup = await db
    .select()
    .from(pendingChanges)
    .where(
      and(
        eq(pendingChanges.companyId, ctx.company.id),
        eq(pendingChanges.patchHash, patchHash),
        eq(pendingChanges.status, "pending"),
      ),
    )
    .limit(1);
  if (dup[0]) return { id: dup[0].id, duplicate: true as const };
  const [row] = await db
    .insert(pendingChanges)
    .values({
      companyId: ctx.company.id,
      conversationId,
      description,
      patch: patch as unknown as Record<string, unknown>,
      patchHash,
      createdBy: ctx.user.id,
      onboarding,
    })
    .returning();
  return { id: row.id, duplicate: false as const };
}

export async function applyPatch(
  ctx: Ctx,
  patch: ConfigPatch,
  opts?: { onboarding?: boolean; pendingId?: string },
): Promise<{ applied: string[]; config: typeof workspaceConfigs.$inferSelect }> {
  const config = await getOrCreateConfig(ctx.company.id);
  const applied: string[] = [];

  await db.transaction(async (tx) => {
    let modules = config.modules as Array<Record<string, unknown>>;
    if (patch.modules?.length) {
      modules = mergeModules(modules, patch.modules);
      for (const m of patch.modules)
        applied.push(`Módulo «${m.label ?? m.key}»: ${m.enabled ? "activado" : "desactivado"}`);
    }

    let entities = { ...(config.entities as Record<string, unknown>) };
    if (patch.productFields?.length) {
      const prod = (entities.products as Record<string, unknown> | undefined) ?? { extraFields: [] };
      const fields = [...((prod.extraFields as Array<Record<string, unknown>>) ?? [])];
      for (const f of patch.productFields) {
        if (!fields.some((x) => x.name === f.name)) {
          fields.push(f);
          applied.push(`Campo «${f.label}» agregado a productos`);
        }
      }
      entities = { ...entities, products: { ...prod, extraFields: fields } };
    }

    const dashboard = patch.dashboard ?? (config.dashboard as Record<string, unknown>);
    if (patch.dashboard) applied.push(`Panel configurado con ${patch.dashboard.widgets.length} secciones`);

    const profile = { ...(config.businessProfile as Record<string, unknown>), ...(patch.profile ?? {}) };
    const hashes = [...(config.appliedHashes ?? []), hashPatch(patch)];

    await tx
      .update(workspaceConfigs)
      .set({ modules, entities, dashboard, businessProfile: profile, appliedHashes: hashes, updatedAt: new Date() })
      .where(eq(workspaceConfigs.id, config.id));

    if (patch.categories?.products?.length) {
      for (const c of patch.categories.products)
        await tx
          .insert(productCategories)
          .values({ companyId: ctx.company.id, name: c.name })
          .onConflictDoNothing();
      applied.push(`Categorías de productos creadas: ${patch.categories.products.map((c) => c.name).join(", ")}`);
    }
    if (patch.categories?.expenses?.length) {
      for (const c of patch.categories.expenses)
        await tx
          .insert(expenseCategories)
          .values({ companyId: ctx.company.id, name: c.name })
          .onConflictDoNothing();
      applied.push(`Categorías de gastos creadas: ${patch.categories.expenses.map((c) => c.name).join(", ")}`);
    }
    if (patch.automations?.length) {
      for (const a of patch.automations) {
        const exists = await tx
          .select({ id: automationRules.id })
          .from(automationRules)
          .where(and(eq(automationRules.companyId, ctx.company.id), eq(automationRules.name, a.name)))
          .limit(1);
        if (!exists[0]) {
          await tx.insert(automationRules).values({
            companyId: ctx.company.id,
            name: a.name,
            description: a.description ?? null,
            trigger: a.trigger,
            conditions: a.conditions,
            actions: a.actions,
            enabled: a.enabled,
            createdBy: ctx.user.id,
          });
          applied.push(`Automatización «${a.name}» creada (${a.trigger})`);
        }
      }
    }
  });

  if (opts?.onboarding) {
    await db
      .update(companies)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(companies.id, ctx.company.id));
  }

  await audit(ctx, "config.applied", "workspace_config", config.id, {
    applied,
    pendingId: opts?.pendingId ?? null,
  });
  return { applied, config: await getOrCreateConfig(ctx.company.id) };
}

export async function resolvePendingChange(
  ctx: Ctx,
  id: string,
  action: "approve" | "reject",
) {
  const rows = await db
    .select()
    .from(pendingChanges)
    .where(and(eq(pendingChanges.id, id), eq(pendingChanges.companyId, ctx.company.id)))
    .limit(1);
  const p = rows[0];
  if (!p) return { error: "Propuesta no encontrada" } as const;
  if (p.status !== "pending") return { status: p.status } as const;

  if (action === "reject") {
    await db
      .update(pendingChanges)
      .set({ status: "rejected", resolvedAt: new Date() })
      .where(eq(pendingChanges.id, id));
    await audit(ctx, "config.rejected", "pending_change", id, { description: p.description });
    return { status: "rejected" } as const;
  }

  const parsed = ConfigPatchSchema.safeParse(p.patch);
  if (!parsed.success) return { error: "El parche almacenado no es válido" } as const;
  const result = await applyPatch(ctx, parsed.data, { onboarding: p.onboarding, pendingId: p.id });
  await db
    .update(pendingChanges)
    .set({ status: "approved", resolvedAt: new Date() })
    .where(eq(pendingChanges.id, id));
  return { status: "approved", ...result } as const;
}
