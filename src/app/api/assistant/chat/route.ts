import { z } from "zod";
import { err, getContext, json, parseBody } from "@/lib/http";
import { runAssistantTurn } from "@/lib/ai/assistant";

const Schema = z.object({
  conversationId: z.string().uuid().nullish(),
  message: z.string().min(1).max(4000),
});

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const body = await parseBody(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return err("Mensaje inválido", 422);
  try {
    const result = await runAssistantTurn(ctx, parsed.data.conversationId ?? null, parsed.data.message);
    return json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    return err(msg, 500);
  }
}
