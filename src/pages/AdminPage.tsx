import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  MODULE_ACCESS,
  MODULES,
  PERMISSION_CATALOG,
  ROLE_PRESETS,
  can,
} from "../../shared/permissions";
import type {
  CreateUserRequest,
  InventorySnapshot,
  PermissionKey,
  ResetUserPasswordRequest,
  Role,
  UpdateSettingsRequest,
  UpdateRolePermissionsRequest,
  UpdateUserRequest,
  User,
} from "../../shared/types";
import {
  DATE_FILTER_OPTIONS,
  type DateFilterPreset,
  matchesDateFilter,
} from "../lib/dateFilters";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onCreateUser: (input: CreateUserRequest) => Promise<void>;
  onUpdateUser: (input: UpdateUserRequest) => Promise<void>;
  onUpdateSettings: (input: UpdateSettingsRequest) => Promise<void>;
  onUpdateRolePermissions: (input: UpdateRolePermissionsRequest) => Promise<void>;
  onResetUserPassword: (input: ResetUserPasswordRequest) => Promise<void>;
  onRemoveUser: (userId: string) => Promise<void>;
}

interface UserFormState {
  userId: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  status: User["status"];
  assignedLocationIds: string[];
  permissions: PermissionKey[];
}

interface CreateFormState {
  name: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  assignedLocationIds: string[];
  permissions: PermissionKey[];
}

type SettingsFormState = UpdateSettingsRequest;

const ADMIN_SECTIONS = [
  {
    slug: "users",
    label: "Users",
    title: "User Management",
    description: "Create accounts, assign roles, and manage passwords and site access.",
  },
  {
    slug: "settings",
    label: "Settings",
    title: "System Settings",
    description: "Review environment behavior, FEFO controls, and the permission matrix.",
  },
  {
    slug: "activity",
    label: "Activity",
    title: "Audit Activity",
    description: "Inspect the latest administration and operational events across the system.",
  },
] as const;

const SECTION_PERMISSION: Record<(typeof ADMIN_SECTIONS)[number]["slug"], PermissionKey> = {
  users: "admin.users.view",
  settings: "admin.settings",
  activity: "admin.activity",
};

const PERMISSION_GROUPS = MODULES.map((module) => ({
  key: module.key,
  label: module.label,
  permissions: PERMISSION_CATALOG.filter((permission) => permission.moduleKey === module.key),
})).filter((group) => group.permissions.length > 0);

function roleHasModule(
  rolePermissions: Record<Role, PermissionKey[]>,
  role: Role,
  moduleKey: keyof typeof MODULE_ACCESS,
): boolean {
  return MODULE_ACCESS[moduleKey].some((permission) =>
    rolePermissions[role].includes(permission),
  );
}

function buildEditState(user: User): UserFormState {
  return {
    userId: user.id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    assignedLocationIds: [...user.assignedLocationIds],
    permissions: [...user.permissions].sort(),
  };
}

function buildCreateState(rolePermissions: Record<Role, PermissionKey[]>): CreateFormState {
  return {
    name: "",
    username: "",
    email: "",
    role: "worker",
    password: "",
    assignedLocationIds: [],
    permissions: [...rolePermissions.worker],
  };
}

function toggleLocation(assignedLocationIds: string[], locationId: string): string[] {
  return assignedLocationIds.includes(locationId)
    ? assignedLocationIds.filter((value) => value !== locationId)
    : [...assignedLocationIds, locationId];
}

function togglePermission(currentPermissions: PermissionKey[], permission: PermissionKey): PermissionKey[] {
  return currentPermissions.includes(permission)
    ? currentPermissions.filter((value) => value !== permission)
    : [...currentPermissions, permission].sort();
}

function statusLabel(status: User["status"]): string {
  if (status === "active") {
    return "Active";
  }
  if (status === "invited") {
    return "Inactive";
  }
  return "Archived";
}

function permissionCountLabel(permissions: PermissionKey[]): string {
  return `${permissions.length} permission${permissions.length === 1 ? "" : "s"}`;
}

function buildSettingsState(snapshot: InventorySnapshot): SettingsFormState {
  return {
    timezone: snapshot.settings.timezone,
    lowStockThreshold: snapshot.settings.lowStockThreshold,
    expiryAlertDays: snapshot.settings.expiryAlertDays,
    enableOffline: snapshot.settings.enableOffline,
    enableRealtime: snapshot.settings.enableRealtime,
    enableBarcode: snapshot.settings.enableBarcode,
    strictFefo: snapshot.settings.strictFefo,
  };
}

