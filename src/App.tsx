import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { MODULES, ROLE_PRESETS, can, canAccessModule } from "../shared/permissions";
import { expiredAlerts, inventoryAlerts, lowStockAlerts, nearExpiryAlerts } from "../shared/selectors";
import type { PermissionKey, RequestKind } from "../shared/types";
import { AppNotificationCenter } from "./components/AppNotificationCenter";
import {
  ActivityIcon,
  AdminIcon,
  AlertIcon,
  BellIcon,
  CloseIcon,
  CollapseIcon,
  DashboardIcon,
  DataIcon,
  InventoryIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  ProfileIcon,
  RefreshIcon,
  ReportsIcon,
  SunIcon,
} from "./components/AppIcons";
import { formatDateTime } from "./lib/format";
import { useOmniStockApp } from "./lib/useOmniStockApp";
import { useThemePreference } from "./lib/useThemePreference";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InitializationPage } from "./pages/InitializationPage";
import { InventoryOpsPage } from "./pages/InventoryOpsPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReportsPage } from "./pages/ReportsPage";

const PROFILE_VIEW = {
  label: "My Profile",
  description: "Update your personal information and password.",
};

const NAV_GROUPS: Array<{ label: string; moduleKeys: Array<(typeof MODULES)[number]["key"]> }> = [
  { label: "General", moduleKeys: ["dashboard"] },
  { label: "Operations", moduleKeys: ["inventoryOps"] },
  { label: "Data & Reports", moduleKeys: ["masterData", "reports"] },
  { label: "Administration", moduleKeys: ["administration"] },
];

const MODULE_ICONS = {
  dashboard: DashboardIcon,
  inventoryOps: InventoryIcon,
  masterData: DataIcon,
  reports: ReportsIcon,
  administration: AdminIcon,
} as const;

const OPERATION_SHORTCUTS = [
  {
    kind: "grn",
    label: "Receive Stock (GRN)",
    description: "Post inbound deliveries and supplier receipts.",
    permission: "inventory.grn",
    icon: PlusIcon,
  },
  {
    kind: "gin",
    label: "Issue Stock (GIN)",
    description: "Send stock out to outlets, kitchens, or service.",
    permission: "inventory.gin",
    icon: InventoryIcon,
  },
  {
    kind: "transfer",
    label: "Transfer Stock",
    description: "Move inventory between warehouses and outlets.",
    permission: "inventory.transfer",
    icon: RefreshIcon,
  },
  {
    kind: "adjustment",
    label: "Adjust Inventory",
    description: "Correct discrepancies with full audit notes.",
    permission: "inventory.adjustment",
    icon: DataIcon,
  },
  {
    kind: "stock-count",
    label: "Stock Count",
    description: "Record blind counts and recount adjustments.",
    permission: "inventory.count",
    icon: ActivityIcon,
  },
  {
    kind: "wastage",
    label: "Wastage Entry",
    description: "Log spoilage, expiry, and kitchen wastage.",
    permission: "inventory.wastage",
    icon: AlertIcon,
  },
] as const satisfies Array<{
  kind: RequestKind;
  label: string;
  description: string;
  permission: PermissionKey;
  icon: typeof PlusIcon;
}>;

