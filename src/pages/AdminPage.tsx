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
  ReportPrintTemplate,
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
import { AdminIcon, DeleteIcon, EditIcon, PasswordIcon, PlusIcon } from "../components/AppIcons";
import { PrintDesigner } from "../components/PrintDesigner";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onCreateUser: (input: CreateUserRequest) => Promise<void>;
  onUpdateUser: (input: UpdateUserRequest) => Promise<void>;
  onUpdateSettings: (input: UpdateSettingsRequest) => Promise<void>;
  onUpdateRolePermissions: (input: UpdateRolePermissionsRequest) => Promise<void>;
  onResetUserPassword: (input: ResetUserPasswordRequest) => Promise<void>;
  onRemoveUser: (userId: string) => Promise<void>;
  onSendTestTelegramNotification: (message?: string) => Promise<{ ok: boolean; detail: string }>;
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
type SettingsTabKey = "environment" | "notifications" | "print" | "permissions";
type UserDialogMode = "create" | "edit" | "access" | "password" | "remove";

const FALLBACK_TIMEZONES = [
  "UTC",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Bangkok",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Australia/Sydney",
] as const;

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
    timeSource: snapshot.settings.timeSource,
    lowStockThreshold: snapshot.settings.lowStockThreshold,
    expiryAlertDays: snapshot.settings.expiryAlertDays,
    enableOffline: snapshot.settings.enableOffline,
    enableRealtime: snapshot.settings.enableRealtime,
    enableBarcode: snapshot.settings.enableBarcode,
    strictFefo: snapshot.settings.strictFefo,
    reportPrintTemplate: { ...snapshot.settings.reportPrintTemplate },
    notificationSettings: structuredClone(snapshot.settings.notificationSettings),
  };
}