export function AdminPage({
  snapshot,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onUpdateSettings,
  onUpdateRolePermissions,
  onResetUserPassword,
  onRemoveUser,
}: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? ADMIN_SECTIONS[0].slug;
  const visibleSections = ADMIN_SECTIONS.filter((section) =>
    section.slug === "settings"
      ? can(currentUser, "admin.settings") ||
        can(currentUser, "admin.environment.edit") ||
        can(currentUser, "admin.permissions.edit") ||
        can(currentUser, "admin.permissions.manage")
      : can(currentUser, SECTION_PERMISSION[section.slug]),
  );
  const activeSection =
    visibleSections.find((section) => section.slug === activeSlug) ??
    visibleSections[0] ??
    ADMIN_SECTIONS[0];
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | Role>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<"all" | User["status"]>("all");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityModuleFilter, setActivityModuleFilter] = useState<"all" | InventorySnapshot["activity"][number]["module"]>("all");
  const [activityDatePreset, setActivityDatePreset] = useState<DateFilterPreset>("all");
  const [activityStartDate, setActivityStartDate] = useState("");
  const [activityEndDate, setActivityEndDate] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(snapshot.users[0]?.id ?? "");
  const [createForm, setCreateForm] = useState<CreateFormState>(() =>
    buildCreateState(snapshot.rolePermissions),
  );
  const [editForm, setEditForm] = useState<UserFormState | null>(
    snapshot.users[0] ? buildEditState(snapshot.users[0]) : null,
  );
  const [rolePermissionDrafts, setRolePermissionDrafts] = useState<Record<Role, PermissionKey[]>>(
    snapshot.rolePermissions,
  );
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(() =>
    buildSettingsState(snapshot),
  );
  const [settingsFeedback, setSettingsFeedback] = useState<string>();
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState<string>();
  const canCreateUsers = can(currentUser, "admin.users.create");
  const canEditUsers = can(currentUser, "admin.users.edit");
  const canResetUserPasswords = can(currentUser, "admin.users.password");
  const canRemoveUsers = can(currentUser, "admin.users.remove");
  const canEditEnvironmentSettings = can(currentUser, "admin.environment.edit");
  const canEditRolePermissions = can(currentUser, "admin.permissions.edit");
  const canManagePermissionOverrides = can(currentUser, "admin.permissions.manage");
  const canDelegatePermissionAccess = currentUser.role === "superadmin";
  const assignableRoles = (Object.keys(ROLE_PRESETS) as Role[]).filter(
    (role) => currentUser.role === "superadmin" || role !== "superadmin",
  );
  const canManageUsers =
    canCreateUsers ||
    canEditUsers ||
    canResetUserPasswords ||
    canRemoveUsers ||
    canManagePermissionOverrides;
  const selectedUser = useMemo(() => {
    const preferredUsers =
      currentUser.role === "superadmin"
        ? snapshot.users
        : snapshot.users.filter((user) => user.role !== "superadmin");
    return preferredUsers.find((user) => user.id === selectedUserId) ?? preferredUsers[0] ?? null;
  }, [currentUser.role, selectedUserId, snapshot.users]);
  const filteredUsers = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();
    return snapshot.users.filter((user) => {
      const matchesRole = userRoleFilter === "all" ? true : user.role === userRoleFilter;
      const matchesStatus = userStatusFilter === "all" ? true : user.status === userStatusFilter;
      const matchesSearch =
        !normalizedSearch ||
        `${user.name} ${user.username} ${user.email}`.toLowerCase().includes(normalizedSearch);
      return matchesRole && matchesStatus && matchesSearch;
    });
  }, [snapshot.users, userRoleFilter, userSearch, userStatusFilter]);
  const filteredActivity = useMemo(() => {
    const normalizedSearch = activitySearch.trim().toLowerCase();
    return snapshot.activity.filter((entry) => {
      const matchesModule = activityModuleFilter === "all" ? true : entry.module === activityModuleFilter;
      const matchesDate = matchesDateFilter(entry.createdAt, {
        preset: activityDatePreset,
        customStartDate: activityStartDate,
        customEndDate: activityEndDate,
      });
      const matchesSearch =
        !normalizedSearch ||
        `${entry.title} ${entry.detail} ${entry.actorName}`.toLowerCase().includes(normalizedSearch);
      return matchesModule && matchesDate && matchesSearch;
    });
  }, [
    activityDatePreset,
    activityEndDate,
    activityModuleFilter,
    activitySearch,
    activityStartDate,
    snapshot.activity,
  ]);

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(null);
      return;
    }

    setSelectedUserId(selectedUser.id);
    setEditForm(buildEditState(selectedUser));
  }, [selectedUser]);

  useEffect(() => {
    setRolePermissionDrafts(snapshot.rolePermissions);
    setCreateForm((current) => ({
      ...current,
      permissions: [...snapshot.rolePermissions[current.role]],
    }));
  }, [snapshot.generatedAt, snapshot.rolePermissions]);

  useEffect(() => {
    setSettingsForm(buildSettingsState(snapshot));
  }, [
    snapshot.settings.timezone,
    snapshot.settings.lowStockThreshold,
    snapshot.settings.expiryAlertDays,
    snapshot.settings.enableOffline,
    snapshot.settings.enableRealtime,
    snapshot.settings.enableBarcode,
    snapshot.settings.strictFefo,
  ]);

  function patchCreate<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function patchEdit<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setEditForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchSettings<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    setSettingsForm((current) => ({ ...current, [key]: value }));
  }

  function setCreateRole(role: Role) {
    setCreateForm((current) => ({
      ...current,
      role,
      permissions: [...snapshot.rolePermissions[role]],
    }));
  }

  function setEditRole(role: Role) {
    setEditForm((current) =>
      current
        ? {
            ...current,
            role,
            permissions: [...snapshot.rolePermissions[role]],
          }
        : current,
    );
  }

  function toggleCreatePermission(permission: PermissionKey) {
    if (!canManagePermissionOverrides) {
      return;
    }
    if (
      (permission === "admin.permissions.manage" || permission === "admin.permissions.edit") &&
      !canDelegatePermissionAccess
    ) {
      return;
    }

    setCreateForm((current) => ({
      ...current,
      permissions: togglePermission(current.permissions, permission),
    }));
  }

  function toggleEditPermission(permission: PermissionKey) {
    if (!canManagePermissionOverrides || !editForm) {
      return;
    }
    if (
      (permission === "admin.permissions.manage" || permission === "admin.permissions.edit") &&
      !canDelegatePermissionAccess
    ) {
      return;
    }

    patchEdit("permissions", togglePermission(editForm.permissions, permission));
  }

  function toggleRolePermission(role: Role, permission: PermissionKey) {
    if (!canEditRolePermissions || role === "superadmin") {
      return;
    }
    if (
      (permission === "admin.permissions.manage" || permission === "admin.permissions.edit") &&
      !canDelegatePermissionAccess
    ) {
      return;
    }

    setRolePermissionDrafts((current) => ({
      ...current,
      [role]: togglePermission(current[role], permission),
    }));
  }

  async function handleSaveRolePermissions(role: Role) {
    if (!canEditRolePermissions) {
      return;
    }

    setSubmitting(`role:${role}`);
    setFeedback(undefined);
    try {
      await onUpdateRolePermissions({
        role,
        permissions: rolePermissionDrafts[role],
      });
      setFeedback(`${ROLE_PRESETS[role].label} role permissions updated successfully.`);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not update the role permissions.",
      );
    } finally {
      setSubmitting(undefined);
    }
  }

  const settingsDirty =
    settingsForm.timezone !== snapshot.settings.timezone ||
    settingsForm.lowStockThreshold !== snapshot.settings.lowStockThreshold ||
    settingsForm.expiryAlertDays !== snapshot.settings.expiryAlertDays ||
    settingsForm.enableOffline !== snapshot.settings.enableOffline ||
    settingsForm.enableRealtime !== snapshot.settings.enableRealtime ||
    settingsForm.enableBarcode !== snapshot.settings.enableBarcode ||
    settingsForm.strictFefo !== snapshot.settings.strictFefo;

  async function handleSaveSettings() {
    if (!canEditEnvironmentSettings) {
      return;
    }

    setSubmitting("settings");
    setSettingsFeedback(undefined);
    try {
      await onUpdateSettings(settingsForm);
      setSettingsFeedback("Environment settings updated successfully.");
    } catch (error) {
      setSettingsFeedback(
        error instanceof Error ? error.message : "Could not update the environment settings.",
      );
    } finally {
      setSubmitting(undefined);
    }
  }

  function renderPermissionChecklist(
    permissions: PermissionKey[],
    role: Role,
    onToggle: (permission: PermissionKey) => void,
  ) {
    const roleDefaults = new Set(snapshot.rolePermissions[role]);
    const isRoleLocked = role === "superadmin";

    return (
      <div className="page-stack">
        <div className="panel-heading compact-heading">
          <div>
            <p className="eyebrow">Permission Overrides</p>
            <h3>Fine-grained access</h3>
          </div>
          <span className="status-chip neutral">{permissionCountLabel(permissions)}</span>
        </div>
        <p className="helper-text">
          Role defaults can be overridden here. Superadmin accounts always keep full access.
        </p>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group.key} className="page-stack" style={{ gap: "10px" }}>
            <div>
              <strong>{group.label}</strong>
            </div>
            <div className="stack-list">
              {group.permissions.map((permission) => {
                const checked = permissions.includes(permission.code);
                const isPermissionLocked =
                  !canManagePermissionOverrides ||
                  isRoleLocked ||
                  ((permission.code === "admin.permissions.manage" ||
                    permission.code === "admin.permissions.edit") &&
                    !canDelegatePermissionAccess);
                return (
                  <label key={permission.code} className="list-row">
                    <div>
                      <strong>{permission.label}</strong>
                      <p>
                        {permission.description}
                        {roleDefaults.has(permission.code) ? " Default for this role." : " Override only."}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPermissionLocked}
                      onChange={() => onToggle(permission.code)}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderRolePermissionEditor(role: Role) {
    const effectivePermissions =
      role === "superadmin" ? snapshot.rolePermissions.superadmin : rolePermissionDrafts[role];
    const moduleSummary = MODULES.map((module) =>
      roleHasModule(
        {
          ...snapshot.rolePermissions,
          [role]: effectivePermissions,
        },
        role,
        module.key,
      ),
    );
    const isDirty =
      JSON.stringify(effectivePermissions) !== JSON.stringify(snapshot.rolePermissions[role]);
    const isLockedRole = role === "superadmin";

    return (
      <article key={role} className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{ROLE_PRESETS[role].label}</p>
            <h3>{permissionCountLabel(effectivePermissions)}</h3>
          </div>
          <span className="status-chip neutral">
            {isLockedRole ? "Fixed full access" : isDirty ? "Unsaved changes" : "Saved"}
          </span>
        </div>

        <div className="table-wrap" style={{ marginBottom: "16px" }}>
          <table className="data-table compact">
            <thead>
              <tr>
                {MODULES.map((module) => (
                  <th key={module.key}>{module.shortLabel}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {moduleSummary.map((hasAccess, index) => (
                  <td key={MODULES[index].key}>{hasAccess ? "Yes" : "No"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="page-stack">
          {PERMISSION_GROUPS.map((group) => (
            <div key={`${role}-${group.key}`} className="page-stack" style={{ gap: "10px" }}>
              <div>
                <strong>{group.label}</strong>
              </div>
              <div className="stack-list">
                {group.permissions.map((permission) => (
                  <label key={`${role}-${permission.code}`} className="list-row">
                    <div>
                      <strong>{permission.label}</strong>
                      <p>{permission.description}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={effectivePermissions.includes(permission.code)}
                      disabled={
                        !canEditRolePermissions ||
                        isLockedRole ||
                        ((permission.code === "admin.permissions.edit" ||
                          permission.code === "admin.permissions.manage") &&
                          !canDelegatePermissionAccess)
                      }
                      onChange={() => toggleRolePermission(role, permission.code)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        {!isLockedRole ? (
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              disabled={!isDirty || submitting === `role:${role}`}
              onClick={() =>
                setRolePermissionDrafts((current) => ({
                  ...current,
                  [role]: [...snapshot.rolePermissions[role]],
                }))
              }
            >
              Reset
            </button>
            <button
              type="button"
              className="primary-button"
              disabled={!canEditRolePermissions || !isDirty || submitting === `role:${role}`}
              onClick={() => void handleSaveRolePermissions(role)}
            >
              {submitting === `role:${role}` ? "Saving..." : `Save ${ROLE_PRESETS[role].label}`}
            </button>
          </div>
        ) : (
          <p className="helper-text">
            Superadmin remains full-access by design and cannot be reduced from the role editor.
          </p>
        )}
      </article>
    );
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("create");
    setFeedback(undefined);

    try {
      if (
        !createForm.name.trim() ||
        !createForm.username.trim() ||
        !createForm.email.trim() ||
        !createForm.password.trim()
      ) {
        throw new Error("Name, username, email, and password are required for new users.");
      }

      await onCreateUser({
        name: createForm.name.trim(),
        username: createForm.username.trim().toLowerCase(),
        email: createForm.email.trim().toLowerCase(),
        role: createForm.role,
        password: createForm.password,
        status: "active",
        assignedLocationIds: createForm.assignedLocationIds,
        permissions: createForm.permissions,
      });

      setCreateForm(buildCreateState(snapshot.rolePermissions));
      setFeedback("New user account created successfully.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the user.");
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handleUpdateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editForm) {
      return;
    }

    setSubmitting("update");
    setFeedback(undefined);

    try {
      await onUpdateUser({
        userId: editForm.userId,
        name: editForm.name.trim(),
        username: editForm.username.trim().toLowerCase(),
        email: editForm.email.trim().toLowerCase(),
        role: editForm.role,
        status: editForm.status === "archived" ? "invited" : editForm.status,
        assignedLocationIds: editForm.assignedLocationIds,
        permissions: editForm.permissions,
      });

      setFeedback("User information updated successfully.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the user.");
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) {
      return;
    }

    setSubmitting("password");
    setFeedback(undefined);

    try {
      if (!newPassword.trim()) {
        throw new Error("Enter a new password before resetting the account.");
      }

      await onResetUserPassword({
        userId: selectedUser.id,
        newPassword,
      });

      setNewPassword("");
      setFeedback(`Password reset for ${selectedUser.name} completed.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not reset the password.");
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handleRemoveUser(userId: string) {
    const target = snapshot.users.find((user) => user.id === userId);
    if (!target) {
      return;
    }

    if (!window.confirm(`Remove ${target.name} from OmniStock access?`)) {
      return;
    }

    setSubmitting(`remove:${userId}`);
    setFeedback(undefined);

    try {
      await onRemoveUser(userId);
      setFeedback(`${target.name} has been removed from active access.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not remove the user.");
    } finally {
      setSubmitting(undefined);
    }
  }

  if (visibleSections.length === 0) {
    return (
      <div className="page-stack">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Administration</p>
              <h2>Access required</h2>
            </div>
          </div>
          <p className="hero-copy">
            This user does not currently have permission to access Users, Settings, or Activity.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Administration</p>
          <h1>{activeSection.title}</h1>
          <p className="hero-copy">
            {activeSection.description} The current session is running as {currentUser.name}, under
            the {ROLE_PRESETS[currentUser.role].label} preset.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>Users</span>
            <strong>{snapshot.users.length}</strong>
            <small>Profiles participating in shared warehouse operations.</small>
          </div>
          <div className="meta-card">
            <span>Audit Events</span>
            <strong>{snapshot.activity.length}</strong>
            <small>Recent tracked activity visible in the local feed.</small>
          </div>
        </div>
      </section>

      {activeSection.slug === "users" ? (
        <section className="split-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Users</p>
                <h2>Role Directory</h2>
              </div>
            </div>
            <div className="table-toolbar" style={{ marginBottom: "16px", justifyContent: "flex-start" }}>
              <input
                className="table-search"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
                placeholder="Search name, username, or email"
              />
              <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value as "all" | Role)}>
                <option value="all">All roles</option>
                {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => (
                  <option key={role} value={role}>
                    {ROLE_PRESETS[role].label}
                  </option>
                ))}
              </select>
              <select
                value={userStatusFilter}
                onChange={(event) => setUserStatusFilter(event.target.value as "all" | User["status"])}
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="invited">Inactive</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Assigned Sites</th>
                    <th>Permissions</th>
                    <th>Last Seen</th>
                    {canManageUsers ? <th>Manage</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        {user.name}
                        <small>{user.email}</small>
                      </td>
                      <td>{user.username}</td>
                      <td>{ROLE_PRESETS[user.role].label}</td>
                      <td>{statusLabel(user.status)}</td>
                      <td>{user.assignedLocationIds.length}</td>
                      <td>{user.permissions.length}</td>
                      <td>{formatDateTime(user.lastSeenAt)}</td>
                      {canManageUsers ? (
                        <td>
                          <button
                            type="button"
                            className={selectedUserId === user.id ? "chip-button active" : "chip-button"}
                            onClick={() => setSelectedUserId(user.id)}
                            disabled={user.role === "superadmin" && currentUser.role !== "superadmin"}
                          >
                            {user.role === "superadmin" && currentUser.role !== "superadmin"
                              ? "Locked"
                              : selectedUserId === user.id
                                ? "Selected"
                                : "Manage"}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{canManageUsers ? "User Control" : "Access Notice"}</p>
                <h2>{canManageUsers ? "Access Controls" : "Read-only session"}</h2>
              </div>
            </div>

            {canManageUsers ? (
              <div className="page-stack">
                {canCreateUsers ? (
                <form className="page-stack" onSubmit={handleCreateUser}>
                  <div className="panel-heading compact-heading">
                    <div>
                      <p className="eyebrow">Create User</p>
                      <h3>Add a new account</h3>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>Name</span>
                      <input
                        value={createForm.name}
                        onChange={(event) => patchCreate("name", event.target.value)}
                        placeholder="New team member"
                      />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input
                        value={createForm.username}
                        onChange={(event) => patchCreate("username", event.target.value)}
                        placeholder="user.name"
                        autoComplete="username"
                      />
                    </label>
                    <label className="field">
                      <span>Email</span>
                      <input
                        type="email"
                        value={createForm.email}
                        onChange={(event) => patchCreate("email", event.target.value)}
                        placeholder="user@company.com"
                      />
                    </label>
                    <label className="field">
                      <span>Role</span>
                      <select
                        value={createForm.role}
                        onChange={(event) => setCreateRole(event.target.value as Role)}
                      >
                        {assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_PRESETS[role].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Temporary password</span>
                      <input
                        type="password"
                        value={createForm.password}
                        onChange={(event) => patchCreate("password", event.target.value)}
                        placeholder="Minimum 8 characters"
                        autoComplete="new-password"
                      />
                    </label>
                  </div>

                  <div className="stack-list">
                    {snapshot.locations.map((locationEntry) => (
                      <label key={locationEntry.id} className="list-row">
                        <div>
                          <strong>{locationEntry.name}</strong>
                          <p>
                            {locationEntry.code} - {locationEntry.city}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={createForm.assignedLocationIds.includes(locationEntry.id)}
                          onChange={() =>
                            patchCreate(
                              "assignedLocationIds",
                              toggleLocation(createForm.assignedLocationIds, locationEntry.id),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>

                  {canManagePermissionOverrides ? (
                    renderPermissionChecklist(
                      createForm.permissions,
                      createForm.role,
                      toggleCreatePermission,
                    )
                  ) : null}

                  <div className="button-row">
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={submitting === "create"}
                    >
                      {submitting === "create" ? "Creating..." : "Create user"}
                    </button>
                  </div>
                </form>
                ) : null}

                {selectedUser && editForm ? (
                  <>
                    {canEditUsers ? (
                    <form className="page-stack" onSubmit={handleUpdateUser}>
                      <div className="panel-heading compact-heading">
                        <div>
                          <p className="eyebrow">Edit User</p>
                          <h3>{selectedUser.name}</h3>
                        </div>
                      </div>
                      <div className="form-grid">
                        <label className="field">
                          <span>Name</span>
                          <input
                            value={editForm.name}
                            onChange={(event) => patchEdit("name", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>Username</span>
                          <input
                            value={editForm.username}
                            onChange={(event) => patchEdit("username", event.target.value)}
                            autoComplete="username"
                          />
                        </label>
                        <label className="field">
                          <span>Email</span>
                          <input
                            type="email"
                            value={editForm.email}
                            onChange={(event) => patchEdit("email", event.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span>Role</span>
                          <select
                            value={editForm.role}
                            onChange={(event) => setEditRole(event.target.value as Role)}
                          >
                            {assignableRoles.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_PRESETS[role].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Status</span>
                          <select
                            value={editForm.status}
                            onChange={(event) =>
                              patchEdit("status", event.target.value as User["status"])
                            }
                          >
                            <option value="active">Active</option>
                            <option value="invited">Inactive</option>
                          </select>
                        </label>
                      </div>

                      <div className="stack-list">
                        {snapshot.locations.map((locationEntry) => (
                          <label key={locationEntry.id} className="list-row">
                            <div>
                              <strong>{locationEntry.name}</strong>
                              <p>
                                {locationEntry.code} - {locationEntry.city}
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={editForm.assignedLocationIds.includes(locationEntry.id)}
                              onChange={() =>
                                patchEdit(
                                  "assignedLocationIds",
                                  toggleLocation(editForm.assignedLocationIds, locationEntry.id),
                                )
                              }
                            />
                          </label>
                        ))}
                      </div>

                      {canManagePermissionOverrides ? (
                        renderPermissionChecklist(
                          editForm.permissions,
                          editForm.role,
                          toggleEditPermission,
                        )
                      ) : null}

                      <div className="button-row">
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={submitting === "update"}
                        >
                          {submitting === "update" ? "Saving..." : "Save changes"}
                        </button>
                      </div>
                    </form>
                    ) : null}

                    {canResetUserPasswords ? (
                      <form className="page-stack" onSubmit={handleResetPassword}>
                        <div className="panel-heading compact-heading">
                          <div>
                            <p className="eyebrow">Password Reset</p>
                            <h3>Reset {selectedUser.name}&apos;s password</h3>
                          </div>
                        </div>
                        <div className="form-grid">
                          <label className="field field-wide">
                            <span>New password</span>
                            <input
                              type="password"
                              value={newPassword}
                              onChange={(event) => setNewPassword(event.target.value)}
                              placeholder="Minimum 8 characters"
                              autoComplete="new-password"
                            />
                          </label>
                        </div>
                        <div className="button-row">
                          <button
                            type="submit"
                            className="secondary-button"
                            disabled={submitting === "password"}
                          >
                            {submitting === "password" ? "Resetting..." : "Reset password"}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {canRemoveUsers ? (
                      <div className="page-stack">
                        <div className="panel-heading compact-heading">
                          <div>
                            <p className="eyebrow">User Removal</p>
                            <h3>Remove {selectedUser.name}</h3>
                          </div>
                        </div>
                        <div className="button-row">
                          <button
                            type="button"
                            className="secondary-button text-warning"
                            disabled={
                              selectedUser.id === currentUser.id ||
                              submitting === `remove:${selectedUser.id}`
                            }
                            onClick={() => void handleRemoveUser(selectedUser.id)}
                          >
                            {submitting === `remove:${selectedUser.id}` ? "Removing..." : "Remove user"}
                          </button>
                        </div>
                        {selectedUser.id === currentUser.id ? (
                          <p className="helper-text">
                            Your own superadmin account cannot be removed while this session is active.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {feedback ? <p className="feedback-copy">{feedback}</p> : null}
              </div>
            ) : (
              <div className="stack-list">
                <div className="list-row">
                  <div>
                    <strong>Permission-managed actions</strong>
                    <p>
                      User management actions now depend on granular permissions granted by
                      superadmins.
                    </p>
                  </div>
                  <span className="status-chip neutral">Restricted</span>
                </div>
                <div className="list-row">
                  <div>
                    <strong>Your session</strong>
                    <p>
                      You can review configuration, permissions, and the audit stream, but account
                      changes require the right user and permission access grants.
                    </p>
                  </div>
                  <span className="status-chip neutral">{ROLE_PRESETS[currentUser.role].label}</span>
                </div>
              </div>
            )}
          </article>
        </section>
      ) : null}

      {activeSection.slug === "settings" ? (
        <section className="split-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Environment Controls</h2>
              </div>
              <span className="status-chip neutral">
                {canEditEnvironmentSettings
                  ? settingsDirty
                    ? "Unsaved changes"
                    : "Editable"
                  : "View only"}
              </span>
            </div>
            <div className="page-stack">
              <p className="helper-text">
                Control the live environment behavior used by offline mode, realtime sync,
                barcode workflows, FEFO enforcement, and alert thresholds.
              </p>
              <div className="table-toolbar" style={{ marginBottom: "16px", justifyContent: "flex-start" }}>
                <input
                  className="table-search"
                  style={{ maxWidth: "280px" }}
                  value={settingsForm.timezone}
                  disabled={!canEditEnvironmentSettings || submitting === "settings"}
                  onChange={(event) => patchSettings("timezone", event.target.value)}
                  placeholder="Timezone"
                />
                <input
                  type="number"
                  min="0"
                  value={settingsForm.lowStockThreshold}
                  disabled={!canEditEnvironmentSettings || submitting === "settings"}
                  onChange={(event) =>
                    patchSettings("lowStockThreshold", Number(event.target.value || 0))
                  }
                  placeholder="Low stock threshold"
                />
                <input
                  type="number"
                  min="0"
                  value={settingsForm.expiryAlertDays}
                  disabled={!canEditEnvironmentSettings || submitting === "settings"}
                  onChange={(event) =>
                    patchSettings("expiryAlertDays", Number(event.target.value || 0))
                  }
                  placeholder="Expiry alert days"
                />
              </div>
              <div className="stack-list">
                <label className="list-row">
                  <div>
                    <strong>Offline Mode</strong>
                    <p>IndexedDB queue and cached snapshots stay available during outages.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.enableOffline}
                    disabled={!canEditEnvironmentSettings || submitting === "settings"}
                    onChange={(event) => patchSettings("enableOffline", event.target.checked)}
                  />
                </label>
                <label className="list-row">
                  <div>
                    <strong>Realtime Sync</strong>
                    <p>WebSocket listeners keep shared stock events and dashboards up to date.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.enableRealtime}
                    disabled={!canEditEnvironmentSettings || submitting === "settings"}
                    onChange={(event) => patchSettings("enableRealtime", event.target.checked)}
                  />
                </label>
                <label className="list-row">
                  <div>
                    <strong>Barcode Capture</strong>
                    <p>Enable camera and handheld barcode workflows on supported devices.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.enableBarcode}
                    disabled={!canEditEnvironmentSettings || submitting === "settings"}
                    onChange={(event) => patchSettings("enableBarcode", event.target.checked)}
                  />
                </label>
                <label className="list-row">
                  <div>
                    <strong>Strict FEFO</strong>
                    <p>Force outbound flows to prioritize the earliest valid-expiry stock first.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsForm.strictFefo}
                    disabled={!canEditEnvironmentSettings || submitting === "settings"}
                    onChange={(event) => patchSettings("strictFefo", event.target.checked)}
                  />
                </label>
              </div>
              {settingsFeedback ? <p className="feedback-copy">{settingsFeedback}</p> : null}
              {canEditEnvironmentSettings ? (
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={!settingsDirty || submitting === "settings"}
                    onClick={() => {
                      setSettingsForm(buildSettingsState(snapshot));
                      setSettingsFeedback(undefined);
                    }}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    disabled={!settingsDirty || submitting === "settings"}
                    onClick={() => void handleSaveSettings()}
                  >
                    {submitting === "settings" ? "Saving..." : "Save environment"}
                  </button>
                </div>
              ) : (
                <p className="helper-text">
                  Grant <strong>Edit environment settings</strong> to let this user change these
                  controls.
                </p>
              )}
            </div>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Permission Matrix</p>
                <h2>Role Permission Editor</h2>
              </div>
              <span className="status-chip neutral">
                {canEditRolePermissions ? "Editable" : "View only"}
              </span>
            </div>
            <div className="page-stack">
              <p className="helper-text">
                Every role now shows its individual permissions. Changes here update the default
                access granted by that role, while user-specific overrides stay separate.
              </p>
              {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => renderRolePermissionEditor(role))}
              {feedback ? <p className="feedback-copy">{feedback}</p> : null}
            </div>
          </article>
        </section>
      ) : null}

      {activeSection.slug === "activity" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Audit Stream</p>
              <h2>Recent Activity</h2>
            </div>
          </div>
          <div className="table-toolbar" style={{ marginBottom: "16px", justifyContent: "flex-start" }}>
            <input
              className="table-search"
              value={activitySearch}
              onChange={(event) => setActivitySearch(event.target.value)}
              placeholder="Search title, detail, or actor"
            />
            <select
              value={activityModuleFilter}
              onChange={(event) =>
                setActivityModuleFilter(
                  event.target.value as "all" | InventorySnapshot["activity"][number]["module"],
                )
              }
            >
              <option value="all">All modules</option>
              <option value="dashboard">Dashboard</option>
              <option value="inventoryOps">Inventory OPS</option>
              <option value="masterData">Master Data</option>
              <option value="reports">Reports</option>
              <option value="administration">Administration</option>
            </select>
            <select
              value={activityDatePreset}
              onChange={(event) => setActivityDatePreset(event.target.value as DateFilterPreset)}
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {activityDatePreset === "custom" ? (
              <>
                <input
                  type="date"
                  value={activityStartDate}
                  onChange={(event) => setActivityStartDate(event.target.value)}
                />
                <input
                  type="date"
                  value={activityEndDate}
                  onChange={(event) => setActivityEndDate(event.target.value)}
                />
              </>
            ) : null}
          </div>
          <div className="timeline">
            {filteredActivity.slice(0, 16).map((entry) => (
              <div key={entry.id} className="timeline-item">
                <div className={`timeline-dot tone-${entry.severity}`} />
                <div>
                  <strong>{entry.title}</strong>
                  <p>{entry.detail}</p>
                  <small>
                    {entry.actorName} - {entry.module} - {formatDateTime(entry.createdAt)}
                  </small>
                </div>
              </div>
            ))}
            {filteredActivity.length === 0 ? (
              <p className="empty-copy">No activity matched the current filters.</p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
