"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Chat } from "@/components/chat";
import { Button, Card, Field, Input, Select, Spinner } from "@/components/ui";
import { ApiError, api, setCompanyId } from "@/lib/client/api";
import { SECTOR_INFO } from "@/lib/config/patch";
import { BRAND } from "@/lib/brand";

type Me = { user: { name: string }; companies: Array<{ companyId: string; companyName: string; onboardingCompleted: boolean }> };

export default function OnboardingPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paso 0: registrar el negocio
  const [businessName, setBusinessName] = useState("");
  const [sector, setSector] = useState("retail_store");
  const [nit, setNit] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api<Me>("/api/auth/me")
      .then((d) => {
        setMe(d);
        const active = d.companies.find((c) => !c.onboardingCompleted) ?? d.companies[0];
        if (active) setCompanyId(active.companyId);
        if (d.companies.length && d.companies.every((c) => c.onboardingCompleted)) router.push("/app");
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const res = await api<{ company: { id: string } }>("/api/companies", {
        method: "POST",
        body: JSON.stringify({ name: businessName, sector, nit: nit || undefined }),
      });
      setCompanyId(res.company.id);
      setMe((m) =>
        m
          ? { ...m, companies: [...m.companies, { companyId: res.company.id, companyName: businessName, onboardingCompleted: false }] }
          : m,
      );
      window.location.reload();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo registrar el negocio");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <Spinner className="h-8 w-8" />
      </main>
    );
  }

  const needsCompany = !me || me.companies.length === 0;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.2fr]">
      <section className="hidden flex-col justify-between border-r border-line bg-panel p-10 lg:flex">
        <Logo size={32} />
        <div>
          <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight">
            {BRAND.tagline}
          </h1>
          <p className="mt-4 max-w-md text-muted">
            No necesitas saber de software. Cuéntale a tu asistente cómo funciona tu negocio y Kispa construye
            tu sistema de administración: módulos, campos, categorías, panel y automatizaciones.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-muted">
            {[
              "Conversa, no llenes formularios técnicos",
              "Revisa y aprueba cada cambio antes de aplicarlo",
              "Tus datos quedan aislados y auditados",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="h-1.5 w-1.5 rounded-full bg-ember" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-faint">Kispa · Sistema de administración autoconfigurable para Latinoamérica</p>
      </section>

      <section className="flex min-h-screen flex-col p-6 lg:p-10">
        {needsCompany ? (
          <div className="m-auto w-full max-w-md animate-rise">
            <div className="mb-6 lg:hidden"><Logo size={30} /></div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Empecemos por tu negocio</h2>
            <p className="mt-1 text-sm text-muted">Solo necesito lo básico. El resto lo descubrimos conversando.</p>
            <Card className="mt-6 p-6">
              <form onSubmit={createCompany} className="space-y-4">
                <Field label="Nombre de tu negocio" required>
                  <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej: Tienda El Buen Precio" required autoFocus />
                </Field>
                <Field label="¿Qué tipo de negocio es?">
                  <Select value={sector} onChange={(e) => setSector(e.target.value)}>
                    {Object.entries(SECTOR_INFO).map(([key, s]) => (
                      <option key={key} value={key}>{s.label}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="NIT (opcional)">
                  <Input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900.123.456-7" />
                </Field>
                {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={creating || !businessName.trim()}>
                  {creating ? "Registrando…" : "Continuar con el asistente"}
                </Button>
              </form>
            </Card>
          </div>
        ) : (
          <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold tracking-tight">Tu asistente empresarial</h2>
                <p className="text-sm text-muted">Descríbele tu negocio. Cuando proponga la configuración, revísala y apruébala.</p>
              </div>
              <Logo size={26} />
            </div>
            <Card className="flex min-h-[60vh] flex-1 flex-col p-4">
              <Chat embedded />
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}
