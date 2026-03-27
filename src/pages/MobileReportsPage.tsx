import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack } from "@mui/material";
import { lowStockAlerts, nearExpiryAlerts, expiredAlerts } from "../../shared/selectors";
import { MobileModuleShell } from "../components/MobileModuleShell";
import { formatCurrency } from "../lib/format";
import { ReportsPage, REPORT_SECTIONS } from "./ReportsPage";

type Props = ComponentProps<typeof ReportsPage>;

export function MobileReportsPage(props: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlug = location.pathname.split("/")[2] ?? REPORT_SECTIONS[0].slug;
  const activeSection = REPORT_SECTIONS.find((section) => section.slug === activeSlug) ?? REPORT_SECTIONS[0];

  const visibleInventoryValue = useMemo(
    () =>
      props.snapshot.items.reduce((sum, item) => {
        const onHand = item.stocks.reduce((running, stock) => running + stock.onHand, 0);
        return sum + onHand * item.costPrice;
      }, 0),
    [props.snapshot.items],
  );

  const stats = useMemo(() => {
    if (activeSection.slug === "analytics") {
      return [
        {
          label: "Inventory value",
          value: formatCurrency(visibleInventoryValue, props.snapshot.settings.currency),
          detail: "Visible stock capital",
        },
        {
          label: "Alert items",
          value: String(
            new Set([
              ...lowStockAlerts(props.snapshot).map((entry) => entry.itemId),
              ...nearExpiryAlerts(props.snapshot).map((entry) => entry.itemId),
              ...expiredAlerts(props.snapshot).map((entry) => entry.itemId),
            ]).size,
          ),
          detail: "Items needing attention",
        },
      ];
    }

    if (activeSection.slug === "waste-tracker") {
      const totalWasteQty = props.snapshot.wasteEntries.reduce((sum, entry) => sum + entry.quantity, 0);
      const totalWasteCost = props.snapshot.wasteEntries.reduce((sum, entry) => sum + entry.estimatedCost, 0);
      return [
        {
          label: "Waste entries",
          value: String(props.snapshot.wasteEntries.length),
          detail: "Logged waste records",
        },
        {
          label: "Waste cost",
          value: formatCurrency(totalWasteCost, props.snapshot.settings.currency),
          detail: `${totalWasteQty} units affected`,
        },
      ];
    }

    return [
      {
        label: "Movement rows",
        value: String(props.snapshot.movementLedger.length),
        detail: "Tracked stock movements",
      },
      {
        label: "Open requests",
        value: String(
          props.snapshot.requests.filter((request) => request.status === "submitted" || request.status === "draft")
            .length,
        ),
        detail: "Pending flow to review",
      },
    ];
  }, [
    activeSection.slug,
    props.snapshot,
    props.snapshot.settings.currency,
    visibleInventoryValue,
  ]);

  return (
    <Stack spacing={2}>
      <MobileModuleShell
        eyebrow="Reports & Analytics"
        title={activeSection.title}
        description="Review the reporting areas in a tighter mobile shell while keeping exports, filters, and report generation close at hand."
        activeValue={activeSection.slug}
        selectLabel="Report view"
        options={REPORT_SECTIONS.map((section) => ({
          value: section.slug,
          label: section.label,
          description: section.description,
        }))}
        onChange={(value) => navigate(`/reports/${value}`)}
        stats={stats}
      />
      <ReportsPage {...props} layoutMode="mobile" />
    </Stack>
  );
}
