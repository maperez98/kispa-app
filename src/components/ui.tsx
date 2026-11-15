"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "./icons";

export const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "subtle"; size?: "sm" | "md" | "lg" }) {
  const variants = {
    primary:
      "bg-ember text-[#1a0b04] hover:bg-ember-soft font-semibold shadow-[0_0_0_1px_rgba(255,90,31,0.4),0_8px_24px_-8px_rgba(255,90,31,0.5)]",
    ghost: "border border-line bg-transparent text-ink hover:bg-white/5",
    subtle: "bg-white/5 text-ink hover:bg-white/10",
    danger: "bg-bad/10 text-bad border border-bad/30 hover:bg-bad/20",
  } as const;
  const sizes = { sm: "h-8 px-3 text-xs rounded-lg", md: "h-10 px-4 text-sm rounded-xl", lg: "h-12 px-6 text-base rounded-xl" } as const;
  return (
    <button
      className={cls(
        "inline-flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-panel-2 px-3.5 py-2.5 text-sm text-ink placeholder:text-faint outline-none transition-colors focus:border-ember/60 focus:ring-2 focus:ring-ember/20";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cls(inputCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cls(inputCls, "min-h-[90px] resize-y", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cls(inputCls, "appearance-none pr-8", props.className)} />;
}

export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-muted">
      {children}
      {required && <span className="text-ember"> *</span>}
    </label>
  );
}

export function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      {children}
    </div>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cls("rounded-2xl border border-line bg-panel", className)}>{children}</div>;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "ember" | "good" | "bad" | "warn"; children: ReactNode }) {
  const tones = {
    neutral: "bg-white/5 text-muted border-line",
    ember: "bg-ember/10 text-ember-soft border-ember/30",
    good: "bg-good/10 text-good border-good/30",
    bad: "bg-bad/10 text-bad border-bad/30",
    warn: "bg-warn/10 text-warn border-warn/30",
  } as const;
  return (
    <span className={cls("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cls(
          "animate-rise relative w-full rounded-2xl border border-line bg-panel shadow-2xl",
          wide ? "max-w-2xl" : "max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="font-display text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-ink">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cls(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-ember/30 border-t-ember",
        className,
      )}
    />
  );
}

export function Empty({
  icon = "inbox",
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <div className="rounded-2xl bg-white/5 p-3 text-muted">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="font-display text-sm font-semibold text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Renderiza texto con **negrita** y saltos de línea (respuestas del asistente).
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="whitespace-pre-line text-sm leading-relaxed">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-semibold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}
