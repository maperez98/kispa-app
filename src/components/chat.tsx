"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Button, Card, Input, RichText, Spinner, cls } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";
import { describePatchClient } from "@/lib/client/patch-preview";
import type { ConfigPatch } from "@/lib/config/patch";

interface Msg {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  pendingChangeId: string | null;
  structured: { proposal?: ConfigPatch; proposalDescription?: string } | null;
}

interface PendingItem {
  id: string;
  description: string;
  status: string;
  onboarding: boolean;
  patch: ConfigPatch;
  items: string[];
  createdAt: string;
}

export function Chat({
  conversationId: initialId,
  embedded = false,
  onResolved,
}: {
  conversationId?: string | null;
  embedded?: boolean;
  onResolved?: () => void;
}) {
  const router = useRouter();
  const [convId, setConvId] = useState<string | null>(initialId ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [provider, setProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadPending = useCallback(async () => {
    try {
      const d = await api<{ pending: PendingItem[] }>("/api/config/pending");
      setPending(d.pending);
    } catch {
      /* opcional */
    }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    const d = await api<{ messages: Msg[] }>(`/api/assistant/conversations?id=${id}`);
    setMessages(d.messages);
  }, []);

  useEffect(() => {
    void loadPending();
    if (initialId) void loadMessages(initialId);
  }, [initialId, loadMessages, loadPending]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    setSending(true);
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString(), pendingChangeId: null, structured: null }]);
    try {
      const res = await api<{ conversationId: string; message: Msg; provider: string; pendingChangeId: string | null }>(
        "/api/assistant/chat",
        { method: "POST", body: JSON.stringify({ conversationId: convId, message: text }) },
      );
      setConvId(res.conversationId);
      setProvider(res.provider);
      setMessages((m) => [...m.filter((x) => !x.id.startsWith("tmp-")), { id: `u-${Date.now()}`, role: "user", content: text, createdAt: new Date().toISOString(), pendingChangeId: null, structured: null }, res.message]);
      await loadPending();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar el mensaje");
      setMessages((m) => m.filter((x) => !x.id.startsWith("tmp-")));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function resolve(id: string, action: "approve" | "reject") {
    setResolving(id);
    try {
      const res = await api<{ status: string; onboarding?: never } & Record<string, unknown>>("/api/config/pending", {
        method: "POST",
        body: JSON.stringify({ id, action }),
      });
      await loadPending();
      onResolved?.();
      if (res.status === "approved") {
        // Si era la propuesta de onboarding, el sistema ya quedó listo.
        const wasOnboarding = pending.find((p) => p.id === id)?.onboarding;
        if (wasOnboarding) router.push("/app");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo aplicar la decisión");
    } finally {
      setResolving(null);
    }
  }

  const pendingById = new Map(pending.map((p) => [p.id, p]));

  return (
    <div className={cls("flex min-h-0 flex-1 flex-col", embedded ? "" : "")}>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-6 text-sm text-muted">
            Cuéntame sobre tu negocio: qué vendes, cómo trabajas y qué quieres automatizar. Yo preparo la
            configuración de tu sistema y tú la apruebas antes de aplicarla.
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === "user";
          const p = m.pendingChangeId ? pendingById.get(m.pendingChangeId) : undefined;
          return (
            <div key={m.id} className={cls("flex", isUser ? "justify-end" : "justify-start")}>
              <div className={cls("max-w-[85%]", isUser ? "" : "")}>
                <div
                  className={cls(
                    "rounded-2xl px-4 py-3",
                    isUser
                      ? "rounded-br-md bg-ember text-[#1a0b04]"
                      : "rounded-bl-md border border-line bg-panel-2 text-ink",
                  )}
                >
                  <RichText text={m.content} />
                </div>
                {!isUser && p && p.status === "pending" && (
                  <Card className="mt-2 border-ember/30 bg-panel-2/80 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Icon name="zap" className="h-4 w-4 text-ember" />
                      <p className="text-sm font-semibold">Propuesta de configuración</p>
                    </div>
                    <p className="mb-2 text-xs text-muted">{p.description}</p>
                    <ul className="mb-3 space-y-1">
                      {(p.items.length ? p.items : describePatchClient(p.patch)).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-muted">
                          <Icon name="check" className="mt-0.5 h-3 w-3 shrink-0 text-ember" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mb-3 text-[11px] text-faint">
                      Nada se aplica hasta que lo apruebes. Puedes modificarla conversando conmigo.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void resolve(p.id, "approve")} disabled={resolving === p.id}>
                        {resolving === p.id ? <Spinner /> : <Icon name="check" className="h-3.5 w-3.5" />} Aprobar y aplicar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => void resolve(p.id, "reject")} disabled={resolving === p.id}>
                        Rechazar
                      </Button>
                    </div>
                  </Card>
                )}
                {!isUser && p && p.status !== "pending" && (
                  <p className="mt-1 text-[11px] text-faint">
                    Propuesta {p.status === "approved" ? "aprobada y aplicada" : "rechazada"}.
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-line bg-panel-2 px-4 py-3">
              <span className="typing-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-muted" />
              <span className="typing-dot inline-block h-1.5 w-1.5 rounded-full bg-muted" />
            </div>
          </div>
        )}
        {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t border-line pt-3">
        {provider && (
          <p className="mb-2 text-[11px] text-faint">
            Motor de IA: <span className="text-muted">{provider}</span>
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Escríbele a tu asistente… (ej: avísame cuando queden menos de 5 unidades)"
            disabled={sending}
          />
          <Button onClick={() => void send()} disabled={sending || !input.trim()} size="md" className="shrink-0">
            <Icon name="arrowRight" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
