// Capa de proveedores de IA desacoplada: una interfaz común (AIProvider) y
// implementaciones intercambiables por variable de entorno AI_PROVIDER.
// Ningún proveedor ejecuta código ni toca la base de datos: solo devuelve
// JSON validado con AssistantOutputSchema.
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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("La respuesta no contiene JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export function parseStructured(text: string): AssistantOutput {
  const parsed = AssistantOutputSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(`Salida del modelo no válida: ${parsed.error.issues[0]?.message ?? "schema"}`);
  }
  return parsed.data;
}

class OpenAIProvider implements AIProvider {
  id = `openai/${process.env.OPENAI_MODEL ?? "gpt-4o-mini"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages,
        response_format: { type: "json_object" },
        temperature: 0.3,
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return parseStructured(data.choices?.[0]?.message?.content ?? "");
  }
}

class AnthropicProvider implements AIProvider {
  id = `anthropic/${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));
    const res = await fetch("https://api.anthropic.com/v1/messages", {
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
  id = `google/${process.env.GOOGLE_MODEL ?? "gemini-2.0-flash"}`;
  async chat(messages: ChatMessage[]): Promise<AssistantOutput> {
    const model = process.env.GOOGLE_MODEL ?? "gemini-2.0-flash";
    const key = process.env.GOOGLE_API_KEY ?? "";
    const contents = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
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
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
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
    return parseStructured(data.message?.content ?? "");
  }
}

// Motor local determinista: funciona sin claves (modo demostración) y como
// fallback cuando el proveedor configurado falla. Devuelve el mismo esquema
// estructurado que los modelos reales.
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
