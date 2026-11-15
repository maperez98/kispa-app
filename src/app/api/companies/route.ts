import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { companies, companyUsers, plans, subscriptions } from "@/db/schema";
import { audit, err, getContext, getSessionUser, json, parseBody } from "@/lib/http";
import { getOrCreateConfig } from "@/lib/config/engine";

const CreateSchema = z.object({
  name: z.string().min(2).max(200),
  sector: z.string().max(100).optional(),
  businessType: z.string().max(300).optional(),
  nit: z.string().max(30).optional(),
  country: z.string().length(2).default("CO"),
});

// Crea la empresa del empresario, su membresía como owner, la suscripción
// inicial (plan free) y su workspace de configuración vacío.
export async function POST(req: Request) {
  // La creación de empresa no exige membresía previa (es la primera empresa del usuario).
  const user = await getSessionUser();
  if (!user) return err("No autenticado", 401);
  const ctx = { user, company: null as never, role: "owner" };
  const body = await parseBody(req);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return err(`Datos inválidos: ${parsed.error.issues[0]?.message}`, 422);

  const [c] = await db
    .insert(companies)
    .values({
      name: parsed.data.name,
      sector: parsed.data.sector ?? null,
      businessType: parsed.data.businessType ?? null,
      nit: parsed.data.nit ?? null,
      country: parsed.data.country,
      settings: { createdVia: "onboarding" },
    })
    .returning();

  await db.insert(companyUsers).values({ companyId: c.id, userId: ctx.user.id, role: "owner" });
  const free = await db.select().from(plans).where(eq(plans.id, "free")).limit(1);
  if (free[0]) {
    await db.insert(subscriptions).values({ companyId: c.id, planId: "free", status: "active" });
  }
  await getOrCreateConfig(c.id);
  await audit({ user, company: c, role: "owner" }, "company.created", "company", c.id, { name: c.name });
  return json({ company: c }, { status: 201 });
}

// Devuelve la empresa activa (por header x-company-id) con el rol del usuario.
export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  return json({ company: ctx.company, role: ctx.role });
}