type AlertFilter = "all" | "low-stock" | "near-expiry" | "expired";

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-card">
        <p className="eyebrow">OmniStock</p>
        <h1>Preparing your warehouse workspace</h1>
        <p>Loading cached inventory, reconnecting realtime sync, and checking your latest queue.</p>
      </div>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileAlertsOpen, setMobileAlertsOpen] = useState(false);
  const [mobileAlertFilter, setMobileAlertFilter] = useState<AlertFilter>("all");
  const {
    payload,
    syncState,
    authRequired,
    refresh,
    loginUser,
    activateSuperadminPassword,
    logoutUser,
    createOperation,
    createMarketPrice,
    initializeApp,
    updateProfile,
    changeProfilePassword,
    createUserAccount,
    updateUserAccount,
    resetAccountPassword,
    removeUserAccount,
  } = useOmniStockApp();
  const { themeMode, setThemeMode } = useThemePreference();

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileAlertsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen && !mobileAlertsOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileAlertsOpen, mobileMenuOpen]);

  if (!payload && authRequired) {
    return (
      <LoginPage
        syncState={syncState}
        onLogin={loginUser}
        onActivateSuperadmin={activateSuperadminPassword}
      />
    );
  }

  if (!payload) {
    return <LoadingScreen />;
  }

  if (payload.initialization.required) {
    return <InitializationPage syncState={syncState} onInitialize={initializeApp} />;
  }

  const { snapshot, currentUser } = payload;
  const visibleModules = MODULES.filter((module) => canAccessModule(currentUser, module.key));
  const defaultPath = visibleModules[0]?.path ?? "/";
  const viewingProfile = location.pathname.startsWith("/profile");
  const activeModule =
    visibleModules.find((module) =>
      module.path === "/" ? location.pathname === "/" : location.pathname.startsWith(module.path),
    ) ?? visibleModules[0];
  const activeView = viewingProfile ? PROFILE_VIEW : activeModule;
  const themeToggleLabel = themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const assignedCodes = snapshot.locations
    .filter((locationEntry) => currentUser.assignedLocationIds.includes(locationEntry.id))
    .map((locationEntry) => locationEntry.code)
    .join(", ");
  const allAlerts = inventoryAlerts(snapshot);
  const filteredMobileAlerts =
    mobileAlertFilter === "all"
      ? allAlerts
      : mobileAlertFilter === "low-stock"
        ? lowStockAlerts(snapshot)
        : mobileAlertFilter === "near-expiry"
          ? nearExpiryAlerts(snapshot)
          : expiredAlerts(snapshot);
  const activeInventoryKind = location.pathname.startsWith("/inventory")
    ? new URLSearchParams(location.search).get("kind")
    : null;
  const availableOperationShortcuts = OPERATION_SHORTCUTS.filter((shortcut) =>
    can(currentUser, shortcut.permission),
  );

  if (visibleModules.length === 0) {
    return (
      <div className="loading-screen">
        <div className="loading-card">
          <p className="eyebrow">Access Required</p>
          <h1>No modules are assigned to this user</h1>
          <p>Update the selected role permissions in Administration to continue.</p>
        </div>
      </div>
    );
  }

  const mobileRouteCandidates: Array<{
    key: string;
    label: string;
    to: string;
    end?: boolean;
    icon: typeof DashboardIcon;
  }> = [];

  if (canAccessModule(currentUser, "dashboard")) {
    mobileRouteCandidates.push({
      key: "home",
      label: "Home",
      to: "/",
      end: true,
      icon: DashboardIcon,
    });
  }

  const stockModule =
    visibleModules.find((module) => module.key === "masterData") ??
    visibleModules.find((module) => module.key === "reports") ??
    visibleModules.find((module) => module.key === "inventoryOps") ??
    visibleModules.find((module) => module.key === "administration");

  if (stockModule) {
    mobileRouteCandidates.push({
      key: "stock",
      label: "Stock",
      to: stockModule.path,
      end: stockModule.path === "/",
      icon: stockModule.key === "masterData" ? DataIcon : MODULE_ICONS[stockModule.key],
    });
  }

  if (canAccessModule(currentUser, "inventoryOps")) {
    mobileRouteCandidates.push({
      key: "ops",
      label: "Ops",
      to: "/inventory",
      icon: InventoryIcon,
    });
  }

  mobileRouteCandidates.push({
    key: "profile",
    label: "Profile",
    to: "/profile",
    icon: ProfileIcon,
  });

  const seenMobileRoutes = new Set<string>();
  const mobilePrimaryRoutes = mobileRouteCandidates.filter((candidate) => {
    if (seenMobileRoutes.has(candidate.to)) {
      return false;
    }

    seenMobileRoutes.add(candidate.to);
    return true;
  });

  const mobileNavRoutes = mobilePrimaryRoutes.slice(0, 3);

  function openMobileMenu() {
    setMobileAlertsOpen(false);
    setMobileMenuOpen(true);
  }

  function toggleMobileAlerts() {
    setMobileMenuOpen(false);
    setMobileAlertsOpen((current) => !current);
  }

  function handleOperationShortcut(kind: RequestKind) {
    navigate(`/inventory?kind=${encodeURIComponent(kind)}`);
    setMobileMenuOpen(false);
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="app-sidebar">
        <div className="app-brand">
          <div className="app-brand-mark">OS</div>
          <div className="app-brand-copy">
            <span className="app-brand-name">OmniStock</span>
            <small>Warehouse Management</small>
          </div>
        </div>

        <div className="sidebar-groups">
          {NAV_GROUPS.map((group) => {
            const groupModules = visibleModules.filter((module) => group.moduleKeys.includes(module.key));
            if (groupModules.length === 0) {
              return null;
            }

            return (
              <div key={group.label} className="sidebar-group">
                <p className="sidebar-group-label">{group.label}</p>
                <div className="sidebar-group-links">
                  {groupModules.map((module) => {
                    const Icon = MODULE_ICONS[module.key];
                    return (
                      <NavLink
                        key={module.key}
                        to={module.path}
                        className={({ isActive }) => (isActive ? "sidebar-link active" : "sidebar-link")}
                        end={module.path === "/"}
                      >
                        <Icon size={20} className="sidebar-link-icon" />
                        <span className="sidebar-link-label">{module.label}</span>
                        <span className="sidebar-link-indicator" />
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-role-card">
            <span className="sidebar-role-title">Current Role</span>
            <strong>{ROLE_PRESETS[currentUser.role].label}</strong>
            <p>{assignedCodes || "No locations assigned yet."}</p>
          </div>

          <div className="sidebar-footer-actions">
            <button
              type="button"
              className="sidebar-footer-button"
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
              aria-label={themeToggleLabel}
              title={themeToggleLabel}
            >
              {themeMode === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>

            <button
              type="button"
              className="sidebar-footer-button sidebar-footer-button-danger"
              onClick={() => void logoutUser()}
            >
              <LogoutIcon size={18} />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="mobile-header">
          <div className="mobile-header-brand">
            <div className="app-brand-mark mobile-brand-mark">OS</div>
            <div className="mobile-header-copy">
              <strong>OmniStock</strong>
              <small>{activeView?.label ?? "Workspace"}</small>
            </div>
          </div>

          <div className="mobile-header-actions">
            <button
              type="button"
              className={`mobile-sync-chip ${syncState.online ? "is-online" : "is-offline"}`}
              onClick={() => void refresh()}
            >
              <span className="mobile-sync-dot" />
              <span>{syncState.online ? "Live" : "Offline"}</span>
              <small>{syncState.queued}</small>
            </button>

            <button
              type="button"
              className="mobile-header-button"
              onClick={openMobileMenu}
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation menu"
            >
              <MenuIcon size={20} />
            </button>
          </div>
        </header>

        {mobileMenuOpen ? (
          <button
            type="button"
            className="mobile-scrim"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
        ) : null}

        {mobileAlertsOpen ? (
          <button
            type="button"
            className="mobile-scrim"
            aria-label="Close alerts"
            onClick={() => setMobileAlertsOpen(false)}
          />
        ) : null}

        <aside className={`mobile-drawer${mobileMenuOpen ? " open" : ""}`} aria-hidden={!mobileMenuOpen}>
          <div className="mobile-drawer-header">
            <div className="mobile-drawer-user">
              <div className="workspace-avatar">{currentUser.name.charAt(0).toUpperCase()}</div>
              <div>
                <strong>{currentUser.name}</strong>
                <small>
                  @{currentUser.username} - {ROLE_PRESETS[currentUser.role].label}
                </small>
              </div>
            </div>

            <button
              type="button"
              className="mobile-header-button"
              aria-label="Close menu"
              onClick={() => setMobileMenuOpen(false)}
            >
              <CloseIcon size={20} />
            </button>
          </div>

          <div className="mobile-drawer-meta">
            <span className="status-chip neutral">{assignedCodes || "No locations assigned yet."}</span>
            <span className="status-chip neutral">
              Last sync: {syncState.lastSyncedAt ? formatDateTime(syncState.lastSyncedAt) : "Waiting"}
            </span>
          </div>

          <div className="mobile-drawer-body">
            <section className="mobile-drawer-section">
              <p className="mobile-drawer-label">Navigation</p>
              <div className="mobile-drawer-list">
                {visibleModules.map((module) => {
                  const Icon = MODULE_ICONS[module.key];
                  return (
                    <NavLink
                      key={module.key}
                      to={module.path}
                      className={({ isActive }) =>
                        isActive ? "mobile-drawer-link active" : "mobile-drawer-link"
                      }
                      end={module.path === "/"}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Icon size={18} />
                      <span>{module.label}</span>
                    </NavLink>
                  );
                })}

                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    isActive ? "mobile-drawer-link active" : "mobile-drawer-link"
                  }
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <ProfileIcon size={18} />
                  <span>My Profile</span>
                </NavLink>
              </div>
            </section>

            {availableOperationShortcuts.length > 0 ? (
              <section className="mobile-drawer-section">
                <p className="mobile-drawer-label">Operations</p>
                <div className="mobile-drawer-list">
                  {availableOperationShortcuts.map((shortcut) => {
                    const Icon = shortcut.icon;
                    const isActive =
                      location.pathname.startsWith("/inventory") && activeInventoryKind === shortcut.kind;

                    return (
                      <button
                        key={shortcut.kind}
                        type="button"
                        className={isActive ? "mobile-drawer-link active" : "mobile-drawer-link"}
                        onClick={() => handleOperationShortcut(shortcut.kind)}
                      >
                        <Icon size={18} />
                        <div className="mobile-drawer-copy">
                          <span>{shortcut.label}</span>
                          <small>{shortcut.description}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          <div className="mobile-drawer-footer">
            <button type="button" className="mobile-drawer-action" onClick={() => void refresh()}>
              <RefreshIcon size={18} />
              <span>Sync now</span>
            </button>

            <button
              type="button"
              className="mobile-drawer-action"
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
            >
              {themeMode === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
              <span>{themeMode === "dark" ? "Light mode" : "Dark mode"}</span>
            </button>

            <button
              type="button"
              className="mobile-drawer-action mobile-drawer-action-danger"
              onClick={() => void logoutUser()}
            >
              <LogoutIcon size={18} />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <section className={`mobile-alert-sheet${mobileAlertsOpen ? " open" : ""}`}>
          <div className="mobile-alert-sheet-header">
            <div>
              <p className="eyebrow">Alerts</p>
              <h2>Inventory Notifications</h2>
            </div>
            <button
              type="button"
              className="mobile-header-button"
              aria-label="Close alerts"
              onClick={() => setMobileAlertsOpen(false)}
            >
              <CloseIcon size={20} />
            </button>
          </div>

          <div className="chip-row">
            {(["all", "low-stock", "near-expiry", "expired"] as AlertFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                className={mobileAlertFilter === option ? "chip-button active" : "chip-button"}
                onClick={() => setMobileAlertFilter(option)}
              >
                {option === "all" ? "All" : option.replace("-", " ")}
              </button>
            ))}
          </div>

          <div className="notification-list mobile-alert-list">
            {filteredMobileAlerts.length > 0 ? (
              filteredMobileAlerts.slice(0, 10).map((alert) => (
                <div key={alert.id} className="notification-item">
                  <div className="notification-icon">
                    {alert.kind === "low-stock" ? <AlertIcon size={16} /> : <BellIcon size={16} />}
                  </div>
                  <div className="notification-copy">
                    <strong>{alert.itemName}</strong>
                    <p>{alert.message}</p>
                    <small>
                      {alert.locationName}
                      {alert.expiryDate ? ` - ${formatDateTime(alert.expiryDate)}` : ""}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">No alerts match this filter right now.</p>
            )}
          </div>
        </section>

        <header className="workspace-header">
          <div className="workspace-header-main">
            <button
              type="button"
              className="toolbar-icon-button"
              onClick={() => setSidebarCollapsed((current) => !current)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <MenuIcon size={18} /> : <CollapseIcon size={18} />}
            </button>

            <div>
              <p className="eyebrow">Live Workspace</p>
              <h1 className="workspace-title">{activeView?.label ?? "OmniStock"}</h1>
              <p className="workspace-copy">{activeView?.description}</p>
            </div>
          </div>

          <div className="workspace-toolbar">
            <AppNotificationCenter snapshot={snapshot} />

            <button
              type="button"
              className="toolbar-icon-button"
              onClick={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
              aria-label={themeToggleLabel}
              title={themeToggleLabel}
            >
              {themeMode === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            </button>

            <button type="button" className="toolbar-button" onClick={() => void refresh()}>
              <RefreshIcon size={16} />
              <span>Sync now</span>
            </button>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                isActive ? "toolbar-button toolbar-button-active" : "toolbar-button"
              }
            >
              <ProfileIcon size={16} />
              <span>Profile</span>
            </NavLink>

            <NavLink to="/profile" className="workspace-user-card">
              <div className="workspace-user-copy">
                <strong>{currentUser.name}</strong>
                <small>
                  @{currentUser.username} - {ROLE_PRESETS[currentUser.role].label}
                </small>
              </div>
              <div className="workspace-avatar">{currentUser.name.charAt(0).toUpperCase()}</div>
            </NavLink>
          </div>
        </header>

        <section className="sync-strip">
          <span className={`sync-pill ${syncState.online ? "sync-pill-positive" : "sync-pill-warning"}`}>
            {syncState.online ? "Online" : "Offline mode"}
          </span>
          <span
            className={`sync-pill ${
              syncState.websocket === "connected" ? "sync-pill-positive" : "sync-pill-neutral"
            }`}
          >
            Realtime: {syncState.websocket}
          </span>
          <span className="sync-pill sync-pill-neutral">Queued: {syncState.queued}</span>
          <span className="sync-pill sync-pill-neutral">Source: {syncState.source}</span>
          <span className="sync-pill sync-pill-neutral">
            Last sync: {syncState.lastSyncedAt ? formatDateTime(syncState.lastSyncedAt) : "Waiting"}
          </span>
          {syncState.error ? <span className="sync-pill sync-pill-warning">{syncState.error}</span> : null}
        </section>

        <main className="content">
          <Routes>
            {canAccessModule(currentUser, "dashboard") ? (
              <Route
                path="/"
                element={
                  <DashboardPage
                    snapshot={snapshot}
                    currentUser={currentUser}
                    syncState={syncState}
                  />
                }
              />
            ) : null}

            {canAccessModule(currentUser, "inventoryOps") ? (
              <Route
                path="/inventory"
                element={
                  <InventoryOpsPage
                    snapshot={snapshot}
                    currentUser={currentUser}
                    syncState={syncState}
                    onCreateOperation={createOperation}
                  />
                }
              />
            ) : null}

            {canAccessModule(currentUser, "masterData") ? (
              <Route
                path="/master-data"
                element={
                  <MasterDataPage
                    snapshot={snapshot}
                    currentUser={currentUser}
                    onCreateMarketPrice={createMarketPrice}
                  />
                }
              />
            ) : null}

            {canAccessModule(currentUser, "reports") ? (
              <Route
                path="/reports"
                element={<ReportsPage snapshot={snapshot} currentUser={currentUser} />}
              />
            ) : null}

            {canAccessModule(currentUser, "administration") ? (
              <Route
                path="/administration"
                element={
                  <AdminPage
                    snapshot={snapshot}
                    currentUser={currentUser}
                    onCreateUser={createUserAccount}
                    onUpdateUser={updateUserAccount}
                    onResetUserPassword={resetAccountPassword}
                    onRemoveUser={removeUserAccount}
                  />
                }
              />
            ) : null}

            <Route
              path="/profile"
              element={
                <ProfilePage
                  snapshot={snapshot}
                  currentUser={currentUser}
                  onUpdateProfile={updateProfile}
                  onChangePassword={changeProfilePassword}
                />
              }
            />

            <Route path="*" element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {mobileNavRoutes.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => (isActive ? "mobile-link active" : "mobile-link")}
              end={item.end}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        <button
          type="button"
          className={mobileAlertsOpen ? "mobile-link active" : "mobile-link"}
          onClick={toggleMobileAlerts}
        >
          <BellIcon size={20} />
          <span>Alerts</span>
          {allAlerts.length > 0 ? (
            <small className="mobile-link-badge">{allAlerts.length > 9 ? "9+" : allAlerts.length}</small>
          ) : null}
        </button>
      </nav>
    </div>
  );
}
