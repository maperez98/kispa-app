"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

// Botón de instalación PWA: usa el evento beforeinstallprompt cuando el
// navegador lo soporta; si no, muestra instrucciones de instalación manual.
export function InstallButton() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (installed) {
    return (
      <span className="inline-flex items-center gap-2 rounded-xl border border-good/30 bg-good/10 px-5 py-3 text-sm font-medium text-good">
        <Icon name="check" className="h-4 w-4" /> Aplicación instalada
      </span>
    );
  }

  if (prompt) {
    return (
      <button
        onClick={() => {
          void prompt.prompt();
          void prompt.userChoice.then((c: any) => {
            if (c.outcome === "accepted") setInstalled(true);
            setPrompt(null);
          });
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-white/5"
      >
        <Icon name="download" className="h-4 w-4 text-ember" /> Instalar aplicación
      </button>
    );
  }

  return (
    <a
      href="#descarga"
      onClick={(e) => {
        e.preventDefault();
        document.querySelector("#faq")?.scrollIntoView({ behavior: "smooth" });
      }}
      className="inline-flex items-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-medium text-ink transition-colors hover:bg-white/5"
    >
      <Icon name="download" className="h-4 w-4 text-ember" /> Descargar la aplicación
    </a>
  );
}
