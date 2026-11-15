// Identidad de marca centralizada. Cambiar aquí cambia todo el producto.
export const BRAND = {
  name: "Kispa",
  domain: "kispa.app",
  tagline: "Dile a tu negocio lo que necesitas. Kispa lo construye.",
  taglineEn: "Tell your business what it needs. Kispa builds it.",
  mission:
    "Que cualquier microempresa de Latinoamérica tenga su propio sistema de administración, construido conversando, sin contratar desarrolladores.",
  vision:
    "Ser la plataforma empresarial de referencia para los negocios que están naciendo en Latinoamérica.",
  personality: "Cálida, directa, experta y sin tecnicismos.",
  colors: {
    bg: "#0a0a0c",
    panel: "#101014",
    ink: "#f5f2ec",
    muted: "#9a958d",
    ember: "#ff5a1f",
    emberSoft: "#ffb25c",
  },
} as const;

export const formatCOP = (cents: number | null | undefined): string => {
  const value = (cents ?? 0) / 100;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatDate = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(d));
};

export const formatDateTime = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
};
