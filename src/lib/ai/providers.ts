import { AssistantOutputSchema, type AssistantOutput } from "../config/patch";

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
  if (!parsed.success) {
    return {
      reply: String(raw.reply),
      intent: typeof raw.intent === "string" ? raw.intent : "chat",
    };
  }
  return parsed.data;
}

class OpenAIProvider implements AIProvider {
  id = `openai/${process.env.OPENAI_MODEL ?? "gpt-4o-mini"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const base = process.env.OPENAI_BASE_URL ?? "https://openai.com";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'Responde ÚNICAMENTE con un objeto JSON válido con esta estructura exacta: {"reply": "tu respuesta en español", "intent": "configure" o "chat", "proposalDescription": "resumen corto", "proposal": {"profile": {"businessType": "...", "sector": "services", "sells": ["..."]}, "modules": [{"key": "clients", "enabled": true}], "categories": {"products": [{"name": "..."}], "expenses": [{"name": "..."}]}}}. Las claves válidas de modules son solo: clients, products, sales, orders, expenses, receivables, employees, reports, automations.',
          },
          ...messages,
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

class AnthropicProvider implements AIProvider {
  id = `anthropic/${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("https://anthropic.com", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5",
        max_tokens: 2048,
        system: `${system}\n\nResponde ÚNICAMENTE con un objeto JSON (sin texto adicional).`,
        messages: rest,
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = (data.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    return parseStructured(text);
  }
}

class GoogleProvider implements AIProvider {
  id = `google/${process.env.GOOGLE_MODEL ?? "gemini-2.5-flash"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const model = process.env.GOOGLE_MODEL ?? "gemini-2.5-flash";
    const key = process.env.GOOGLE_API_KEY ?? "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const res = await fetch(
      `https://googleapis.com{model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: `${system}\n\nResponde ÚNICAMENTE con un objeto JSON.` }] },
          contents,
          generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
        }),
      },
    );
    if (!res.ok) throw new Error(`Google ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return parseStructured(text);
  }
}

class OllamaProvider implements AIProvider {
  id = `ollama/${process.env.OLLAMA_MODEL ?? "llama3.2"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const base = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? "llama3.2",
        messages,
        format: "json",
        options: { temperature: 0.3 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return parseStructured(data?.message?.content ?? "");
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
  switch ((process.env.AI_PROVIDER ?? "local").toLowerCase()) {
    case "openai":
      if (process.env.OPENAI_API_KEY) return new OpenAIProvider();
      break;
    case "anthropic":
      if (process.env.ANTHROPIC_API_KEY) return new AnthropicProvider();
      break;
    case "google":
      if (process.env.GOOGLE_API_KEY) return new GoogleProvider();
      break;
    case "ollama":
      return new OllamaProvider();
  }
  return new LocalProvider();
}
