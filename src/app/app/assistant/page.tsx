"use client";

import { useCallback, useEffect, useState } from "react";
import { Chat } from "@/components/chat";
import { Button, Card, Spinner, cls } from "@/components/ui";
import { Icon } from "@/components/icons";
import { api } from "@/lib/client/api";
import { useApp } from "@/components/app-shell";

interface Conv {
  id: string;
  title: string;
  createdAt: string;
  lastMessage: string | null;
}

export default function AssistantPage() {
  const { refreshConfig } = useApp();
  const [convs, setConvs] = useState<Conv[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api<{ conversations: Conv[] }>("/api/assistant/conversations");
      setConvs(d.conversations);
      if (!active && d.conversations.length) setActive(d.conversations[0].id);
    } finally {
      setLoading(false);
    }
  }, [active]);

  useEffect(() => {
    void load();
  }, [load]);

  async function newConv() {
    const d = await api<{ conversation: Conv }>("/api/assistant/conversations", { method: "POST", body: "{}" });
    setConvs((c) => [d.conversation, ...c]);
    setActive(d.conversation.id);
  }

  return (
    <div className="grid h-[calc(100vh-7.5rem)] grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="flex min-h-0 flex-col p-3">
        <Button onClick={() => void newConv()} className="mb-3 w-full justify-center" size="sm">
          <Icon name="plus" className="h-4 w-4" /> Nueva conversación
        </Button>
        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
          {loading && <Spinner />}
          {convs.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={cls(
                "w-full rounded-lg px-3 py-2 text-left transition-colors",
                active === c.id ? "bg-white/5" : "hover:bg-white/5",
              )}
            >
              <span className="block truncate text-sm font-medium">{c.title}</span>
              <span className="block truncate text-xs text-faint">{c.lastMessage ?? "Sin mensajes"}</span>
            </button>
          ))}
          {!loading && convs.length === 0 && <p className="px-2 py-4 text-xs text-muted">Empieza una conversación nueva.</p>}
        </div>
      </Card>
      <Card className="flex min-h-0 flex-col p-4">
        {active ? (
          <Chat key={active} conversationId={active} onResolved={() => void refreshConfig()} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-2xl bg-ember/10 p-4 text-ember">
              <Icon name="sparkles" className="h-8 w-8" />
            </div>
            <p className="max-w-sm text-sm text-muted">
              Pídele al asistente lo que necesites: «agrégame un campo de proveedor», «avísame cuando queden menos
              de 5 unidades», «¿cuánto vendí este mes?», «activa el módulo de pedidos»…
            </p>
            <Button onClick={() => void newConv()}>Nueva conversación</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
