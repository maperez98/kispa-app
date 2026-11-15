// Evaluación pura de condiciones del motor de automatización.
// Sin dependencias de base de datos: se prueba con tests unitarios.
export type ConditionOp = "lt" | "lte" | "gt" | "gte" | "eq" | "neq" | "contains";

export interface Condition {
  field: string;
  op: ConditionOp;
  value: number | string | boolean;
}

export function getPath(obj: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc == null || typeof acc !== "object" ? undefined : (acc as Record<string, unknown>)[key]),
      obj,
    );
}

export function evaluateCondition(cond: Condition, ctx: Record<string, unknown>): boolean {
  const actual = getPath(ctx, cond.field);
  const expected = cond.value;
  switch (cond.op) {
    case "lt":
      return typeof actual === "number" && typeof expected === "number" && actual < expected;
    case "lte":
      return typeof actual === "number" && typeof expected === "number" && actual <= expected;
    case "gt":
      return typeof actual === "number" && typeof expected === "number" && actual > expected;
    case "gte":
      return typeof actual === "number" && typeof expected === "number" && actual >= expected;
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "contains":
      if (typeof actual === "string" && typeof expected === "string")
        return actual.toLowerCase().includes(expected.toLowerCase());
      if (Array.isArray(actual)) return actual.includes(expected);
      return false;
    default:
      return false;
  }
}

export function evaluateConditions(conds: Condition[], ctx: Record<string, unknown>): boolean {
  return conds.every((c) => evaluateCondition(c, ctx));
}

// Reemplaza {ruta.de.campo} en plantillas de mensajes con valores del contexto.
export function renderTemplate(template: string, ctx: Record<string, unknown>): string {
  return template.replace(/\{([^}]+)\}/g, (_m, p: string) => {
    const v = getPath(ctx, p.trim());
    return v == null ? "" : String(v);
  });
}
