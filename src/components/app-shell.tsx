"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Badge, Button, Spinner, cls } from "@/components/ui";
import { ApiError, api, flushOutbox, onOnlineFlush, pendingOpsCount, setCompanyId } from "@/lib/client/api";
import { MODULE_LABELS, type ModuleKey } from "@/lib/config/patch";
import { can } from "@/lib/permissions";
import { BRAND, formatCOP } from "@/lib/brand";

interface Me {
  user: { id: string; name: string; email: string };
  companies: Array<{ companyId: string; role: string; companyName: string; onboardingCompleted: boolean }>;
}

interface ConfigResp {
  company: { id: string; name: string; onboardingCompleted: boolean };
  role: string;
  config: {
    modules: Array<{ key: string; enabled?: boolean; label?: string }>;
    businessProfile: Record<string, unknown>;
    entities: Record<string, unknown>;
  };
  plan: { id: string; name: string; priceCopMonth: number } | null;
  paymentsEnabled: boolean;
}

interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: string;
  read: boolean;
  createdAt: string;
}

interface AppCtxValue {
  me: Me;
  config: ConfigResp;
  refreshConfig: () => Promise<void>;
  alerts: AlertItem[];
  unread: number;
  refreshAlerts: () => Promise<void>;
  pendingOps: number;
  refreshPendingOps: () => void;
}

const AppCtx = createContext<AppCtxValue | null>(null);
export const useApp = () => {
  const v = useContext(AppCtx);
  if (!v) throw new Error("useApp fuera del shell");
  return v;
};

