import type { ModuleKey, PermissionKey, Role, User } from "./types";

export const PERMISSION_CATALOG: Array<{
  code: PermissionKey;
  moduleKey: ModuleKey;
  label: string;
  description: string;
}> = [
  {
    code: "dashboard.view",
    moduleKey: "dashboard",
    label: "View dashboard",
    description: "Access the dashboard and live overview metrics.",
  },
  {
    code: "inventory.view",
    moduleKey: "inventoryOps",
    label: "View inventory ops",
    description: "Open Inventory OPS pages and logs.",
  },
  {
    code: "inventory.grn",
    moduleKey: "inventoryOps",
    label: "Create GRN",
    description: "Create GRN requests and receive stock.",
  },
  {
    code: "inventory.gin",
    moduleKey: "inventoryOps",
    label: "Create GIN",
    description: "Create GIN requests and issue stock.",
  },
  {
    code: "inventory.transfer",
    moduleKey: "inventoryOps",
    label: "Create transfers",
    description: "Move stock between warehouses and outlets.",
  },
  {
    code: "inventory.adjustment",
    moduleKey: "inventoryOps",
    label: "Create adjustments",
    description: "Post inventory adjustments.",
  },
  {
    code: "inventory.count",
    moduleKey: "inventoryOps",
    label: "Run stock counts",
    description: "Record stock counts and variances.",
  },
  {
    code: "inventory.wastage",
    moduleKey: "inventoryOps",
    label: "Record wastage",
    description: "Post waste and spoilage entries.",
  },
  {
    code: "inventory.edit",
    moduleKey: "inventoryOps",
    label: "Edit inventory entries",
    description: "Correct posted inventory operation entries.",
  },
  {
    code: "inventory.delete",
    moduleKey: "inventoryOps",
    label: "Delete inventory entries",
    description: "Delete inventory entries with audit-safe handling.",
  },
  {
    code: "inventory.reverse",
    moduleKey: "inventoryOps",
    label: "Reverse inventory entries",
    description: "Cancel or reverse posted inventory entries.",
  },
  {
    code: "inventory.approve",
    moduleKey: "inventoryOps",
    label: "Approve inventory entries",
    description: "Approve inventory requests and future approval flows.",
  },
  {
    code: "master.items",
    moduleKey: "masterData",
    label: "Manage items",
    description: "Create and view item records.",
  },
  {
    code: "master.suppliers",
    moduleKey: "masterData",
    label: "Manage suppliers",
    description: "Create and view supplier records.",
  },
  {
    code: "master.locations",
    moduleKey: "masterData",
    label: "Manage locations",
    description: "Create and view warehouses and outlets.",
  },
  {
    code: "master.edit",
    moduleKey: "masterData",
    label: "Edit master data",
    description: "Edit existing item, supplier, location, and price records.",
  },
  {
    code: "master.delete",
    moduleKey: "masterData",
    label: "Delete master data",
    description: "Archive or delete master data records.",
  },
  {
    code: "reports.view",
    moduleKey: "reports",
    label: "View reports",
    description: "Access reports and analytics pages.",
  },
  {
    code: "reports.export",
    moduleKey: "reports",
    label: "Export reports",
    description: "Export report datasets to Excel.",
  },
  {
    code: "reports.print",
    moduleKey: "reports",
    label: "Print reports",
    description: "Print report pages and documents.",
  },
  {
    code: "admin.users.view",
    moduleKey: "administration",
    label: "View users",
    description: "Access the user administration page.",
  },
  {
    code: "admin.users.create",
    moduleKey: "administration",
    label: "Create users",
    description: "Create new user accounts.",
  },
  {
    code: "admin.users.edit",
    moduleKey: "administration",
    label: "Edit users",
    description: "Edit user profiles, roles, status, and site assignments.",
  },
  {
    code: "admin.users.password",
    moduleKey: "administration",
    label: "Change user passwords",
    description: "Reset or change other users' passwords.",
  },
  {
    code: "admin.users.remove",
    moduleKey: "administration",
    label: "Remove users",
    description: "Remove users from active system access.",
  },
  {
    code: "admin.environment.edit",
    moduleKey: "administration",
    label: "Edit environment settings",
    description: "Change environment toggles, FEFO behavior, thresholds, and timezone settings.",
  },
  {
    code: "admin.permissions.edit",
    moduleKey: "administration",
    label: "Edit role permissions",
    description: "Change the default permission set assigned to system roles.",
  },
  {
    code: "admin.permissions.manage",
    moduleKey: "administration",
    label: "Manage permissions",
    description: "Grant, revoke, and override user permissions.",
  },
  {
    code: "admin.settings",
    moduleKey: "administration",
    label: "View settings",
    description: "Access settings and permission matrix pages.",
  },
  {
    code: "admin.activity",
    moduleKey: "administration",
    label: "View activity",
    description: "Access audit and activity logs.",
  },
];

