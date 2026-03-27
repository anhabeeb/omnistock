import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack } from "@mui/material";
import { can } from "../../shared/permissions";
import { MobileModuleShell } from "../components/MobileModuleShell";
import { ADMIN_SECTIONS, AdminPage } from "./AdminPage";

type Props = ComponentProps<typeof AdminPage>;

export function MobileAdministrationPage(props: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const visibleSections = useMemo(
    () =>
      ADMIN_SECTIONS.filter((section) =>
        section.slug === "settings"
          ? can(props.currentUser, "admin.settings") ||
            can(props.currentUser, "admin.environment.edit") ||
            can(props.currentUser, "admin.notifications.edit") ||
            can(props.currentUser, "admin.permissions.edit") ||
            can(props.currentUser, "admin.permissions.manage")
          : section.slug === "users"
            ? can(props.currentUser, "admin.users.view")
            : can(props.currentUser, "admin.activity"),
      ),
    [props.currentUser],
  );
  const fallbackSection = visibleSections[0] ?? ADMIN_SECTIONS[0];
  const activeSlug = location.pathname.split("/")[2] ?? fallbackSection.slug;
  const activeSection = visibleSections.find((section) => section.slug === activeSlug) ?? fallbackSection;
  const invitedUsers = props.snapshot.users.filter((user) => user.status === "invited").length;

  const stats = useMemo(() => {
    if (activeSection.slug === "users") {
      return [
        {
          label: "Users",
          value: String(props.snapshot.users.length),
          detail: "Workspace accounts",
        },
        {
          label: "Inactive",
          value: String(invitedUsers),
          detail: "Accounts pending activation",
        },
      ];
    }

    if (activeSection.slug === "settings") {
      return [
        {
          label: "Timezone",
          value: props.snapshot.settings.timezone,
          detail: "Active workspace clock",
        },
        {
          label: "Currency",
          value: props.snapshot.settings.currency,
          detail: "Default valuation currency",
        },
      ];
    }

    return [
      {
        label: "Audit events",
        value: String(props.snapshot.activity.length),
        detail: "Recent recorded actions",
      },
      {
        label: "Unread alerts",
        value: String(props.snapshot.notifications.filter((notification) => notification.status === "unread").length),
        detail: "Open notifications in feed",
      },
    ];
  }, [
    activeSection.slug,
    invitedUsers,
    props.snapshot.activity.length,
    props.snapshot.notifications,
    props.snapshot.settings.currency,
    props.snapshot.settings.timezone,
    props.snapshot.users.length,
  ]);

  return (
    <Stack spacing={2}>
      <MobileModuleShell
        eyebrow="Administration"
        title={activeSection.title}
        description="Switch between user access, system settings, and audit oversight from a dedicated mobile administration shell."
        activeValue={activeSection.slug}
        selectLabel="Admin view"
        options={visibleSections.map((section) => ({
          value: section.slug,
          label: section.label,
          description: section.description,
        }))}
        onChange={(value) => navigate(`/administration/${value}`)}
        stats={stats}
      />
      <AdminPage {...props} layoutMode="mobile" />
    </Stack>
  );
}
