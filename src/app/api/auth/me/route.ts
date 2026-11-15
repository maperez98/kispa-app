import { eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, companyUsers } from "@/db/schema";
import { err, getSessionUser, json } from "@/lib/http";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return err("No autenticado", 401);
  const memberships = await db
    .select({
      companyId: companyUsers.companyId,
      role: companyUsers.role,
      companyName: companies.name,
      onboardingCompleted: companies.onboardingCompleted,
      sector: companies.sector,
    })
    .from(companyUsers)
    .innerJoin(companies, eq(companyUsers.companyId, companies.id))
    .where(eq(companyUsers.userId, user.id));
  return json({
    user: { id: user.id, name: user.name, email: user.email },
    companies: memberships,
  });
}
