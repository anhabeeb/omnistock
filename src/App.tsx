import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
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
  Typography,
  useMediaQuery,
} from "@mui/material";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import { MODULES, ROLE_PRESETS, canAccessModule } from "../shared/permissions";
import { AppNotificationCenter } from "./components/AppNotificationCenter";
import {
  ActivityIcon,
  AdminIcon,
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

const SIDEBAR_WIDTH = 236;

const PROFILE_VIEW = {
  label: "My Profile",
  description: "Update your personal information and password.",
};

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
  const { resolvedTheme, setThemeMode } = useThemePreference();
  const muiTheme = useMemo(() => buildMuiTheme(resolvedTheme), [resolvedTheme]);
  const isTabletOrMobile = useMediaQuery(muiTheme.breakpoints.down("lg"));
  const profileMenuOpen = Boolean(profileMenuAnchor);

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

  let content: ReactNode;

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
    const hasAdministrationAccess = canAccessModule(currentUser, "administration");
    const sidebarModules = visibleModules.filter((module) => module.key !== "administration");
    const defaultPath = visibleModules[0] ? moduleEntryPath(visibleModules[0].key) : "/";

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
      const viewingProfile = location.pathname.startsWith("/profile");
      const activeModule =
        visibleModules.find((module) => moduleIsActive(location.pathname, module.path)) ??
        visibleModules[0];
      const activeSubpage = Object.values(MODULE_SUBPAGES)
        .flat()
        .find((subpage) => subpage.path === location.pathname);
      const activeView = viewingProfile
        ? PROFILE_VIEW
        : activeSubpage
          ? { label: activeSubpage.label, description: activeSubpage.description }
          : activeModule;
      const assignedCodes = snapshot.locations
        .filter((locationEntry) => currentUser.assignedLocationIds.includes(locationEntry.id))
        .map((locationEntry) => locationEntry.code)
        .join(", ");
      const mobileRoutes = sidebarModules
        .map((module) => ({
          key: module.key,
          label: module.key === "inventoryOps" ? "Ops" : module.label,
          to: moduleEntryPath(module.key),
          end: module.path === "/",
          icon: MODULE_ICONS[module.key],
        }))
        .filter(
          (entry, index, array) =>
            array.findIndex((candidate) => candidate.to === entry.to) === index,
        )
        .slice(0, 3);
      const breadcrumbRoot = viewingProfile ? "Account" : activeModule?.label ?? "Workspace";
      const breadcrumbLeaf = viewingProfile
        ? "Profile"
        : activeSubpage?.label ??
          (activeModule?.key === "dashboard" ? "Home" : activeModule?.label ?? "Workspace");
      const pageHeading =
        viewingProfile
          ? "Profile"
          : activeModule?.key === "dashboard" && !activeSubpage
            ? "Overview"
            : activeView.label;
      const liveStatusLabel = syncState.online
        ? `Live sync${syncState.queued ? ` · ${syncState.queued} queued` : ""}`
        : `Offline${syncState.queued ? ` · ${syncState.queued} queued` : ""}`;
      const currentDateLabel = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date());
      const utilityLinks = [
        {
          label: "Settings",
          to: hasAdministrationAccess ? "/administration/settings" : "/profile",
          icon: <SettingsRoundedIcon sx={{ fontSize: 18 }} />,
        },
        {
          label: "Profile",
          to: "/profile",
          icon: <PersonOutlineRoundedIcon sx={{ fontSize: 18 }} />,
        },
        ...(hasAdministrationAccess
          ? [
              {
                label: "Users",
                to: "/administration/users",
                icon: <AdminIcon size={18} />,
              },
            ]
          : []),
        {
          label: hasAdministrationAccess ? "Activity" : "Reports",
          to: hasAdministrationAccess
            ? "/administration/activity"
            : canAccessModule(currentUser, "reports")
              ? "/reports/analytics"
              : defaultPath,
          icon: hasAdministrationAccess ? (
            <HistoryRoundedIcon sx={{ fontSize: 18 }} />
          ) : (
            <ActivityIcon size={18} />
          ),
        },
      ] as const;
      const openProfileMenu = (event: MouseEvent<HTMLElement>) => {
        setProfileMenuAnchor(event.currentTarget);
      };

      const renderSidebar = () => (
        <Stack sx={{ height: "100%", px: 1.5, py: 1.5 }} spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ px: 0.5, py: 0.25 }}>
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                border: `1px solid ${alpha(
                  muiTheme.palette.common.white,
                  muiTheme.palette.mode === "dark" ? 0.12 : 0.08,
                )}`,
                bgcolor:
                  muiTheme.palette.mode === "dark"
                    ? alpha(muiTheme.palette.primary.main, 0.08)
                    : alpha(muiTheme.palette.primary.main, 0.1),
                color: "primary.main",
                flex: "0 0 auto",
              }}
            >
              <InventoryIcon size={18} />
            </Box>
            <Box minWidth={0} flex={1}>
              <Typography variant="subtitle2" fontWeight={800} noWrap>
                OmniStock
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                Warehouse app
              </Typography>
            </Box>
          </Stack>

          <Divider />

          <Box sx={{ flex: 1, overflowY: "auto", pr: 0.5 }}>
            <List disablePadding sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {sidebarModules.map((module) => {
                const Icon = MODULE_ICONS[module.key];
                const active = moduleIsActive(location.pathname, module.path);
                const subpages = MODULE_SUBPAGES[module.key] ?? [];
                return (
                  <Box key={module.key}>
                    <ListItemButton
                      selected={active}
                      onClick={() => {
                        navigate(moduleEntryPath(module.key));
                        setMobileMenuOpen(false);
                      }}
                      sx={{
                        minHeight: 40,
                        px: 1.25,
                        borderRadius: 2,
                        color: active ? "text.primary" : "text.secondary",
                        bgcolor:
                          active
                            ? muiTheme.palette.mode === "dark"
                              ? alpha(muiTheme.palette.common.white, 0.12)
                              : alpha(muiTheme.palette.text.primary, 0.08)
                            : "transparent",
                        "&.Mui-selected": {
                          bgcolor:
                            muiTheme.palette.mode === "dark"
                              ? alpha(muiTheme.palette.common.white, 0.12)
                              : alpha(muiTheme.palette.text.primary, 0.08),
                        },
                        "&:hover": {
                          bgcolor:
                            muiTheme.palette.mode === "dark"
                              ? alpha(muiTheme.palette.common.white, 0.08)
                              : alpha(muiTheme.palette.text.primary, 0.05),
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: 32, color: "inherit" }}>
                        <Icon size={17} />
                      </ListItemIcon>
                      <ListItemText
                        primary={module.label}
                        primaryTypographyProps={{ fontWeight: 700, fontSize: "0.95rem" }}
                      />
                    </ListItemButton>

                    {active && subpages.length > 0 ? (
                      <Stack
                        spacing={0.35}
                        sx={{
                          ml: 3.75,
                          mt: 0.4,
                          pl: 1.25,
                          borderLeft: `1px solid ${alpha(muiTheme.palette.divider, 0.8)}`,
                        }}
                      >
                        {subpages.map((subpage) => {
                          const subpageActive = location.pathname === subpage.path;
                          return (
                            <Button
                              key={subpage.path}
                              variant="text"
                              color="inherit"
                              onClick={() => {
                                navigate(subpage.path);
                                setMobileMenuOpen(false);
                              }}
                              sx={{
                                justifyContent: "flex-start",
                                minHeight: 30,
                                px: 0.75,
                                borderRadius: 1.5,
                                color: subpageActive ? "text.primary" : "text.secondary",
                                fontSize: "0.8rem",
                                fontWeight: subpageActive ? 700 : 600,
                                bgcolor:
                                  subpageActive
                                    ? muiTheme.palette.mode === "dark"
                                      ? alpha(muiTheme.palette.primary.main, 0.14)
                                      : alpha(muiTheme.palette.primary.main, 0.08)
                                    : "transparent",
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

            <Stack spacing={0.5} sx={{ mt: 3 }}>
              {utilityLinks.map((item) => {
                const active = location.pathname === item.to;
                return (
                  <Button
                    key={item.label}
                    variant="text"
                    color="inherit"
                    onClick={() => {
                      navigate(item.to);
                      setMobileMenuOpen(false);
                    }}
                    startIcon={item.icon}
                    sx={{
                      justifyContent: "flex-start",
                      minHeight: 34,
                      px: 1.25,
                      borderRadius: 1.75,
                      color: active ? "text.primary" : "text.secondary",
                      fontSize: "0.9rem",
                      fontWeight: 700,
                    }}
                  >
                    {item.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Paper
            variant="outlined"
            sx={{
              p: 1,
              borderRadius: 3,
              cursor: "pointer",
              bgcolor:
                muiTheme.palette.mode === "dark"
                  ? alpha(muiTheme.palette.common.white, 0.02)
                  : alpha(muiTheme.palette.background.paper, 0.92),
            }}
            onClick={openProfileMenu}
          >
            <Stack direction="row" alignItems="center" spacing={1}>
              <Avatar
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: alpha(muiTheme.palette.primary.main, 0.14),
                  color: "primary.main",
                  fontWeight: 800,
                  flex: "0 0 auto",
                }}
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </Avatar>
              <Box minWidth={0} flex={1}>
                <Typography variant="subtitle2" fontWeight={800} noWrap>
                  {currentUser.name}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {currentUser.email}
                </Typography>
              </Box>
            </Stack>
          </Paper>
        </Stack>
      );

      content = (
        <Box sx={{ minHeight: "100vh", display: "flex" }}>
          {!isTabletOrMobile ? (
            <Drawer
              variant="permanent"
              open
              PaperProps={{ sx: { width: SIDEBAR_WIDTH, overflowX: "hidden" } }}
            >
              {renderSidebar()}
            </Drawer>
          ) : null}

          <Drawer
            anchor="left"
            open={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            PaperProps={{ sx: { width: "min(360px, 88vw)", overflow: "hidden" } }}
          >
            {renderSidebar()}
          </Drawer>

          <Box
            component="main"
            sx={{
              flex: 1,
              minWidth: 0,
              ml: !isTabletOrMobile ? `${SIDEBAR_WIDTH}px` : 0,
              px: { xs: 2, sm: 2.5, lg: 3 },
              pt: { xs: 1.5, sm: 2, lg: 2.5 },
              pb: { xs: 11.5, lg: 4 },
            }}
          >
            <Box
              component="header"
              sx={{
                position: "sticky",
                top: 0,
                zIndex: 10,
                mb: { xs: 2, lg: 2.5 },
                py: { xs: 0.5, lg: 0.25 },
              }}
            >
              <Stack
                direction={{ xs: "column", md: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "stretch", md: "center" }}
                spacing={1.5}
              >
                <Box minWidth={0}>
                  <Stack direction="row" alignItems="center" spacing={0.65} sx={{ minHeight: 24 }}>
                    {isTabletOrMobile ? (
                      <IconButton
                        aria-label="Open navigation menu"
                        onClick={() => setMobileMenuOpen(true)}
                        sx={{ mr: 0.25, width: 34, height: 34 }}
                      >
                        <MenuIcon size={18} />
                      </IconButton>
                    ) : null}
                    <Typography variant="body2" sx={{ color: "primary.main", fontWeight: 600 }}>
                      {breadcrumbRoot}
                    </Typography>
                    <ChevronRightRoundedIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                    <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 700 }}>
                      {breadcrumbLeaf}
                    </Typography>
                  </Stack>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    spacing={1}
                    sx={{ mt: 1 }}
                  >
                    <Typography variant={isTabletOrMobile ? "h5" : "h4"} sx={{ lineHeight: 1.1 }}>
                      {pageHeading}
                    </Typography>
                    <Chip
                      size="small"
                      color={syncState.online ? "success" : "warning"}
                      variant={syncState.online ? "outlined" : "filled"}
                      label={liveStatusLabel}
                    />
                  </Stack>
                </Box>

                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  useFlexGap
                  flexWrap="wrap"
                  justifyContent={{ xs: "flex-start", md: "flex-end" }}
                >
                  <Button
                    variant="outlined"
                    color="inherit"
                    startIcon={<CalendarMonthRoundedIcon sx={{ fontSize: 18 }} />}
                    sx={{
                      minHeight: 40,
                      borderRadius: 2.5,
                      color: "text.primary",
                      borderColor: alpha(muiTheme.palette.divider, 0.95),
                    }}
                  >
                    {currentDateLabel}
                  </Button>

                  <AppNotificationCenter snapshot={snapshot} />
                </Stack>
              </Stack>
            </Box>

            <Menu
              anchorEl={profileMenuAnchor}
              open={profileMenuOpen}
              onClose={() => setProfileMenuAnchor(null)}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              slotProps={{
                paper: {
                  sx: {
                    width: { xs: "min(92vw, 320px)", sm: 320 },
                    borderRadius: 3.5,
                    mt: 1,
                    p: 0.5,
                  },
                },
              }}
            >
              <Box sx={{ px: 1.5, py: 1.25 }}>
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Avatar
                    sx={{
                      width: 44,
                      height: 44,
                      bgcolor: alpha(muiTheme.palette.primary.main, 0.14),
                      color: "primary.main",
                      fontWeight: 800,
                    }}
                  >
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

              <MenuItem
                onClick={() => {
                  setProfileMenuAnchor(null);
                  navigate("/profile");
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <ProfileIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Edit profile" />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setProfileMenuAnchor(null);
                  void refresh();
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>
                  <RefreshIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Sync now" />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setProfileMenuAnchor(null);
                  setThemeMode(resolvedTheme === "dark" ? "light" : "dark");
                }}
              >
                <ListItemIcon sx={{ minWidth: 34 }}>
                  {resolvedTheme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
                </ListItemIcon>
                <ListItemText primary={resolvedTheme === "dark" ? "Switch to light mode" : "Switch to dark mode"} />
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setProfileMenuAnchor(null);
                  void logoutUser();
                }}
                sx={{ color: "error.main" }}
              >
                <ListItemIcon sx={{ minWidth: 34, color: "inherit" }}>
                  <LogoutIcon size={16} />
                </ListItemIcon>
                <ListItemText primary="Log out" />
              </MenuItem>
            </Menu>

            <Box sx={{ mt: 0.5 }}>
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
                  <>
                    <Route path="/inventory" element={<Navigate to="/inventory/grn" replace />} />
                    <Route
                      path="/inventory/*"
                      element={
                        <InventoryOpsPage
                          snapshot={snapshot}
                          currentUser={currentUser}
                          syncState={syncState}
                          onCreateOperation={createOperation}
                        />
                      }
                    />
                  </>
                ) : null}
                {canAccessModule(currentUser, "masterData") ? (
                  <>
                    <Route path="/master-data" element={<Navigate to="/master-data/items" replace />} />
                    <Route
                      path="/master-data/*"
                      element={
                        <MasterDataPage
                          snapshot={snapshot}
                          currentUser={currentUser}
                          onCreateMarketPrice={createMarketPrice}
                        />
                      }
                    />
                  </>
                ) : null}
                {canAccessModule(currentUser, "reports") ? (
                  <>
                    <Route path="/reports" element={<Navigate to="/reports/analytics" replace />} />
                    <Route
                      path="/reports/*"
                      element={<ReportsPage snapshot={snapshot} currentUser={currentUser} />}
                    />
                  </>
                ) : null}
                {canAccessModule(currentUser, "administration") ? (
                  <>
                    <Route
                      path="/administration"
                      element={<Navigate to="/administration/users" replace />}
                    />
                    <Route
                      path="/administration/*"
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
                  </>
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
            </Box>
          </Box>

          {isTabletOrMobile ? (
            <Paper
              sx={{
                position: "fixed",
                left: 16,
                right: 16,
                bottom: 16,
                zIndex: 20,
                borderRadius: 3,
                p: 0.75,
                backdropFilter: "blur(16px)",
                bgcolor:
                  muiTheme.palette.mode === "dark"
                    ? alpha(muiTheme.palette.background.paper, 0.94)
                    : alpha(muiTheme.palette.background.paper, 0.94),
              }}
            >
              <Stack direction="row" spacing={0.75}>
                {mobileRoutes.map((item) => {
                  const Icon = item.icon;
                  const active = item.end
                    ? location.pathname === item.to
                    : moduleIsActive(location.pathname, item.to);
                  return (
                    <Button
                      key={item.key}
                      fullWidth
                      variant={active ? "contained" : "text"}
                      color="inherit"
                      onClick={() => navigate(item.to)}
                      sx={{
                        minHeight: 52,
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                        borderRadius: 2,
                        color: active ? "text.primary" : "text.secondary",
                        bgcolor:
                          active
                            ? muiTheme.palette.mode === "dark"
                              ? alpha(muiTheme.palette.common.white, 0.12)
                              : alpha(muiTheme.palette.text.primary, 0.08)
                            : "transparent",
                      }}
                    >
                      <Icon size={18} />
                      <Typography variant="caption" sx={{ fontWeight: 800 }}>
                        {item.label}
                      </Typography>
                    </Button>
                  );
                })}
                <Button
                  fullWidth
                  variant={viewingProfile ? "contained" : "text"}
                  color="inherit"
                  onClick={() => navigate("/profile")}
                  sx={{
                    minHeight: 52,
                    display: "flex",
                    flexDirection: "column",
                    gap: 0.5,
                    borderRadius: 2,
                    color: viewingProfile ? "text.primary" : "text.secondary",
                    bgcolor:
                      viewingProfile
                        ? muiTheme.palette.mode === "dark"
                          ? alpha(muiTheme.palette.common.white, 0.12)
                          : alpha(muiTheme.palette.text.primary, 0.08)
                        : "transparent",
                  }}
                >
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
