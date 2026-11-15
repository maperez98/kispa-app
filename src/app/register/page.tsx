"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button, Card, Field, Input } from "@/components/ui";
import { ApiError, api } from "@/lib/client/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
      router.push("/onboarding");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo crear la cuenta");
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
          <h1 className="font-display text-2xl font-semibold tracking-tight">Crea tu cuenta</h1>
          <p className="mt-1 text-sm text-muted">
            Gratis para empezar. Tu asistente configurará tu sistema en minutos.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Tu nombre" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre completo" required autoFocus />
            </Field>
            <Field label="Correo electrónico" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@negocio.co" required />
            </Field>
            <Field label="Contraseña" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} />
            </Field>
            {error && <p className="rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Creando cuenta…" : "Crear cuenta gratis"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-ember-soft hover:text-ember">
              Ingresar
            </Link>
          </p>
        </Card>
      </div>
    </main>
  );
}
