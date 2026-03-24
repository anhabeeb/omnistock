import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  alpha,
  Avatar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  Stack,
  ThemeProvider,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { MODULES, ROLE_PRESETS, canAccessModule } from "../shared/permissions";
import { inventoryAlerts } from "../shared/selectors";
import { AppNotificationCenter } from "./components/AppNotificationCenter";
import {
  AdminIcon,
  CloseIcon,
  DashboardIcon,
  DataIcon,
  InventoryIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  ProfileIcon,
  RefreshIcon,
  ReportsIcon,
  SunIcon,
} from "./components/AppIcons";
import { formatDateTime } from "./lib/format";
import { buildMuiTheme } from "./lib/muiTheme";
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

const MODULE_ENTRY_PATHS: Record<(typeof MODULES)[number]["key"], string> = {
  dashboard: "/",
  inventoryOps: "/inventory/grn",
  masterData: "/master-data/items",
  reports: "/reports/analytics",
  administration: "/administration/users",
};

const MODULE_SUBPAGES: Partial<
  Record<
    (typeof MODULES)[number]["key"],
    Array<{ label: string; path: string; description: string }>
  >
> = {
  inventoryOps: [
    { label: "GRN", path: "/inventory/grn", description: "Receive supplier stock and inbound batches." },
    { label: "GIN", path: "/inventory/gin", description: "Issue stock to outlets, kitchens, and requests." },
    { label: "Transfer", path: "/inventory/transfer", description: "Move stock between warehouses and outlets." },
    { label: "Adjustments", path: "/inventory/adjustments", description: "Correct stock variances with audit notes." },
    { label: "Stock Count", path: "/inventory/stock-count", description: "Count and reconcile physical inventory." },
    { label: "Wastage", path: "/inventory/wastage", description: "Capture spoilage, expiry, and waste control." },
  ],
  masterData: [
    { label: "Items", path: "/master-data/items", description: "Manage the item catalog and barcode details." },
    { label: "Suppliers", path: "/master-data/suppliers", description: "Review supplier contacts and lead times." },
    { label: "Warehouse & Outlets", path: "/master-data/locations", description: "Maintain operational facilities and outlets." },
    { label: "Market Prices", path: "/master-data/market-prices", description: "Track daily purchasing rates for restaurant items." },
  ],
  reports: [
    { label: "Analytics", path: "/reports/analytics", description: "Review KPI and report summaries." },
    { label: "Waste Tracker", path: "/reports/waste-tracker", description: "Inspect detailed waste history and costs." },
    { label: "Movement Ledger", path: "/reports/movement-ledger", description: "Audit stock movements and balance changes." },
  ],
  administration: [
    { label: "Users", path: "/administration/users", description: "Manage system users and account access." },
    { label: "Settings", path: "/administration/settings", description: "Review environment controls and permissions." },
    { label: "Activity", path: "/administration/activity", description: "Inspect recent audit and admin events." },
  ],
};

function moduleEntryPath(moduleKey: (typeof MODULES)[number]["key"]) {
  return MODULE_ENTRY_PATHS[moduleKey];
}

function moduleIsActive(pathname: string, modulePath: string) {
  return modulePath === "/" ? pathname === "/" : pathname.startsWith(modulePath);
}