function getTimezoneOptions(currentTimeZone: string): string[] {
  const supportedValuesOf = (
    Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
  ).supportedValuesOf;
  const base = supportedValuesOf ? supportedValuesOf("timeZone") : [...FALLBACK_TIMEZONES];
  return currentTimeZone && !base.includes(currentTimeZone) ? [currentTimeZone, ...base] : base;
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
  onSendTestTelegramNotification,
}: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? ADMIN_SECTIONS[0].slug;
  const visibleSections = ADMIN_SECTIONS.filter((section) =>
    section.slug === "settings"
      ? can(currentUser, "admin.settings") ||
        can(currentUser, "admin.environment.edit") ||
        can(currentUser, "admin.notifications.edit") ||
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
  const [settingsTab, setSettingsTab] = useState<SettingsTabKey>("environment");
  const [userDialogMode, setUserDialogMode] = useState<UserDialogMode | null>(null);
  const [selectedRoleDraft, setSelectedRoleDraft] = useState<Role>(currentUser.role);
  const [settingsFeedback, setSettingsFeedback] = useState<string>();
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState<string>();
  const canCreateUsers = can(currentUser, "admin.users.create");
  const canEditUsers = can(currentUser, "admin.users.edit");
  const canResetUserPasswords = can(currentUser, "admin.users.password");
  const canRemoveUsers = can(currentUser, "admin.users.remove");
  const canEditEnvironmentSettings = can(currentUser, "admin.environment.edit");
  const canEditNotificationSettings = can(currentUser, "admin.notifications.edit");
  const canEditRolePermissions = can(currentUser, "admin.permissions.edit");
  const canManagePermissionOverrides = can(currentUser, "admin.permissions.manage");
  const canDelegatePermissionAccess = currentUser.role === "superadmin";
  const canOpenAccessControl = canManagePermissionOverrides || canEditUsers;
  const assignableRoles = (Object.keys(ROLE_PRESETS) as Role[]).filter(
    (role) => currentUser.role === "superadmin" || role !== "superadmin",
  );
  const canManageUsers =
    canCreateUsers ||
    canEditUsers ||
    canResetUserPasswords ||
    canRemoveUsers ||
    canManagePermissionOverrides;
  const manageableUsers = useMemo(
    () =>
      currentUser.role === "superadmin"
        ? snapshot.users
        : snapshot.users.filter((user) => user.role !== "superadmin"),
    [currentUser.role, snapshot.users],
  );
  const selectedUser = useMemo(
    () => manageableUsers.find((user) => user.id === selectedUserId) ?? manageableUsers[0] ?? null,
    [manageableUsers, selectedUserId],
  );
  const timezoneOptions = useMemo(
    () => getTimezoneOptions(settingsForm.timezone || snapshot.settings.timezone),
    [settingsForm.timezone, snapshot.settings.timezone],
  );
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
  }, [snapshot.generatedAt]);

  useEffect(() => {
    setSelectedRoleDraft((current) =>
      (Object.keys(ROLE_PRESETS) as Role[]).includes(current) ? current : currentUser.role,
    );
  }, [currentUser.role]);

  useEffect(() => {
    if (!userDialogMode) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || submitting) {
        return;
      }

      setUserDialogMode(null);
      setNewPassword("");
      setFeedback(undefined);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [submitting, userDialogMode]);

  function patchCreate<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function patchEdit<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setEditForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function patchSettings<K extends keyof SettingsFormState>(key: K, value: SettingsFormState[K]) {
    setSettingsForm((current) => ({ ...current, [key]: value }));
  }

  function patchPrintTemplate<K extends keyof SettingsFormState["reportPrintTemplate"]>(
    key: K,
    value: SettingsFormState["reportPrintTemplate"][K],
  ) {
    setSettingsForm((current) => ({
      ...current,
      reportPrintTemplate: {
        ...current.reportPrintTemplate,
        [key]: value,
      },
    }));
  }

  function replacePrintTemplate(nextTemplate: ReportPrintTemplate) {
    setSettingsForm((current) => ({
      ...current,
      reportPrintTemplate: nextTemplate,
    }));
  }

  function patchNotificationSettings<K extends keyof SettingsFormState["notificationSettings"]>(
    key: K,
    value: SettingsFormState["notificationSettings"][K],
  ) {
    setSettingsForm((current) => ({
      ...current,
      notificationSettings: {
        ...current.notificationSettings,
        [key]: value,
      },
    }));
  }

  function patchNotificationRule(
    key: Exclude<
      keyof SettingsFormState["notificationSettings"],
      "telegramEnabled" | "telegramBotToken" | "telegramChatId" | "wastageCostThreshold" | "dailySummary"
    >,
    field: "enabled" | "inApp" | "telegram",
    value: boolean,
  ) {
    setSettingsForm((current) => ({
      ...current,
      notificationSettings: {
        ...current.notificationSettings,
        [key]: {
          ...current.notificationSettings[key],
          [field]: value,
        },
      },
    }));
  }

  function patchDailySummarySetting(
    field: "enabled" | "inApp" | "telegram" | "hour" | "scope",
    value: boolean | number | "warehouse" | "branch",
  ) {
    setSettingsForm((current) => ({
      ...current,
      notificationSettings: {
        ...current.notificationSettings,
        dailySummary: {
          ...current.notificationSettings.dailySummary,
          [field]: value,
        },
      },
    }));
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

  function closeUserDialog(force = false) {
    if (submitting && !force) {
      return;
    }

    setUserDialogMode(null);
    setNewPassword("");
  }

  function openCreateUserDialog() {
    if (!canCreateUsers) {
      return;
    }

    setCreateForm(buildCreateState(snapshot.rolePermissions));
    setFeedback(undefined);
    setNewPassword("");
    setUserDialogMode("create");
  }

  function openUserDialog(mode: Exclude<UserDialogMode, "create">, user: User) {
    if (user.role === "superadmin" && currentUser.role !== "superadmin") {
      return;
    }

    setSelectedUserId(user.id);
    setEditForm(buildEditState(user));
    setFeedback(undefined);
    setNewPassword("");
    setUserDialogMode(mode);
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
    JSON.stringify(settingsForm) !== JSON.stringify(buildSettingsState(snapshot));

  async function handleSaveSettings() {
    if (!canEditEnvironmentSettings && !canEditNotificationSettings) {
      return;
    }

    setSubmitting("settings");
    setSettingsFeedback(undefined);
    try {
      await onUpdateSettings(settingsForm);
      setSettingsFeedback("Settings updated successfully.");
    } catch (error) {
      setSettingsFeedback(
        error instanceof Error ? error.message : "Could not update the environment settings.",
      );
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handleSendTelegramTest() {
    if (!canEditNotificationSettings) {
      return;
    }

    setSubmitting("telegram-test");
    setSettingsFeedback(undefined);
    try {
      const result = await onSendTestTelegramNotification();
      setSettingsFeedback(result.detail);
    } catch (error) {
      setSettingsFeedback(
        error instanceof Error ? error.message : "Could not send the Telegram test message.",
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
          <div className="button-row role-editor-actions">
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
      closeUserDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the user.");
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handleUpdateUser(
    event: React.FormEvent<HTMLFormElement>,
    mode: "edit" | "access" = "edit",
  ) {
    event.preventDefault();
    if (!editForm) {
      return;
    }

    setSubmitting(mode === "access" ? "access" : "update");
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

      setFeedback(
        mode === "access"
          ? "User access controls updated successfully."
          : "User information updated successfully.",
      );
      closeUserDialog(true);
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : mode === "access"
            ? "Could not update the access controls."
            : "Could not update the user.",
      );
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
      closeUserDialog(true);
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

    setSubmitting(`remove:${userId}`);
    setFeedback(undefined);

    try {
      await onRemoveUser(userId);
      setFeedback(`${target.name} has been removed from active access.`);
      closeUserDialog(true);
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
        <section className="page-stack">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Users</p>
                <h2>Role Directory</h2>
              </div>
              {canCreateUsers ? (
                <button type="button" className="primary-button" onClick={openCreateUserDialog}>
                  <PlusIcon size={16} />
                  <span>Create User</span>
                </button>
              ) : null}
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
                    {canManageUsers ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.length ? (
                    filteredUsers.map((user) => {
                      const isLocked =
                        user.role === "superadmin" && currentUser.role !== "superadmin";

                      return (
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
                              <div className="row-action-group">
                                <button
                                  type="button"
                                  className="action-icon-button"
                                  title="Edit user"
                                  aria-label={`Edit ${user.name}`}
                                  disabled={!canEditUsers || isLocked}
                                  onClick={() => openUserDialog("edit", user)}
                                >
                                  <EditIcon size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="action-icon-button"
                                  title="Access control"
                                  aria-label={`Access control for ${user.name}`}
                                  disabled={!canOpenAccessControl || isLocked}
                                  onClick={() => openUserDialog("access", user)}
                                >
                                  <AdminIcon size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="action-icon-button"
                                  title="Change password"
                                  aria-label={`Change password for ${user.name}`}
                                  disabled={!canResetUserPasswords || isLocked}
                                  onClick={() => openUserDialog("password", user)}
                                >
                                  <PasswordIcon size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="action-icon-button danger"
                                  title="Remove user"
                                  aria-label={`Remove ${user.name}`}
                                  disabled={!canRemoveUsers || isLocked || user.id === currentUser.id}
                                  onClick={() => openUserDialog("remove", user)}
                                >
                                  <DeleteIcon size={16} />
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={canManageUsers ? 8 : 7} className="empty-cell">
                        No users matched the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {!canManageUsers ? (
              <p className="helper-text">
                This session can review the directory, but editing users and access control requires
                the matching admin permissions.
              </p>
            ) : null}
            {feedback ? <p className="feedback-copy">{feedback}</p> : null}
          </article>

          {userDialogMode ? (
            <div className="page-popup-scrim" onClick={() => closeUserDialog()}>
              <div
                className="page-popup-card admin-user-popup-card"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="panel-heading compact-heading">
                  <div>
                    <p className="eyebrow">
                      {userDialogMode === "create"
                        ? "Create User"
                        : userDialogMode === "edit"
                          ? "Edit User"
                          : userDialogMode === "access"
                            ? "Access Control"
                            : userDialogMode === "password"
                              ? "Password Change"
                            : "Remove User"}
                    </p>
                    <h3>
                      {userDialogMode === "create"
                        ? "Add a new account"
                        : selectedUser
                          ? selectedUser.name
                          : "User details"}
                    </h3>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => closeUserDialog()}
                  >
                    Cancel
                  </button>
                </div>

                {feedback ? <p className="feedback-copy">{feedback}</p> : null}

                {userDialogMode === "create" ? (
                  <form className="page-stack" onSubmit={handleCreateUser}>
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
                        type="button"
                        className="secondary-button"
                        onClick={() => closeUserDialog()}
                      >
                        Cancel
                      </button>
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

                {userDialogMode === "edit" && selectedUser && editForm ? (
                  <form
                    className="page-stack"
                    onSubmit={(event) => void handleUpdateUser(event, "edit")}
                  >
                    <div className="form-grid">
                      <label className="field">
                        <span>User ID</span>
                        <input value={editForm.userId} readOnly />
                      </label>
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

                    <div className="button-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => closeUserDialog()}
                      >
                        Cancel
                      </button>
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

                {userDialogMode === "access" && selectedUser && editForm ? (
                  <div className="page-stack">
                    <form
                      className="page-stack"
                      onSubmit={(event) => void handleUpdateUser(event, "access")}
                    >
                      <div className="form-grid">
                        <label className="field">
                          <span>User ID</span>
                          <input value={editForm.userId} readOnly />
                        </label>
                        <label className="field">
                          <span>Username</span>
                          <input value={editForm.username} readOnly />
                        </label>
                        <label className="field">
                          <span>Role</span>
                          <select
                            value={editForm.role}
                            disabled={!canEditUsers}
                            onChange={(event) => setEditRole(event.target.value as Role)}
                          >
                            {assignableRoles.map((role) => (
                              <option key={role} value={role}>
                                {ROLE_PRESETS[role].label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {canManagePermissionOverrides ? (
                        renderPermissionChecklist(
                          editForm.permissions,
                          editForm.role,
                          toggleEditPermission,
                        )
                      ) : (
                        <p className="helper-text">
                          This session cannot edit permission overrides for users.
                        </p>
                      )}

                      <div className="button-row">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => closeUserDialog()}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="primary-button"
                          disabled={
                            submitting === "access" ||
                            (!canManagePermissionOverrides && !canEditUsers)
                          }
                        >
                          {submitting === "access" ? "Saving..." : "Save access"}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : null}

                {userDialogMode === "password" && selectedUser ? (
                  <form className="page-stack" onSubmit={handleResetPassword}>
                    <div className="panel-heading compact-heading">
                      <div>
                        <p className="eyebrow">Password Reset</p>
                        <h3>Reset {selectedUser.name}&apos;s password</h3>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>User ID</span>
                        <input value={selectedUser.id} readOnly />
                      </label>
                      <label className="field">
                        <span>Username</span>
                        <input value={selectedUser.username} readOnly />
                      </label>
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
                        type="button"
                        className="secondary-button"
                        onClick={() => closeUserDialog()}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="primary-button"
                        disabled={submitting === "password"}
                      >
                        {submitting === "password" ? "Resetting..." : "Reset password"}
                      </button>
                    </div>
                  </form>
                ) : null}

                {userDialogMode === "remove" && selectedUser ? (
                  <div className="confirm-dialog">
                    <div className="page-stack" style={{ gap: "10px" }}>
                      <p className="helper-text">
                        This will remove {selectedUser.name} from active OmniStock access.
                      </p>
                      {selectedUser.id === currentUser.id ? (
                        <p className="helper-text">
                          Your own active superadmin session cannot be removed.
                        </p>
                      ) : null}
                    </div>
                    <div className="button-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => closeUserDialog()}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={
                          selectedUser.id === currentUser.id ||
                          submitting === `remove:${selectedUser.id}`
                        }
                        onClick={() => void handleRemoveUser(selectedUser.id)}
                      >
                        {submitting === `remove:${selectedUser.id}` ? "Removing..." : "Confirm remove"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

        </section>
      ) : null}

      {activeSection.slug === "settings" ? (
        <section className="page-stack">
          <div className="settings-tab-row" role="tablist" aria-label="Settings views">
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === "environment"}
              className={`settings-tab-button${settingsTab === "environment" ? " is-active" : ""}`}
              onClick={() => setSettingsTab("environment")}
            >
              Environment Controls
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === "print"}
              className={`settings-tab-button${settingsTab === "print" ? " is-active" : ""}`}
              onClick={() => setSettingsTab("print")}
            >
              Print Designer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === "notifications"}
              className={`settings-tab-button${settingsTab === "notifications" ? " is-active" : ""}`}
              onClick={() => setSettingsTab("notifications")}
            >
              Notifications
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={settingsTab === "permissions"}
              className={`settings-tab-button${settingsTab === "permissions" ? " is-active" : ""}`}
              onClick={() => setSettingsTab("permissions")}
            >
              Role Permission Editor
            </button>
          </div>

          {settingsTab === "environment" ? (
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
                  barcode workflows, FEFO enforcement, alert thresholds, and which clock source
                  OmniStock should trust.
                </p>
                <div className="settings-fields-grid">
                  <label className="settings-field-card">
                    <span className="settings-field-label">Timezone</span>
                    <select
                      value={settingsForm.timezone}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) => patchSettings("timezone", event.target.value)}
                    >
                      {timezoneOptions.map((timeZone) => (
                        <option key={timeZone} value={timeZone}>
                          {timeZone}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Time Source</span>
                    <select
                      value={settingsForm.timeSource}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchSettings("timeSource", event.target.value as SettingsFormState["timeSource"])
                      }
                    >
                      <option value="system">System time</option>
                      <option value="browser">Browser time</option>
                    </select>
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Low Stock Threshold</span>
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
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Expiry Alert Days</span>
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
                  </label>
                </div>
                <div className="settings-toggle-grid">
                  <label className="settings-toggle-card">
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
                  <label className="settings-toggle-card">
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
                  <label className="settings-toggle-card">
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
                  <label className="settings-toggle-card">
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
          ) : null}

          {settingsTab === "notifications" ? (
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Notification Delivery</h2>
                </div>
                <span className="status-chip neutral">
                  {canEditNotificationSettings
                    ? settingsDirty
                      ? "Unsaved changes"
                      : "Editable"
                    : "View only"}
                </span>
              </div>
              <div className="page-stack">
                <p className="helper-text">
                  Configure in-app and Telegram delivery for operational alerts, message wording,
                  and the default branch or warehouse summary schedule.
                </p>
                <div className="settings-dual-pane">
                  <div className="settings-pane-card">
                    <div className="panel-heading compact-heading">
                      <div>
                        <p className="eyebrow">Telegram Setup</p>
                        <h3>Bot and chat connection</h3>
                      </div>
                      <span className="status-chip neutral">
                        {settingsForm.notificationSettings.telegramEnabled &&
                        settingsForm.notificationSettings.telegramChatId.trim() &&
                        settingsForm.notificationSettings.telegramBotToken.trim()
                          ? "Ready to test"
                          : "Needs setup"}
                      </span>
                    </div>
                    <p className="helper-text">
                      Add your bot token here or keep using the Worker secret. Then connect the
                      target group or channel with a chat ID like <code>-1001234567890</code> or a
                      channel username like <code>@omnistock_alerts</code>.
                    </p>
                    <div className="settings-fields-grid">
                      <label className="settings-field-card">
                        <span className="settings-field-label">Telegram Delivery</span>
                        <select
                          value={settingsForm.notificationSettings.telegramEnabled ? "enabled" : "disabled"}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings(
                              "telegramEnabled",
                              event.target.value === "enabled",
                            )
                          }
                        >
                          <option value="disabled">Disabled</option>
                          <option value="enabled">Enabled</option>
                        </select>
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Telegram Bot Token</span>
                        <input
                          type="password"
                          value={settingsForm.notificationSettings.telegramBotToken}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings("telegramBotToken", event.target.value)
                          }
                          placeholder="123456:ABC..."
                        />
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Telegram Chat ID</span>
                        <input
                          value={settingsForm.notificationSettings.telegramChatId}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings("telegramChatId", event.target.value)
                          }
                          placeholder="-1001234567890"
                        />
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Wastage Threshold</span>
                        <input
                          type="number"
                          min="0"
                          value={settingsForm.notificationSettings.wastageCostThreshold}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings(
                              "wastageCostThreshold",
                              Number(event.target.value || 0),
                            )
                          }
                        />
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Daily Summary Hour</span>
                        <input
                          type="number"
                          min="0"
                          max="23"
                          value={settingsForm.notificationSettings.dailySummary.hour}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchDailySummarySetting("hour", Number(event.target.value || 0))
                          }
                        />
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Daily Summary Scope</span>
                        <select
                          value={settingsForm.notificationSettings.dailySummary.scope}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchDailySummarySetting(
                              "scope",
                              event.target.value as "warehouse" | "branch",
                            )
                          }
                        >
                          <option value="warehouse">Warehouse</option>
                          <option value="branch">Branch / outlet</option>
                        </select>
                      </label>
                    </div>
                    <div className="settings-fields-grid compact-grid">
                      <label className="settings-field-card">
                        <span className="settings-field-label">Telegram Header</span>
                        <input
                          value={settingsForm.notificationSettings.style.telegramHeader}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings("style", {
                              ...settingsForm.notificationSettings.style,
                              telegramHeader: event.target.value,
                            })
                          }
                          placeholder="OmniStock Alert"
                        />
                      </label>
                      <label className="settings-field-card">
                        <span className="settings-field-label">Telegram Footer</span>
                        <input
                          value={settingsForm.notificationSettings.style.telegramFooter}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchNotificationSettings("style", {
                              ...settingsForm.notificationSettings.style,
                              telegramFooter: event.target.value,
                            })
                          }
                          placeholder="Powered by OmniStock"
                        />
                      </label>
                    </div>
                    <label className="settings-toggle-card">
                      <div>
                        <strong>Include Timestamp</strong>
                        <p>Add the send time to Telegram messages.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settingsForm.notificationSettings.style.includeTimestamp}
                        disabled={!canEditNotificationSettings || submitting === "settings"}
                        onChange={(event) =>
                          patchNotificationSettings("style", {
                            ...settingsForm.notificationSettings.style,
                            includeTimestamp: event.target.checked,
                          })
                        }
                      />
                    </label>
                    <div className="button-row" style={{ justifyContent: "flex-start" }}>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={
                          !canEditNotificationSettings ||
                          submitting === "telegram-test" ||
                          !settingsForm.notificationSettings.telegramEnabled ||
                          !settingsForm.notificationSettings.telegramChatId.trim()
                        }
                        onClick={() => void handleSendTelegramTest()}
                      >
                        {submitting === "telegram-test" ? "Sending..." : "Send Telegram Test"}
                      </button>
                    </div>
                  </div>

                  <div className="settings-pane-card">
                    <div className="panel-heading compact-heading">
                      <div>
                        <p className="eyebrow">Message Templates</p>
                        <h3>Notification wording</h3>
                      </div>
                    </div>
                    <p className="helper-text">
                      Use placeholders like <code>{"{{itemName}}"}</code>, <code>{"{{locationName}}"}</code>,{" "}
                      <code>{"{{quantity}}"}</code>, <code>{"{{lotCode}}"}</code>, <code>{"{{daysUntilExpiry}}"}</code>,{" "}
                      <code>{"{{reference}}"}</code>, <code>{"{{requestKind}}"}</code>, <code>{"{{message}}"}</code>,{" "}
                      <code>{"{{totalCost}}"}</code>, <code>{"{{movementCount}}"}</code>, and <code>{"{{wasteCost}}"}</code>.
                    </p>
                    <div className="notification-template-grid">
                      {(Object.entries(settingsForm.notificationSettings.templates) as Array<
                        [keyof typeof settingsForm.notificationSettings.templates, { title: string; body: string }]
                      >).map(([key, template]) => (
                        <div key={key} className="notification-template-card">
                          <strong>{key.replace(/-/g, " ")}</strong>
                          <label className="field field-wide">
                            <span>Title Template</span>
                            <input
                              value={template.title}
                              disabled={!canEditNotificationSettings || submitting === "settings"}
                              onChange={(event) =>
                                patchNotificationSettings("templates", {
                                  ...settingsForm.notificationSettings.templates,
                                  [key]: {
                                    ...template,
                                    title: event.target.value,
                                  },
                                })
                              }
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Body Template</span>
                            <textarea
                              value={template.body}
                              disabled={!canEditNotificationSettings || submitting === "settings"}
                              onChange={(event) =>
                                patchNotificationSettings("templates", {
                                  ...settingsForm.notificationSettings.templates,
                                  [key]: {
                                    ...template,
                                    body: event.target.value,
                                  },
                                })
                              }
                              rows={4}
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="button-row" style={{ justifyContent: "flex-start" }}>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={
                      !canEditNotificationSettings ||
                      submitting === "telegram-test" ||
                      !settingsForm.notificationSettings.telegramEnabled ||
                      !settingsForm.notificationSettings.telegramChatId.trim()
                    }
                    onClick={() => void handleSendTelegramTest()}
                  >
                    {submitting === "telegram-test"
                      ? "Sending..."
                      : "Send Telegram Test"}
                  </button>
                </div>

                <div className="stack-list">
                  {[
                    ["lowStock", "Low stock"],
                    ["nearExpiry", "Near expiry"],
                    ["expired", "Expired stock"],
                    ["approvalRequests", "Approval requests"],
                    ["failedSync", "Failed sync"],
                    ["wastageThresholdExceeded", "Wastage threshold"],
                  ].map(([key, label]) => {
                    const rule = settingsForm.notificationSettings[
                      key as keyof typeof settingsForm.notificationSettings
                    ] as { enabled: boolean; inApp: boolean; telegram: boolean };
                    return (
                      <div key={key} className="list-row">
                        <div>
                          <strong>{label}</strong>
                          <p>Control whether this alert is active and where it should be sent.</p>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            gap: "12px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <label className="inline-check">
                            <input
                              type="checkbox"
                              checked={rule.enabled}
                              disabled={!canEditNotificationSettings || submitting === "settings"}
                              onChange={(event) =>
                                patchNotificationRule(
                                  key as Exclude<
                                    keyof SettingsFormState["notificationSettings"],
                                    "telegramEnabled" | "telegramBotToken" | "telegramChatId" | "wastageCostThreshold" | "dailySummary"
                                  >,
                                  "enabled",
                                  event.target.checked,
                                )
                              }
                            />
                            <span>Enabled</span>
                          </label>
                          <label className="inline-check">
                            <input
                              type="checkbox"
                              checked={rule.inApp}
                              disabled={!canEditNotificationSettings || submitting === "settings"}
                              onChange={(event) =>
                                patchNotificationRule(
                                  key as Exclude<
                                    keyof SettingsFormState["notificationSettings"],
                                    "telegramEnabled" | "telegramBotToken" | "telegramChatId" | "wastageCostThreshold" | "dailySummary"
                                  >,
                                  "inApp",
                                  event.target.checked,
                                )
                              }
                            />
                            <span>In-app</span>
                          </label>
                          <label className="inline-check">
                            <input
                              type="checkbox"
                              checked={rule.telegram}
                              disabled={!canEditNotificationSettings || submitting === "settings"}
                              onChange={(event) =>
                                patchNotificationRule(
                                  key as Exclude<
                                    keyof SettingsFormState["notificationSettings"],
                                    "telegramEnabled" | "telegramBotToken" | "telegramChatId" | "wastageCostThreshold" | "dailySummary"
                                  >,
                                  "telegram",
                                  event.target.checked,
                                )
                              }
                            />
                            <span>Telegram</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  <div className="list-row">
                    <div>
                      <strong>Daily summary</strong>
                      <p>Send a scheduled branch or warehouse digest at the selected hour.</p>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={settingsForm.notificationSettings.dailySummary.enabled}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchDailySummarySetting("enabled", event.target.checked)
                          }
                        />
                        <span>Enabled</span>
                      </label>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={settingsForm.notificationSettings.dailySummary.inApp}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchDailySummarySetting("inApp", event.target.checked)
                          }
                        />
                        <span>In-app</span>
                      </label>
                      <label className="inline-check">
                        <input
                          type="checkbox"
                          checked={settingsForm.notificationSettings.dailySummary.telegram}
                          disabled={!canEditNotificationSettings || submitting === "settings"}
                          onChange={(event) =>
                            patchDailySummarySetting("telegram", event.target.checked)
                          }
                        />
                        <span>Telegram</span>
                      </label>
                    </div>
                  </div>
                </div>

                {settingsFeedback ? <p className="feedback-copy">{settingsFeedback}</p> : null}
                {canEditNotificationSettings ? (
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
                      {submitting === "settings" ? "Saving..." : "Save notification settings"}
                    </button>
                  </div>
                ) : (
                  <p className="helper-text">
                    Grant <strong>Edit notification settings</strong> to let this user manage
                    Telegram delivery and alert rules.
                  </p>
                )}
              </div>
            </article>
          ) : null}

          {settingsTab === "print" ? (
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Settings</p>
                  <h2>Default Print Designer</h2>
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
                  Design the default report template used when OmniStock generates or prints
                  reports. This becomes the workspace-wide template for report output.
                </p>

                <div className="settings-dual-pane">
                  <div className="settings-pane-card">
                    <div className="panel-heading compact-heading">
                      <div>
                        <p className="eyebrow">Template Setup</p>
                        <h3>Canvas editing</h3>
                      </div>
                    </div>
                    <p className="helper-text">
                      Use the A4 canvas to move fields by X/Y position, change their Z layer, and
                      resize width and height before saving the default template.
                    </p>
                    <div className="settings-fields-grid compact-grid">
                      <div className="settings-field-card">
                        <span className="settings-field-label">Preview Mode</span>
                        <strong>
                          {settingsForm.reportPrintTemplate.paperSize.toUpperCase()} ·{" "}
                          {settingsForm.reportPrintTemplate.orientation}
                        </strong>
                      </div>
                      <div className="settings-field-card">
                        <span className="settings-field-label">Editing Tools</span>
                        <strong>Drag · X/Y/Z · Width · Height</strong>
                      </div>
                    </div>
                  </div>

                  <div className="settings-pane-card">
                    <PrintDesigner
                      template={settingsForm.reportPrintTemplate}
                      companyName={snapshot.settings.companyName}
                      generatedBy={currentUser.name}
                      timeSourceLabel={
                        settingsForm.timeSource === "system" ? "System clock" : "Browser clock"
                      }
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={replacePrintTemplate}
                    />
                  </div>
                </div>

                <div className="settings-fields-grid">
                  <label className="settings-field-card">
                    <span className="settings-field-label">Template Name</span>
                    <input
                      value={settingsForm.reportPrintTemplate.templateName}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("templateName", event.target.value)
                      }
                      placeholder="OmniStock Standard"
                    />
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Accent Color</span>
                    <input
                      type="color"
                      value={settingsForm.reportPrintTemplate.accentColor}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("accentColor", event.target.value)
                      }
                    />
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Paper Size</span>
                    <select
                      value={settingsForm.reportPrintTemplate.paperSize}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate(
                          "paperSize",
                          event.target.value as SettingsFormState["reportPrintTemplate"]["paperSize"],
                        )
                      }
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                    </select>
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Orientation</span>
                    <select
                      value={settingsForm.reportPrintTemplate.orientation}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate(
                          "orientation",
                          event.target.value as SettingsFormState["reportPrintTemplate"]["orientation"],
                        )
                      }
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Density</span>
                    <select
                      value={settingsForm.reportPrintTemplate.density}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate(
                          "density",
                          event.target.value as SettingsFormState["reportPrintTemplate"]["density"],
                        )
                      }
                    >
                      <option value="comfortable">Comfortable</option>
                      <option value="compact">Compact</option>
                    </select>
                  </label>
                  <label className="settings-field-card">
                    <span className="settings-field-label">Margin (mm)</span>
                    <input
                      type="number"
                      min="6"
                      max="30"
                      value={settingsForm.reportPrintTemplate.marginMm}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("marginMm", Number(event.target.value || 0))
                      }
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="field field-wide">
                    <span>Header Note</span>
                    <input
                      value={settingsForm.reportPrintTemplate.headerNote}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("headerNote", event.target.value)
                      }
                      placeholder="Warehouse Intelligence Report"
                    />
                  </label>
                  <label className="field field-wide">
                    <span>Footer Note</span>
                    <input
                      value={settingsForm.reportPrintTemplate.footerNote}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("footerNote", event.target.value)
                      }
                      placeholder="Prepared in OmniStock"
                    />
                  </label>
                </div>

                <div className="settings-toggle-grid">
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Company Name</strong>
                      <p>Place the company name in the print header.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showCompanyName}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showCompanyName", event.target.checked)
                      }
                    />
                  </label>
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Generated By</strong>
                      <p>Show the report owner in the header meta block.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showGeneratedBy}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showGeneratedBy", event.target.checked)
                      }
                    />
                  </label>
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Generated At</strong>
                      <p>Include the report timestamp in the template header.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showGeneratedAt}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showGeneratedAt", event.target.checked)
                      }
                    />
                  </label>
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Filters</strong>
                      <p>Display the active report filters in the header summary.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showFilters}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showFilters", event.target.checked)
                      }
                    />
                  </label>
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Summary</strong>
                      <p>Lift the summary metrics to the top of the report output.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showSummary}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showSummary", event.target.checked)
                      }
                    />
                  </label>
                  <label className="settings-toggle-card">
                    <div>
                      <strong>Show Signatures</strong>
                      <p>Add prepared-by and approved-by sign-off lines at the end.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settingsForm.reportPrintTemplate.showSignatures}
                      disabled={!canEditEnvironmentSettings || submitting === "settings"}
                      onChange={(event) =>
                        patchPrintTemplate("showSignatures", event.target.checked)
                      }
                    />
                  </label>
                </div>

                {settingsForm.reportPrintTemplate.showSignatures ? (
                  <div className="settings-fields-grid">
                    <label className="settings-field-card">
                      <span className="settings-field-label">Left Signature Label</span>
                      <input
                        value={settingsForm.reportPrintTemplate.signatureLabelLeft}
                        disabled={!canEditEnvironmentSettings || submitting === "settings"}
                        onChange={(event) =>
                          patchPrintTemplate("signatureLabelLeft", event.target.value)
                        }
                        placeholder="Prepared by"
                      />
                    </label>
                    <label className="settings-field-card">
                      <span className="settings-field-label">Right Signature Label</span>
                      <input
                        value={settingsForm.reportPrintTemplate.signatureLabelRight}
                        disabled={!canEditEnvironmentSettings || submitting === "settings"}
                        onChange={(event) =>
                          patchPrintTemplate("signatureLabelRight", event.target.value)
                        }
                        placeholder="Approved by"
                      />
                    </label>
                  </div>
                ) : null}

                <div
                  style={{
                    border: "1px solid var(--border-subtle, rgba(148, 163, 184, 0.28))",
                    borderRadius: "18px",
                    padding: "18px",
                    background: "rgba(37, 99, 235, 0.05)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                      borderBottom: `2px solid ${settingsForm.reportPrintTemplate.accentColor}`,
                      paddingBottom: "14px",
                    }}
                  >
                    <div>
                      <p className="eyebrow" style={{ color: settingsForm.reportPrintTemplate.accentColor }}>
                        {settingsForm.reportPrintTemplate.templateName}
                      </p>
                      <h3 style={{ marginTop: "8px" }}>Report Preview</h3>
                      <p className="helper-text" style={{ marginTop: "6px" }}>
                        {settingsForm.reportPrintTemplate.headerNote || "Warehouse Intelligence Report"}
                      </p>
                    </div>
                    <span className="status-chip neutral">
                      {settingsForm.reportPrintTemplate.paperSize.toUpperCase()} · {settingsForm.reportPrintTemplate.orientation}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: "12px",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      marginTop: "16px",
                    }}
                  >
                    {settingsForm.reportPrintTemplate.showCompanyName ? (
                      <div className="list-row">
                        <div>
                          <strong>Company</strong>
                          <p>{snapshot.settings.companyName}</p>
                        </div>
                      </div>
                    ) : null}
                    {settingsForm.reportPrintTemplate.showGeneratedBy ? (
                      <div className="list-row">
                        <div>
                          <strong>Generated by</strong>
                          <p>{currentUser.name}</p>
                        </div>
                      </div>
                    ) : null}
                    {settingsForm.reportPrintTemplate.showGeneratedAt ? (
                      <div className="list-row">
                        <div>
                          <strong>Generated at</strong>
                          <p>{settingsForm.timeSource === "system" ? "System clock" : "Browser clock"}</p>
                        </div>
                      </div>
                    ) : null}
                    {settingsForm.reportPrintTemplate.showFilters ? (
                      <div className="list-row">
                        <div>
                          <strong>Filters</strong>
                          <p>Visible in report header</p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <p className="helper-text" style={{ marginTop: "16px" }}>
                    Footer: {settingsForm.reportPrintTemplate.footerNote || "OmniStock report output"}
                  </p>
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
                      {submitting === "settings" ? "Saving..." : "Save print template"}
                    </button>
                  </div>
                ) : (
                  <p className="helper-text">
                    Grant <strong>Edit environment settings</strong> to let this user change the
                    default report template.
                  </p>
                )}
              </div>
            </article>
          ) : null}

          {settingsTab === "permissions" ? (
            <section className="page-stack">
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
                    Select a role to review or edit its exact permission set. User-specific
                    overrides stay separate from these defaults.
                  </p>
                  <div className="settings-role-toolbar">
                    <label className="settings-role-picker">
                      <span className="settings-field-label">Role</span>
                      <select
                        value={selectedRoleDraft}
                        onChange={(event) => setSelectedRoleDraft(event.target.value as Role)}
                      >
                        {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => (
                          <option key={role} value={role}>
                            {ROLE_PRESETS[role].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="status-chip neutral">
                      {permissionCountLabel(
                        selectedRoleDraft === "superadmin"
                          ? snapshot.rolePermissions.superadmin
                          : rolePermissionDrafts[selectedRoleDraft],
                      )}
                    </span>
                  </div>
                </div>
              </article>
              {renderRolePermissionEditor(selectedRoleDraft)}
              {feedback ? <p className="feedback-copy">{feedback}</p> : null}
            </section>
          ) : null}
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
