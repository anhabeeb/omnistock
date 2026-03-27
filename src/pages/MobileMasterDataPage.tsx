import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Stack } from "@mui/material";
import { MobileModuleShell } from "../components/MobileModuleShell";
import { MasterDataPage, MASTER_SECTIONS } from "./MasterDataPage";

type Props = ComponentProps<typeof MasterDataPage>;

export function MobileMasterDataPage(props: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeSlug = location.pathname.split("/")[2] ?? MASTER_SECTIONS[0].slug;
  const activeSection = MASTER_SECTIONS.find((section) => section.slug === activeSlug) ?? MASTER_SECTIONS[0];

  const trackedUnits = useMemo(
    () => new Set(props.snapshot.items.map((item) => item.unit.trim().toLowerCase()).filter(Boolean)).size,
    [props.snapshot.items],
  );
  const warehouses = props.snapshot.locations.filter((locationEntry) => locationEntry.type === "warehouse");
  const outlets = props.snapshot.locations.filter((locationEntry) => locationEntry.type === "outlet");

  const stats = useMemo(() => {
    switch (activeSection.slug) {
      case "items":
        return [
          {
            label: "Items",
            value: String(props.snapshot.items.length),
            detail: "Active SKU records",
          },
          {
            label: "Tracked units",
            value: String(trackedUnits),
            detail: "Unit styles in catalog",
          },
        ];
      case "suppliers":
        return [
          {
            label: "Suppliers",
            value: String(props.snapshot.suppliers.length),
            detail: "Approved vendors",
          },
          {
            label: "Assigned items",
            value: String(props.snapshot.items.filter((item) => item.supplierId).length),
            detail: "SKUs linked to suppliers",
          },
        ];
      case "locations":
        return [
          {
            label: "Warehouses",
            value: String(warehouses.length),
            detail: "Stock-holding sites",
          },
          {
            label: "Outlets",
            value: String(outlets.length),
            detail: "Operational branches",
          },
        ];
      default:
        return [
          {
            label: "Price logs",
            value: String(props.snapshot.marketPrices.length),
            detail: "Captured market rates",
          },
          {
            label: "Catalog items",
            value: String(props.snapshot.items.length),
            detail: "Items with live pricing context",
          },
        ];
    }
  }, [
    activeSection.slug,
    outlets.length,
    props.snapshot.items,
    props.snapshot.marketPrices.length,
    props.snapshot.suppliers.length,
    trackedUnits,
    warehouses.length,
  ]);

  return (
    <Stack spacing={2}>
      <MobileModuleShell
        eyebrow="Master Data"
        title={activeSection.title}
        description="Use the mobile view to switch data sections quickly while keeping create, edit, and lookup flows within thumb reach."
        activeValue={activeSection.slug}
        selectLabel="Section"
        options={MASTER_SECTIONS.map((section) => ({
          value: section.slug,
          label: section.label,
          description: section.description,
        }))}
        onChange={(value) => navigate(`/master-data/${value}`)}
        stats={stats}
      />
      <MasterDataPage {...props} layoutMode="mobile" />
    </Stack>
  );
}