const MODULE_ROUTE: Record<string, string> = {
  products: "/app/products",
  sales: "/app/sales",
  reports: "/app/reports",
  automations: "/app/automations",
};

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<ConfigResp | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [pendingOps, setPendingOps] = useState(0);
  const [ready, setReady] = useState(false);

  const refreshAlerts = useCallback(async () => {
    try {
      const d = await api<{ rows: AlertItem[]; unread: number }>("/api/alerts");
      setAlerts(d.rows);
    } catch {
      /* silencioso */
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    const d = await api<ConfigResp>("/api/config");
    setConfig(d);
  }, []);

  const refreshPendingOps = useCallback(() => setPendingOps(pendingOpsCount()), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await api<Me>("/api/auth/me");
        if (cancelled) return;
        if (!d.companies.length) {
          router.push("/onboarding");
          return;
        }
        const active = d.companies.find((c) => !c.onboardingCompleted) ?? d.companies[0];
        setCompanyId(active.companyId);
        setMe(d);
        if (!active.onboardingCompleted) {
          router.push("/onboarding");
          return;
        }
        const cfg = await api<ConfigResp>("/api/config");
        if (cancelled) return;
        setConfig(cfg);
        await refreshAlerts();
        setPendingOps(pendingOpsCount());
        setReady(true);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) router.push("/login");
      }
    })();
    const off = onOnlineFlush(() => {
      void refreshAlerts();
      void refreshConfig();
      refreshPendingOps();
    });
    const t = setInterval(refreshPendingOps, 5000);
    return () => {
      cancelled = true;
      off();
      clearInterval(t);
    };
  }, [router, refreshAlerts, refreshConfig, refreshPendingOps]);

  if (!ready || !me || !config) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Logo size={36} />
          <Spinner className="h-6 w-6" />
        </div>
      </main>
    );
  }

  const modules = config.config.modules.filter((m) => m.enabled !== false);
  const navModules = modules.filter((m) => m.key in MODULE_LABELS);

  const navItem = (href: string, icon: string, label: string) => {
    const active = pathname === href || (href.startsWith("/app/resource") && pathname.startsWith(href));
    return (
      <Link
        key={href}
        href={href}
        className={cls(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          active ? "bg-white/8 bg-white/5 font-medium text-ink" : "text-muted hover:bg-white/5 hover:text-ink",
        )}
      >
        <Icon name={icon} className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("kispa_company");
    router.push("/");
  }

  const unread = alerts.filter((a) => !a.read).length;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 px-4 pb-4 pt-5">
          <Logo size={26} />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 pb-4">
          {navItem("/app", "dashboard", "Panel")}
          {navItem("/app/assistant", "sparkles", "Asistente")}
          <div className="pt-3" />
          {navModules.map((m) =>
            navItem(
              MODULE_ROUTE[m.key] ?? `/app/resource/${m.key}`,
              ({ clients: "users", products: "box", sales: "cart", orders: "clipboard", expenses: "wallet", receivables: "clock", employees: "badge", reports: "chart", automations: "zap" } as Record<string, string>)[m.key] ?? "box",
              (m.label as string) ?? MODULE_LABELS[m.key as ModuleKey] ?? m.key,
            ),
          )}
          <div className="pt-3" />
          {navItem("/app/automations", "zap", "Automatizaciones")}
          {navItem("/app/settings", "gear", "Ajustes")}
        </nav>
        <div className="border-t border-line p-3">
          <button
            onClick={() => setShowUser((s) => !s)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-white/5"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ember/15 text-xs font-semibold text-ember-soft">
              {me.user.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{me.user.name}</span>
              <span className="block text-xs text-faint">{config.role}</span>
            </span>
          </button>
          {showUser && (
            <Button variant="ghost" size="sm" className="mt-1 w-full justify-start" onClick={() => void logout()}>
              <Icon name="logout" className="h-4 w-4" /> Cerrar sesión
            </Button>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-panel/60 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-display text-sm font-semibold">{config.company.name}</span>
            {config.plan && (
              <Badge tone="ember">
                Plan {config.plan.name}
                {config.plan.priceCopMonth > 0 ? ` · ${formatCOP(config.plan.priceCopMonth * 100)}/mes` : " · Gratis"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {pendingOps > 0 && (
              <button
                onClick={() => void flushOutbox().then(() => { refreshPendingOps(); void refreshAlerts(); void refreshConfig(); })}
                className="flex items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-[11px] font-medium text-warn"
                title="Operaciones pendientes de sincronizar. Clic para reintentar."
              >
                <Icon name="refresh" className="h-3 w-3" /> {pendingOps} pendiente(s) de sincronizar
              </button>
            )}
            <div className="relative">
              <button
                onClick={() => { setShowAlerts((s) => !s); void refreshAlerts(); }}
                className="relative rounded-lg p-2 text-muted transition-colors hover:bg-white/5 hover:text-ink"
              >
                <Icon name="bell" className="h-4.5 w-4.5 h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[10px] font-bold text-[#1a0b04]">
                    {unread}
                  </span>
                )}
              </button>
              {showAlerts && (
                <div className="absolute right-0 z-50 mt-2 w-80 rounded-2xl border border-line bg-panel shadow-2xl">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <span className="text-sm font-semibold">Alertas</span>
                    <button
                      className="text-xs text-muted hover:text-ink"
                      onClick={() => api("/api/alerts?all=1", { method: "PATCH" }).then(() => void refreshAlerts())}
                    >
                      Marcar todas como leídas
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-2">
                    {alerts.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">Sin alertas. Todo en orden.</p>}
                    {alerts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => api(`/api/alerts?id=${a.id}`, { method: "PATCH" }).then(() => void refreshAlerts())}
                        className={cls("w-full rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5", !a.read && "bg-ember/5")}
                      >
                        <div className="flex items-center gap-2">
                          <Icon
                            name={a.severity === "critical" ? "alert" : "bell"}
                            className={cls("h-3.5 w-3.5 shrink-0", a.severity === "critical" ? "text-bad" : a.severity === "warning" ? "text-warn" : "text-muted")}
                          />
                          <span className="text-sm font-medium">{a.title}</span>
                        </div>
                        <p className="mt-0.5 pl-5 text-xs text-muted">{a.message}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

export { BRAND };
