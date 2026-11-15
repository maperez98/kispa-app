// Dashboard dinámico: lee los widgets configurados en el workspace de la
// empresa y los llena con datos reales consultados en la base de datos.
import { err, getContext, json } from "@/lib/http";
import { getOrCreateConfig } from "@/lib/config/engine";
import { computeWidgetData } from "@/lib/reports";
import { proposeFromProfile } from "@/lib/config/patch";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const config = await getOrCreateConfig(ctx.company.id);
  let widgets = (config.dashboard as { widgets?: Array<Record<string, unknown>> })?.widgets ?? [];
  if (!widgets.length) {
    // Si aún no hay panel configurado, se deriva uno desde el perfil del negocio.
    const profile = (config.businessProfile ?? {}) as Record<string, unknown>;
    widgets = (proposeFromProfile(profile as never).dashboard?.widgets ?? []) as Array<Record<string, unknown>>;
  }
  const withData = await Promise.all(
    widgets.map(async (w) => ({
      ...w,
      data: await computeWidgetData(String(w.metric), ctx.company.id),
    })),
  );
  return json({ widgets: withData, profile: config.businessProfile, modules: config.modules });
}