function LoadingScreen() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
      <Paper sx={{ width: "min(560px, 100%)", p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
        <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
          OmniStock
        </Typography>
        <Typography variant="h4" sx={{ mt: 1 }}>
          Preparing your warehouse workspace
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
          Loading cached inventory, reconnecting realtime sync, and checking your latest queue.
        </Typography>
      </Paper>
    </Box>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuAnchor, setProfileMenuAnchor] = useState<HTMLElement | null>(null);
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
  const { themeMode, resolvedTheme, setThemeMode } = useThemePreference();
  const muiTheme = useMemo(() => buildMuiTheme(resolvedTheme), [resolvedTheme]);
  const isTabletOrMobile = useMediaQuery(muiTheme.breakpoints.down("lg"));
  const profileMenuOpen = Boolean(profileMenuAnchor);
  const themeToggleLabel = themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode";

  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileMenuAnchor(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);

  let content: React.ReactNode;

  if (!payload && authRequired) {
    content = (
      <LoginPage
        syncState={syncState}
        onLogin={loginUser}
        onActivateSuperadmin={activateSuperadminPassword}
      />
    );
  } else if (!payload) {
    content = <LoadingScreen />;
  } else if (payload.initialization.required) {
    content = <InitializationPage syncState={syncState} onInitialize={initializeApp} />;
  } else {
    const { snapshot, currentUser } = payload;
    const visibleModules = MODULES.filter((module) => canAccessModule(currentUser, module.key));
    const defaultPath = visibleModules[0] ? moduleEntryPath(visibleModules[0].key) : "/";
    const viewingProfile = location.pathname.startsWith("/profile");
    const activeModule = visibleModules.find((module) => moduleIsActive(location.pathname, module.path)) ?? visibleModules[0];
    const activeSubpage = Object.values(MODULE_SUBPAGES).flat().find((subpage) => subpage.path === location.pathname);
    const resolvedActiveView = viewingProfile
      ? PROFILE_VIEW
      : activeSubpage
        ? { label: activeSubpage.label, description: activeSubpage.description }
        : activeModule;
    const assignedCodes = snapshot.locations
      .filter((locationEntry) => currentUser.assignedLocationIds.includes(locationEntry.id))
      .map((locationEntry) => locationEntry.code)
      .join(", ");
    const activeAlertsCount = inventoryAlerts(snapshot).length;
    const mobileRoutes = visibleModules
      .map((module) => ({
        key: module.key,
        label: module.key === "inventoryOps" ? "Ops" : module.label,
        to: moduleEntryPath(module.key),
        end: module.path === "/",
        icon: MODULE_ICONS[module.key],
      }))
      .filter((entry, index, array) => array.findIndex((candidate) => candidate.to === entry.to) === index)
      .slice(0, 3);

    if (visibleModules.length === 0) {
      content = (
        <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 3 }}>
          <Paper sx={{ width: "min(560px, 100%)", p: { xs: 3, sm: 4 }, borderRadius: 4 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Access Required
            </Typography>
            <Typography variant="h4" sx={{ mt: 1 }}>
              No modules are assigned to this user
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.5 }}>
              Update the selected role permissions in Administration to continue.
            </Typography>
          </Paper>
        </Box>
      );
    } else {
      const desktopStatusChips = [
        { key: "online", label: syncState.online ? "Online" : "Offline mode", color: syncState.online ? "success" : "warning" },
        { key: "realtime", label: `Realtime ${syncState.websocket}`, color: syncState.websocket === "connected" ? "success" : "default" },
        { key: "queue", label: `Queue ${syncState.queued}`, color: syncState.queued > 0 ? "primary" : "default" },
        { key: "sync", label: `Last sync ${syncState.lastSyncedAt ? formatDateTime(syncState.lastSyncedAt) : "Waiting"}`, color: "default" },
      ] as const;

      const renderAvatarTrigger = (size: number) => (
        <Tooltip title="Account menu">
          <IconButton
            aria-label="Open profile menu"
            onClick={(event) => setProfileMenuAnchor(event.currentTarget)}
            sx={{ p: 0.5, borderRadius: 999, borderColor: alpha(muiTheme.palette.primary.main, 0.18) }}
          >
            <Avatar
              sx={{
                width: size,
                height: size,
                bgcolor: alpha(muiTheme.palette.primary.main, 0.14),
                color: "primary.main",
                fontWeight: 800,
              }}
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
        </Tooltip>
      );

      const renderSidebar = () => (
        <Stack sx={{ height: "100%", px: 2, py: 2 }} spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5} sx={{ px: 0.75 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2.5,
                display: "grid",
                placeItems: "center",
                background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
                color: "#ffffff",
                fontFamily: '"Sora", sans-serif',
                fontWeight: 800,
                boxShadow: `0 16px 32px ${alpha(muiTheme.palette.primary.main, 0.28)}`,
              }}
            >
              OS
            </Box>
            <Box minWidth={0}>
              <Typography variant="subtitle1" fontWeight={800}>
                OmniStock
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Restaurant warehouse system
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
            <Stack spacing={2}>
              {NAV_GROUPS.map((group) => {
                const groupModules = visibleModules.filter((module) => group.moduleKeys.includes(module.key));
                if (groupModules.length === 0) {
                  return null;
                }

                return (
                  <Box key={group.label}>
                    <Typography variant="overline" sx={{ px: 1.5, color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                      {group.label}
                    </Typography>
                    <List disablePadding sx={{ mt: 0.5 }}>
                      {groupModules.map((module) => {
                        const Icon = MODULE_ICONS[module.key];
                        const subpages = MODULE_SUBPAGES[module.key] ?? [];
                        const active = moduleIsActive(location.pathname, module.path);
                        return (
                          <Box key={module.key} sx={{ mb: 0.5 }}>
                            <ListItemButton
                              selected={active}
                              onClick={() => {
                                navigate(moduleEntryPath(module.key));
                                setMobileMenuOpen(false);
                              }}
                              sx={{
                                minHeight: 50,
                                px: 1.5,
                                bgcolor: active ? alpha(muiTheme.palette.primary.main, 0.16) : "transparent",
                                color: active ? "primary.main" : "text.primary",
                                "&.Mui-selected": { bgcolor: alpha(muiTheme.palette.primary.main, 0.16) },
                              }}
                            >
                              <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
                                <Icon size={20} />
                              </ListItemIcon>
                              <ListItemText primary={module.label} primaryTypographyProps={{ fontWeight: 700 }} />
                            </ListItemButton>

                            {subpages.length > 0 ? (
                              <Stack spacing={0.5} sx={{ ml: 3, mt: 0.5, pl: 1.5, borderLeft: `1px solid ${muiTheme.palette.divider}` }}>
                                {subpages.map((subpage) => {
                                  const subpageActive = location.pathname === subpage.path;
                                  return (
                                    <Button
                                      key={subpage.path}
                                      variant={subpageActive ? "contained" : "text"}
                                      color={subpageActive ? "primary" : "inherit"}
                                      onClick={() => {
                                        navigate(subpage.path);
                                        setMobileMenuOpen(false);
                                      }}
                                      sx={{
                                        justifyContent: "flex-start",
                                        minHeight: 36,
                                        px: 1.25,
                                        borderRadius: 2.5,
                                        color: subpageActive ? "primary.contrastText" : "text.secondary",
                                      }}
                                    >
                                      {subpage.label}
                                    </Button>
                                  );
                                })}
                              </Stack>
                            ) : null}
                          </Box>
                        );
                      })}
                    </List>
                  </Box>
                );
              })}
            </Stack>
          </Box>

          <Paper sx={{ p: 1.5, borderRadius: 3, bgcolor: muiTheme.palette.mode === "dark" ? alpha(muiTheme.palette.common.white, 0.03) : alpha(muiTheme.palette.primary.main, 0.03) }}>
            <Stack spacing={1.25}>
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Current Role
                </Typography>
                <Typography variant="subtitle2" fontWeight={800}>
                  {ROLE_PRESETS[currentUser.role].label}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {assignedCodes || "No locations assigned yet."}
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Tooltip title={themeToggleLabel}>
                  <IconButton onClick={() => setThemeMode(resolvedTheme === "dark" ? "light" : "dark")} sx={{ width: 42, height: 42 }}>
                    {resolvedTheme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                  </IconButton>
                </Tooltip>
                <Button fullWidth color="error" variant="outlined" startIcon={<LogoutIcon size={16} />} onClick={() => void logoutUser()}>
                  Log out
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      );

      content = (
        <Box sx={{ minHeight: "100vh", display: "flex" }}>
          {!isTabletOrMobile ? (
            <Drawer variant="permanent" open PaperProps={{ sx: { width: 320, overflowX: "hidden" } }}>
              {renderSidebar()}
            </Drawer>
          ) : null}

          <Drawer
            anchor="right"
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            PaperProps={{ sx: { width: "min(420px, 92vw)", borderTopLeftRadius: 28, borderBottomLeftRadius: 28, overflow: "hidden" } }}
          >
            <Box sx={{ px: 2, pt: 2, display: "flex", justifyContent: "flex-end" }}>
              <IconButton onClick={() => setMobileMenuOpen(false)}>
                <CloseIcon size={18} />
              </IconButton>
            </Box>
            {renderSidebar()}
          </Drawer>

          <Box component="main" sx={{ flex: 1, minWidth: 0, ml: !isTabletOrMobile ? "320px" : 0, px: { xs: 2, sm: 2.5, lg: 3 }, pt: { xs: 2, sm: 2.5, lg: 3 }, pb: { xs: 12, lg: 4 } }}>
            <Paper component="header" sx={{ position: "sticky", top: { xs: 12, lg: 20 }, zIndex: 10, mb: { xs: 2, lg: 2.5 }, px: 2, py: 1.5, borderRadius: 4, backdropFilter: "blur(18px)", bgcolor: muiTheme.palette.mode === "dark" ? alpha(muiTheme.palette.background.paper, 0.88) : alpha(muiTheme.palette.background.paper, 0.86) }}>
              <Stack direction={{ xs: "column", lg: "row" }} alignItems={{ xs: "stretch", lg: "center" }} justifyContent="space-between" spacing={1.5}>
                <Stack direction="row" alignItems="center" spacing={1.5} minWidth={0}>
                  {isTabletOrMobile ? (
                    <IconButton aria-label="Open navigation menu" onClick={() => setMobileMenuOpen(true)}>
                      <MenuIcon size={20} />
                    </IconButton>
                  ) : null}
                  <Box minWidth={0}>
                    <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                      Live Workspace
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 0.25 }} noWrap>
                      {resolvedActiveView?.label ?? "OmniStock"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }} noWrap>
                      {resolvedActiveView?.description}
                    </Typography>
                  </Box>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1} justifyContent={{ xs: "flex-start", lg: "flex-end" }} flexWrap="wrap" useFlexGap>
                  <Paper variant="outlined" sx={{ px: 1, py: 0.75, borderRadius: 3, bgcolor: muiTheme.palette.mode === "dark" ? alpha(muiTheme.palette.common.white, 0.02) : alpha(muiTheme.palette.primary.main, 0.03) }}>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {desktopStatusChips.map((status) => (
                        <Chip key={status.key} label={status.label} size="small" color={status.color} variant={status.color === "default" ? "outlined" : "filled"} />
                      ))}
                      <Chip label={`${activeAlertsCount} alerts`} size="small" color={activeAlertsCount > 0 ? "warning" : "default"} variant={activeAlertsCount > 0 ? "filled" : "outlined"} />
                      {syncState.error ? <Chip label={syncState.error} size="small" color="error" variant="outlined" /> : null}
                    </Stack>
                  </Paper>

                  <AppNotificationCenter snapshot={snapshot} />

                  <Tooltip title={themeToggleLabel}>
                    <IconButton onClick={() => setThemeMode(resolvedTheme === "dark" ? "light" : "dark")}>
                      {resolvedTheme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Sync now">
                    <IconButton onClick={() => void refresh()}>
                      <RefreshIcon size={18} />
                    </IconButton>
                  </Tooltip>

                  {renderAvatarTrigger(isTabletOrMobile ? 34 : 36)}
                </Stack>
              </Stack>
            </Paper>

            <Menu
              anchorEl={profileMenuAnchor}
              open={profileMenuOpen}
              onClose={() => setProfileMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{ paper: { sx: { width: { xs: "min(92vw, 320px)", sm: 320 }, borderRadius: 3.5, mt: 1, p: 0.5 } } }}
            >
              <Box sx={{ px: 1.5, py: 1.25 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Avatar sx={{ width: 44, height: 44, bgcolor: alpha(muiTheme.palette.primary.main, 0.14), color: "primary.main", fontWeight: 800 }}>
                    {currentUser.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Box minWidth={0}>
                    <Typography variant="subtitle2" fontWeight={800} noWrap>
                      {currentUser.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      @{currentUser.username} - {ROLE_PRESETS[currentUser.role].label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {currentUser.email}
                    </Typography>
                  </Box>
                </Stack>
                <Stack spacing={0.5} sx={{ mt: 1.5 }}>
                  <Chip size="small" variant="outlined" label={assignedCodes || "No assigned locations"} sx={{ justifyContent: "flex-start" }} />
                  <Chip size="small" variant="outlined" label={`Last active ${formatDateTime(currentUser.lastSeenAt)}`} sx={{ justifyContent: "flex-start" }} />
                </Stack>
              </Box>

              <Divider />

              <MenuItem onClick={() => { setProfileMenuAnchor(null); navigate("/profile"); }}>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <ProfileIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Edit profile" />
              </MenuItem>
              <MenuItem onClick={() => { setProfileMenuAnchor(null); void refresh(); }}>
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <RefreshIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Sync now" />
              </MenuItem>
              <MenuItem onClick={() => { setProfileMenuAnchor(null); void logoutUser(); }} sx={{ color: "error.main" }}>
                <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
                  <LogoutIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Log out" />
              </MenuItem>
            </Menu>

            <Box sx={{ mt: 0.5 }}>
              <Routes>
                {canAccessModule(currentUser, "dashboard") ? <Route path="/" element={<DashboardPage snapshot={snapshot} currentUser={currentUser} syncState={syncState} />} /> : null}
                {canAccessModule(currentUser, "inventoryOps") ? (
                  <>
                    <Route path="/inventory" element={<Navigate to="/inventory/grn" replace />} />
                    <Route path="/inventory/*" element={<InventoryOpsPage snapshot={snapshot} currentUser={currentUser} syncState={syncState} onCreateOperation={createOperation} />} />
                  </>
                ) : null}
                {canAccessModule(currentUser, "masterData") ? (
                  <>
                    <Route path="/master-data" element={<Navigate to="/master-data/items" replace />} />
                    <Route path="/master-data/*" element={<MasterDataPage snapshot={snapshot} currentUser={currentUser} onCreateMarketPrice={createMarketPrice} />} />
                  </>
                ) : null}
                {canAccessModule(currentUser, "reports") ? (
                  <>
                    <Route path="/reports" element={<Navigate to="/reports/analytics" replace />} />
                    <Route path="/reports/*" element={<ReportsPage snapshot={snapshot} currentUser={currentUser} />} />
                  </>
                ) : null}
                {canAccessModule(currentUser, "administration") ? (
                  <>
                    <Route path="/administration" element={<Navigate to="/administration/users" replace />} />
                    <Route path="/administration/*" element={<AdminPage snapshot={snapshot} currentUser={currentUser} onCreateUser={createUserAccount} onUpdateUser={updateUserAccount} onResetUserPassword={resetAccountPassword} onRemoveUser={removeUserAccount} />} />
                  </>
                ) : null}
                <Route path="/profile" element={<ProfilePage snapshot={snapshot} currentUser={currentUser} onUpdateProfile={updateProfile} onChangePassword={changeProfilePassword} />} />
                <Route path="*" element={<Navigate to={defaultPath} replace />} />
              </Routes>
            </Box>
          </Box>

          {isTabletOrMobile ? (
            <Paper sx={{ position: "fixed", left: 16, right: 16, bottom: 16, zIndex: 20, borderRadius: 3.5, p: 0.75, backdropFilter: "blur(18px)", bgcolor: muiTheme.palette.mode === "dark" ? alpha(muiTheme.palette.background.paper, 0.9) : alpha(muiTheme.palette.background.paper, 0.9) }}>
              <Stack direction="row" spacing={0.75}>
                {mobileRoutes.map((item) => {
                  const Icon = item.icon;
                  const active = item.end ? location.pathname === item.to : moduleIsActive(location.pathname, item.to);
                  return (
                    <Button key={item.key} fullWidth variant={active ? "contained" : "text"} color={active ? "primary" : "inherit"} onClick={() => navigate(item.to)} sx={{ minHeight: 52, display: "flex", flexDirection: "column", gap: 0.5, borderRadius: 2.5, color: active ? "primary.contrastText" : "text.secondary" }}>
                      <Icon size={18} />
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {item.label}
                      </Typography>
                    </Button>
                  );
                })}
                <Button fullWidth variant={viewingProfile ? "contained" : "text"} color={viewingProfile ? "primary" : "inherit"} onClick={() => navigate("/profile")} sx={{ minHeight: 52, display: "flex", flexDirection: "column", gap: 0.5, borderRadius: 2.5, color: viewingProfile ? "primary.contrastText" : "text.secondary" }}>
                  <ProfileIcon size={18} />
                  <Typography variant="caption" sx={{ fontWeight: 800 }}>
                    Profile
                  </Typography>
                </Button>
              </Stack>
            </Paper>
          ) : null}
        </Box>
      );
    }
  }

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      {content}
    </ThemeProvider>
  );
}
