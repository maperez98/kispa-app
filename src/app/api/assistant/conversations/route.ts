import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { chatMessages, conversations } from "@/db/schema";
import { err, getContext, json, parseBody } from "@/lib/http";

export async function GET(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const conv = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.companyId, ctx.company.id)))
      .limit(1);
    if (!conv[0]) return err("Conversación no encontrada", 404);
    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, id))
      .orderBy(chatMessages.createdAt);
    return json({ conversation: conv[0], messages });
  }
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      createdAt: conversations.createdAt,
      lastMessage: sql<string>`(select content from chat_messages cm where cm.conversation_id = ${conversations.id} order by cm.created_at desc limit 1)`,
    })
    .from(conversations)
    .where(eq(conversations.companyId, ctx.company.id))
    .orderBy(desc(conversations.createdAt))
    .limit(50);
  return json({ conversations: rows });
}

const CreateSchema = z.object({ title: z.string().max(120).optional() });

export async function POST(req: Request) {
  const ctx = await getContext(req);
  if (!ctx) return err("No autenticado", 401);
  const body = await parseBody(req);
  const parsed = CreateSchema.safeParse(body ?? {});
  const [c] = await db
    .insert(conversations)
    .values({
      companyId: ctx.company.id,
      userId: ctx.user.id,
      title: parsed.success && parsed.data.title ? parsed.data.title : "Nueva conversación",
    })
    .returning();
  return json({ conversation: c }, { status: 201 });
}
