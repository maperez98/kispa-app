import {
  AssistantOutputSchema,
  proposeFromProfile,
  type AssistantOutput,
} from "../config/patch";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIProvider {
  id: string;
  chat(messages: ChatMessage[]): Promise<AssistantOutput>;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("La respuesta no contiene JSON");
  }
  return JSON.parse(text.slice(start, end + 1));
}

export function parseStructured(text: string): AssistantOutput {
  const raw = extractJson(text) as Record<string, unknown>;
  if (typeof raw.reply !== "string" || !raw.reply.trim()) {
    raw.reply = "Aquí tienes la propuesta de configuración para tu negocio.";
  }

  const parsed = AssistantOutputSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  // Si la IA envió una propuesta pero algún campo secundario (widgets/automatizaciones)
  // no coincidió con el esquema estricto, completamos la base válida conservando
  // el perfil y las categorías reales que generó la IA.
  if (raw.proposal && typeof raw.proposal === "object") {
    const p = raw.proposal as Record<string, unknown>;
    const profile = (p.profile && typeof p.profile === "object" ? p.profile : {}) as Record<string, unknown>;
    const fallbackPatch = proposeFromProfile({
      businessType: typeof profile.businessType === "string" ? profile.businessType : undefined,
      sector: typeof profile.sector === "string" ? profile.sector : "services",
      sells: Array.isArray(profile.sells) ? (profile.sells as string[]) : undefined,
      teamSize: typeof profile.teamSize === "number" ? profile.teamSize : undefined,
    });

    const mergedProposal = {
      ...fallbackPatch,
      ...p,
      dashboard: fallbackPatch.dashboard,
      automations: fallbackPatch.automations,
    };

    const retry = AssistantOutputSchema.safeParse({
      reply: String(raw.reply),
      intent: "configure",
      proposalDescription:
        typeof raw.proposalDescription === "string" && raw.proposalDescription.trim()
          ? raw.proposalDescription
          : `Configuración para ${typeof profile.businessType === "string" ? profile.businessType : "tu negocio"}`,
      proposal: mergedProposal,
    });

    if (retry.success) {
      return retry.data;
    }
  }

  return {
    reply: String(raw.reply),
    intent: typeof raw.intent === "string" ? raw.intent : "chat",
  };
}

class OpenAIProvider implements AIProvider {
  id = `openai/${process.env.OPENAI_MODEL?.trim() || "openai/gpt-oss-20b"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const base = "https://groq.com";
    const recentMessages = [
      messages[0],
      ...messages.slice(1).slice(-6),
    ].filter(Boolean);

    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${(process.env.OPENAI_API_KEY ?? "").trim()}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content:
              'Responde ÚNICAMENTE con un objeto JSON válido con esta estructura: {"reply": "explicación en español", "intent": "configure", "proposalDescription": "Configuración para el negocio", "proposal": {"profile": {"businessType": "Consultorio odontológico Nazadent", "sector": "services", "teamSize": 6, "sells": ["Valoración", "Limpieza dental", "Resinas", "Endodoncia", "Ortodoncia", "Extracciones"]}, "modules": [{"key": "clients", "enabled": true}, {"key": "products", "enabled": true}, {"key": "sales", "enabled": true}, {"key": "orders", "enabled": true}, {"key": "expenses", "enabled": true}, {"key": "receivables", "enabled": true}, {"key": "employees", "enabled": true}, {"key": "reports", "enabled": true}, {"key": "automations", "enabled": true}], "categories": {"products": [{"name": "Tratamientos dentales"}, {"name": "Insumos odontológicos"}], "expenses": [{"name": "Insumos médicos"}, {"name": "Arriendo"}, {"name": "Servicios públicos"}, {"name": "Nómina"}, {"name": "Otros"}]}}}.',
          },
          ...recentMessages,
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return parseStructured(content);
  }
}

export class LocalProvider implements AIProvider {
  id = "motor-local (demostración, sin clave de IA configurada)";
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const { localRespond } = await import("./local");
    return localRespond(messages);
  }
}

export function getProvider(): AIProvider {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return new OpenAIProvider();
  }
  return new LocalProvider();
}
