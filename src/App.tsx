import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { MODULES, ROLE_PRESETS, canAccessModule } from "../shared/permissions";
import { formatDateTime } from "./lib/format";
import { useThemePreference, type ThemeMode } from "./lib/useThemePreference";
import { useOmniStockApp } from "./lib/useOmniStockApp";
import { AdminPage } from "./pages/AdminPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InitializationPage } from "./pages/InitializationPage";
import { InventoryOpsPage } from "./pages/InventoryOpsPage";
import { LoginPage } from "./pages/LoginPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ReportsPage } from "./pages/ReportsPage";

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "Auto" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const PROFILE_VIEW = {
  label: "My Profile",
  description: "Update your personal information and password.",
};

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

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-panel">
          <p className="eyebrow">Warehouse Cloud Suite</p>
          <h1>OmniStock</h1>
          <p className="brand-copy">
            Offline-first inventory control with realtime warehouse sync, barcode-driven workflows,
            and role-based access.
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary navigation">
          {visibleModules.map((module) => (
            <NavLink
              key={module.key}
              to={module.path}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
              end={module.path === "/"}
            >
              <span>{module.label}</span>
              <small>{module.description}</small>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-card">
          <h2>Current Role</h2>
          <p className="role-pill">{ROLE_PRESETS[currentUser.role].label}</p>
          <p>{ROLE_PRESETS[currentUser.role].description}</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Live Workspace</p>
            <h2>{activeView?.label ?? "OmniStock"}</h2>
            <p className="topbar-copy">{activeView?.description}</p>
          </div>

          <div className="topbar-actions">
            <div className="theme-picker">
              <span>Theme</span>
              <div className="theme-toggle" role="group" aria-label="Theme mode">
                {THEME_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`chip-button theme-chip ${
                      themeMode === option.value ? "active" : ""
                    }`}
                    onClick={() => setThemeMode(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="theme-picker">
              <span>Signed in as</span>
              <div className="chip-row">
                <span className="status-chip neutral">{currentUser.name}</span>
                <span className="status-chip neutral">@{currentUser.username}</span>
                <span className="status-chip neutral">{ROLE_PRESETS[currentUser.role].label}</span>
              </div>
            </div>

            <NavLink
              to="/profile"
              className={({ isActive }) =>
                isActive ? "secondary-button topbar-link active" : "secondary-button topbar-link"
              }
            >
              Profile
            </NavLink>

            <button type="button" className="secondary-button" onClick={() => void refresh()}>
              Sync now
            </button>

            <button type="button" className="secondary-button" onClick={() => void logoutUser()}>
              Log out
            </button>
          </div>
        </header>

        <section className="status-row">
          <span className={`status-chip ${syncState.online ? "online" : "offline"}`}>
            {syncState.online ? "Online" : "Offline"}
          </span>
          <span
            className={`status-chip ${
              syncState.websocket === "connected" ? "online" : "neutral"
            }`}
          >
            Realtime: {syncState.websocket}
          </span>
          <span className="status-chip neutral">Queued changes: {syncState.queued}</span>
          <span className="status-chip neutral">Source: {syncState.source}</span>
          <span className="status-chip neutral">
            Last sync: {syncState.lastSyncedAt ? formatDateTime(syncState.lastSyncedAt) : "Waiting"}
          </span>
          {syncState.error ? <span className="status-chip warning">{syncState.error}</span> : null}
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
        {visibleModules.map((module) => (
          <NavLink
            key={module.key}
            to={module.path}
            className={({ isActive }) => (isActive ? "mobile-link active" : "mobile-link")}
            end={module.path === "/"}
          >
            {module.shortLabel}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