export const ALL_PERMISSIONS = PERMISSION_CATALOG.map((permission) => permission.code);

export function permissionsForRole(role: Role): PermissionKey[] {
  switch (role) {
    case "superadmin":
      return [...ALL_PERMISSIONS];
    case "admin":
      return [
        "dashboard.view",
        "inventory.view",
        "inventory.grn",
        "inventory.gin",
        "inventory.transfer",
        "inventory.adjustment",
        "inventory.count",
        "inventory.wastage",
        "inventory.edit",
        "inventory.reverse",
        "inventory.approve",
        "master.items",
        "master.suppliers",
        "master.locations",
        "master.edit",
        "reports.view",
        "reports.export",
        "reports.print",
        "admin.users.view",
        "admin.users.create",
        "admin.users.edit",
        "admin.users.password",
        "admin.environment.edit",
        "admin.settings",
        "admin.activity",
      ];
    case "manager":
      return [
        "dashboard.view",
        "inventory.view",
        "inventory.grn",
        "inventory.gin",
        "inventory.transfer",
        "inventory.adjustment",
        "inventory.count",
        "inventory.wastage",
        "inventory.edit",
        "inventory.reverse",
        "inventory.approve",
        "master.items",
        "master.suppliers",
        "master.locations",
        "reports.view",
        "reports.export",
        "reports.print",
        "admin.users.view",
        "admin.activity",
      ];
    case "worker":
      return [
        "dashboard.view",
        "inventory.view",
        "inventory.grn",
        "inventory.gin",
        "inventory.transfer",
        "inventory.adjustment",
        "inventory.count",
        "inventory.wastage",
      ];
  }
}

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
    description: "Owns cross-site governance, role design, permissions, and audit visibility.",
    permissions: permissionsForRole("superadmin"),
  },
  admin: {
    label: "Admin",
    description: "Runs day-to-day operations, reporting, and controlled user administration.",
    permissions: permissionsForRole("admin"),
  },
  manager: {
    label: "Manager",
    description: "Monitors assigned sites, approvals, and operational performance.",
    permissions: permissionsForRole("manager"),
  },
  worker: {
    label: "Worker",
    description: "Performs warehouse tasks, counts, receiving, and dispatching.",
    permissions: permissionsForRole("worker"),
  },
};

export const MODULE_ACCESS: Record<ModuleKey, PermissionKey[]> = {
  dashboard: ["dashboard.view"],
  inventoryOps: ["inventory.view"],
  masterData: ["master.items", "master.suppliers", "master.locations"],
  reports: ["reports.view"],
  administration: [
    "admin.users.view",
    "admin.settings",
    "admin.activity",
    "admin.environment.edit",
    "admin.permissions.edit",
    "admin.permissions.manage",
  ],
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
  return MODULE_ACCESS[moduleKey].some((permission) => user.permissions.includes(permission));
}

export function can(user: User, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}
