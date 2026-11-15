"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      const me = await api<{ companies: Array<{ companyId: string; onboardingCompleted: boolean }> }>("/api/auth/me");
      if (me.companies.length) {
        const c = me.companies[0];
        localStorage.setItem("kispa_company", c.companyId);
        router.push(c.onboardingCompleted ? "/app" : "/onboarding");
      } else {
        router.push("/onboarding");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-8 flex justify-center">
          <Link href="/"><Logo size={34} /></Link>
        </div>
        <Card className="p-7">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Bienvenido de nuevo</h1>
          <p className="mt-1 text-sm text-muted">Ingresa a tu espacio de trabajo.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Correo electrónico" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.co" required autoFocus />
            </Field>
            <Field label="Contraseña" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </Field>
            {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Ingresando…" : "Ingresar"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            ¿Aún no tienes cuenta?{" "}
            <Link href="/register" className="font-medium text-ember-soft hover:text-ember">
              Crear mi cuenta gratis
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
