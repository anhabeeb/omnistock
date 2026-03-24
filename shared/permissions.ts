import type { ModuleKey, PermissionKey, Role, User } from "./types";

export const ROLE_PRESETS: Record<
  Role,
  {
    label: string;
    description: string;
    permissions: PermissionKey[];
  }
> = {
  superadmin: {
    label: "Superadmin",
    description: "Owns cross-site governance, role design, and audit visibility.",
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.grn",
      "inventory.gin",
      "inventory.transfer",
      "inventory.adjustment",
      "inventory.count",
      "inventory.wastage",
      "master.items",
      "master.suppliers",
      "master.locations",
      "reports.view",
      "reports.export",
      "admin.users",
      "admin.settings",
      "admin.activity",
    ],
  },
  admin: {
    label: "Admin",
    description: "Runs day-to-day warehouse operations, setup, and reporting.",
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.grn",
      "inventory.gin",
      "inventory.transfer",
      "inventory.adjustment",
      "inventory.count",
      "inventory.wastage",
      "master.items",
      "master.suppliers",
      "master.locations",
      "reports.view",
      "reports.export",
      "admin.users",
      "admin.settings",
      "admin.activity",
    ],
  },
  manager: {
    label: "Manager",
    description: "Approves and monitors operational flow across assigned sites.",
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.grn",
      "inventory.gin",
      "inventory.transfer",
      "inventory.adjustment",
      "inventory.count",
      "inventory.wastage",
      "master.items",
      "master.suppliers",
      "master.locations",
      "reports.view",
      "reports.export",
      "admin.activity",
    ],
  },
  worker: {
    label: "Worker",
    description: "Performs warehouse tasks, counts, dispatches, and receiving.",
    permissions: [
      "dashboard.view",
      "inventory.view",
      "inventory.grn",
      "inventory.gin",
      "inventory.transfer",
      "inventory.adjustment",
      "inventory.count",
      "inventory.wastage",
    ],
  },
};

export const MODULE_ACCESS: Record<ModuleKey, PermissionKey[]> = {
  dashboard: ["dashboard.view"],
  inventoryOps: ["inventory.view"],
  masterData: ["master.items", "master.suppliers", "master.locations"],
  reports: ["reports.view"],
  administration: ["admin.users", "admin.settings", "admin.activity"],
};

export const MODULES: Array<{
  key: ModuleKey;
  label: string;
  shortLabel: string;
  path: string;
  description: string;
}> = [
  {
    key: "dashboard",
    label: "Dashboard",
    shortLabel: "Home",
    path: "/",
    description: "Network health, KPIs, alerts, and recent activity.",
  },
  {
    key: "inventoryOps",
    label: "Inventory OPS",
    shortLabel: "OPS",
    path: "/inventory",
    description: "GRN, GIN, transfers, adjustments, stock counts, and wastage.",
  },
  {
    key: "masterData",
    label: "Master Data",
    shortLabel: "Data",
    path: "/master-data",
    description: "Items, suppliers, warehouses, and outlets.",
  },
  {
    key: "reports",
    label: "Reports & Analytics",
    shortLabel: "Reports",
    path: "/reports",
    description: "Movement ledger, exports, print-ready reports, and analytics.",
  },
  {
    key: "administration",
    label: "Administration",
    shortLabel: "Admin",
    path: "/administration",
    description: "Users, settings, permissions, and activity auditing.",
  },
];

export function canAccessModule(user: User, moduleKey: ModuleKey): boolean {
  return MODULE_ACCESS[moduleKey].some((permission) =>
    user.permissions.includes(permission),
  );
}

export function can(user: User, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}
