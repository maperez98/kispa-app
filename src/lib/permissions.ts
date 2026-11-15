// Matriz de permisos por rol y módulo. Módulo puro (sin dependencias de DB)
// para poder probarlo con tests unitarios.
export const ROLE_ORDER = { viewer: 0, operator: 1, admin: 2, owner: 3 } as const;
export type Role = keyof typeof ROLE_ORDER;

export function roleAtLeast(role: string, min: Role): boolean {
  return (ROLE_ORDER[role as Role] ?? -1) >= ROLE_ORDER[min];
}

export type PermissionAction = "read" | "write" | "delete";

export const PERMISSIONS: Record<string, Record<PermissionAction, Role>> = {
  dashboard: { read: "viewer", write: "viewer", delete: "viewer" },
  clients: { read: "viewer", write: "operator", delete: "admin" },
  products: { read: "viewer", write: "operator", delete: "admin" },
  sales: { read: "viewer", write: "operator", delete: "admin" },
  orders: { read: "viewer", write: "operator", delete: "admin" },
  expenses: { read: "viewer", write: "operator", delete: "admin" },
  receivables: { read: "viewer", write: "operator", delete: "admin" },
  employees: { read: "admin", write: "owner", delete: "owner" },
  automations: { read: "operator", write: "admin", delete: "admin" },
  config: { read: "viewer", write: "admin", delete: "owner" },
  reports: { read: "viewer", write: "viewer", delete: "viewer" },
  assistant: { read: "viewer", write: "viewer", delete: "viewer" },
  alerts: { read: "viewer", write: "operator", delete: "admin" },
};

export function can(role: string, module: string, action: PermissionAction): boolean {
  const p = PERMISSIONS[module];
  if (!p) return false;
  return roleAtLeast(role, p[action]);
}
