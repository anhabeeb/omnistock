import { useEffect, useMemo, useState } from "react";
import { MODULE_ACCESS, MODULES, ROLE_PRESETS } from "../../shared/permissions";
import type {
  CreateUserRequest,
  InventorySnapshot,
  ResetUserPasswordRequest,
  Role,
  UpdateUserRequest,
  User,
} from "../../shared/types";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onCreateUser: (input: CreateUserRequest) => Promise<void>;
  onUpdateUser: (input: UpdateUserRequest) => Promise<void>;
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
}

interface CreateFormState {
  name: string;
  username: string;
  email: string;
  role: Role;
  password: string;
  assignedLocationIds: string[];
}

function roleHasModule(role: Role, moduleKey: keyof typeof MODULE_ACCESS): boolean {
  return MODULE_ACCESS[moduleKey].some((permission) =>
    ROLE_PRESETS[role].permissions.includes(permission),
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
  };
}

function buildCreateState(): CreateFormState {
  return {
    name: "",
    username: "",
    email: "",
    role: "worker",
    password: "",
    assignedLocationIds: [],
  };
}

function toggleLocation(assignedLocationIds: string[], locationId: string): string[] {
  return assignedLocationIds.includes(locationId)
    ? assignedLocationIds.filter((value) => value !== locationId)
    : [...assignedLocationIds, locationId];
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

export function AdminPage({
  snapshot,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onResetUserPassword,
  onRemoveUser,
}: Props) {
  const [selectedUserId, setSelectedUserId] = useState(snapshot.users[0]?.id ?? "");
  const [createForm, setCreateForm] = useState<CreateFormState>(buildCreateState);
  const [editForm, setEditForm] = useState<UserFormState | null>(
    snapshot.users[0] ? buildEditState(snapshot.users[0]) : null,
  );
  const [newPassword, setNewPassword] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState<string>();
  const isSuperadmin = currentUser.role === "superadmin";

  const selectedUser = useMemo(
    () => snapshot.users.find((user) => user.id === selectedUserId) ?? snapshot.users[0] ?? null,
    [selectedUserId, snapshot.users],
  );

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(null);
      return;
    }

    setSelectedUserId(selectedUser.id);
    setEditForm(buildEditState(selectedUser));
  }, [selectedUser]);

  function patchCreate<K extends keyof CreateFormState>(key: K, value: CreateFormState[K]) {
    setCreateForm((current) => ({ ...current, [key]: value }));
  }

  function patchEdit<K extends keyof UserFormState>(key: K, value: UserFormState[K]) {
    setEditForm((current) => (current ? { ...current, [key]: value } : current));
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
      });

      setCreateForm(buildCreateState());
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

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Governance</p>
          <h1>Administration</h1>
          <p className="hero-copy">
            Users, settings, and audit activity live here. The current session is running as{" "}
            {currentUser.name}, and access is granted according to the{" "}
            {ROLE_PRESETS[currentUser.role].label} preset.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>Users</span>
            <strong>{snapshot.users.length}</strong>
            <small>Profiles participating in shared warehouse operations</small>
          </div>
          <div className="meta-card">
            <span>Audit events</span>
            <strong>{snapshot.activity.length}</strong>
            <small>Recent tracked activity visible in the local feed</small>
          </div>
        </div>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Users</p>
              <h2>Role Directory</h2>
            </div>
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
                  {isSuperadmin ? <th>Manage</th> : null}
                </tr>
              </thead>
              <tbody>
                {snapshot.users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      {user.name}
                      <br />
                      <small>{user.email}</small>
                    </td>
                    <td>{user.username}</td>
                    <td>{ROLE_PRESETS[user.role].label}</td>
                    <td>{statusLabel(user.status)}</td>
                    <td>{user.assignedLocationIds.length}</td>
                    <td>{user.permissions.length}</td>
                    <td>{formatDateTime(user.lastSeenAt)}</td>
                    {isSuperadmin ? (
                      <td>
                        <button
                          type="button"
                          className={selectedUserId === user.id ? "chip-button active" : "chip-button"}
                          onClick={() => setSelectedUserId(user.id)}
                        >
                          {selectedUserId === user.id ? "Selected" : "Manage"}
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
              <p className="eyebrow">{isSuperadmin ? "User Control" : "Access Notice"}</p>
              <h2>{isSuperadmin ? "Superadmin Controls" : "Read-only session"}</h2>
            </div>
          </div>

          {isSuperadmin ? (
            <div className="page-stack">
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
                      onChange={(event) => patchCreate("role", event.target.value as Role)}
                    >
                      {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => (
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
                  {snapshot.locations.map((location) => (
                    <label key={location.id} className="list-row">
                      <div>
                        <strong>{location.name}</strong>
                        <p>
                          {location.code} - {location.city}
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={createForm.assignedLocationIds.includes(location.id)}
                        onChange={() =>
                          patchCreate(
                            "assignedLocationIds",
                            toggleLocation(createForm.assignedLocationIds, location.id),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>

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

              {selectedUser && editForm ? (
                <>
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
                          onChange={(event) => patchEdit("role", event.target.value as Role)}
                        >
                          {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => (
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
                      {snapshot.locations.map((location) => (
                        <label key={location.id} className="list-row">
                          <div>
                            <strong>{location.name}</strong>
                            <p>
                              {location.code} - {location.city}
                            </p>
                          </div>
                          <input
                            type="checkbox"
                            checked={editForm.assignedLocationIds.includes(location.id)}
                            onChange={() =>
                              patchEdit(
                                "assignedLocationIds",
                                toggleLocation(editForm.assignedLocationIds, location.id),
                              )
                            }
                          />
                        </label>
                      ))}
                    </div>

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
                  </form>
                </>
              ) : null}

              {feedback ? <p className="feedback-copy">{feedback}</p> : null}
            </div>
          ) : (
            <div className="stack-list">
              <div className="list-row">
                <div>
                  <strong>Superadmin-only actions</strong>
                  <p>Create users, edit profiles, reset passwords, and remove accounts from here.</p>
                </div>
                <span className="status-chip neutral">Restricted</span>
              </div>
              <div className="list-row">
                <div>
                  <strong>Your session</strong>
                  <p>
                    You can review configuration, permissions, and the audit stream, but user access
                    changes require a superadmin.
                  </p>
                </div>
                <span className="status-chip neutral">{ROLE_PRESETS[currentUser.role].label}</span>
              </div>
            </div>
          )}
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Settings</p>
              <h2>Environment Toggles</h2>
            </div>
          </div>
          <div className="stack-list">
            <div className="list-row">
              <div>
                <strong>Timezone</strong>
                <p>{snapshot.settings.timezone}</p>
              </div>
              <span className="status-chip neutral">Clock</span>
            </div>
            <div className="list-row">
              <div>
                <strong>Expiry Alert Window</strong>
                <p>Batches nearing expiry are flagged this many days before cut-off.</p>
              </div>
              <span className="status-chip neutral">{snapshot.settings.expiryAlertDays} days</span>
            </div>
            <div className="list-row">
              <div>
                <strong>FEFO Enforcement</strong>
                <p>Outbound stock issues prioritize the earliest valid expiry before fresher lots.</p>
              </div>
              <span className="status-chip neutral">
                {snapshot.settings.strictFefo ? "Enabled" : "Advisory"}
              </span>
            </div>
            <div className="list-row">
              <div>
                <strong>Offline Mode</strong>
                <p>IndexedDB queue and cached snapshots stay available during outages.</p>
              </div>
              <span className="status-chip neutral">
                {snapshot.settings.enableOffline ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="list-row">
              <div>
                <strong>Realtime Sync</strong>
                <p>WebSocket channel listens for server-side stock events.</p>
              </div>
              <span className="status-chip neutral">
                {snapshot.settings.enableRealtime ? "Enabled" : "Disabled"}
              </span>
            </div>
            <div className="list-row">
              <div>
                <strong>Barcode Capture</strong>
                <p>Camera and handheld scanner workflows are enabled on supported devices.</p>
              </div>
              <span className="status-chip neutral">
                {snapshot.settings.enableBarcode ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Permission Matrix</p>
              <h2>Page Access by Role</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Role</th>
                  {MODULES.map((module) => (
                    <th key={module.key}>{module.shortLabel}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(ROLE_PRESETS) as Role[]).map((role) => (
                  <tr key={role}>
                    <td>{ROLE_PRESETS[role].label}</td>
                    {MODULES.map((module) => (
                      <td key={module.key}>{roleHasModule(role, module.key) ? "Yes" : "No"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Audit Stream</p>
            <h2>Recent Activity</h2>
          </div>
        </div>
        <div className="timeline">
          {snapshot.activity.slice(0, 8).map((entry) => (
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
        </div>
      </section>
    </div>
  );
}
