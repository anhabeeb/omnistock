import { useDeferredValue, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { useLocation } from "react-router-dom";
import {
  batchBarcodeValues,
  expiredAlerts,
  itemBarcodeValues,
  lowStockAlerts,
  nearExpiryAlerts,
  totalOnHand,
} from "../../shared/selectors";
import { can } from "../../shared/permissions";
import type {
  InventoryRequest,
  InventorySnapshot,
  Item,
  User,
  WasteReason,
} from "../../shared/types";
import {
  DonutChart,
  LineAreaChart,
  StackedBarChart,
} from "../components/ReportCharts";
import {
  type WorkbookSheet,
  exportMovementLedger,
  exportWasteEntries,
  exportWorkbook,
} from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";
import { SAFE_MUI_SELECT_PROPS } from "../lib/muiFocus";
import { openReportDocument } from "../lib/reportPrint";
import {
  DATE_FILTER_OPTIONS,
  type DateFilterPreset,
  matchesDateFilter,
} from "../lib/dateFilters";
import { getCurrentTimestampIso, getFileDateStampForWorkspace } from "../lib/time";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  layoutMode?: "desktop" | "mobile";
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "short" });

export const REPORT_SECTIONS = [
  {
    slug: "analytics",
    label: "Analytics",
    title: "Inventory Analytics",
    description:
      "Track inventory levels, aging exposure, operational accuracy, and alert pressure with live warehouse KPIs.",
  },
  {
    slug: "waste-tracker",
    label: "Waste Tracker",
    title: "Waste Analytics",
    description:
      "Measure restaurant waste generation, diversion, cost exposure, and sustainability progress over time.",
  },
  {
    slug: "movement-ledger",
    label: "Movement Ledger",
    title: "Movement Analytics",
    description:
      "Understand inventory flow, SKU movement velocity, transfer routes, and dead-stock pressure across the network.",
  },
] as const;

const CHART_COLORS = {
  blue: "#4f7cff",
  sky: "#69b4ff",
  cyan: "#2dd4bf",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  violet: "#8b5cf6",
  slate: "#94a3b8",
};

const AGE_BUCKETS = [
  { label: "0-30", min: 0, max: 30, color: CHART_COLORS.green },
  { label: "31-60", min: 31, max: 60, color: CHART_COLORS.sky },
  { label: "61-90", min: 61, max: 90, color: CHART_COLORS.amber },
  { label: "90+", min: 91, max: Number.POSITIVE_INFINITY, color: CHART_COLORS.red },
] as const;

function safeTimeValue(value?: string): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function formatPercent(value: number, digits = 0): string {
  return `${clampPercent(value).toFixed(digits)}%`;
}

function truncateLabel(value: string, max = 12): string {
  return value.length > max ? `${value.slice(0, Math.max(1, max - 1))}…` : value;
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function buildRollingMonths(count: number, referenceDate = new Date()) {
  const currentMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  return Array.from({ length: count }, (_, index) => {
    const start = addMonths(currentMonth, index - (count - 1));
    const end = addMonths(start, 1);
    return {
      label: MONTH_FORMATTER.format(start),
      start: start.getTime(),
      end: end.getTime(),
    };
  });
}

function requestTouchesLocation(request: InventoryRequest, locationId: string): boolean {
  return request.fromLocationId === locationId || request.toLocationId === locationId;
}

function requestLeadHours(
  request: InventoryRequest,
  postedAtByReference: Map<string, number>,
): number | null {
  const requestedAt = safeTimeValue(request.requestedAt);
  const postedAt = postedAtByReference.get(request.reference);
  if (requestedAt === null || postedAt === undefined || postedAt < requestedAt) {
    return null;
  }

  return (postedAt - requestedAt) / (60 * 60 * 1000);
}

function wasteDisposition(reason: WasteReason): "Reuse" | "Compost" | "Landfill" {
  switch (reason) {
    case "overproduction":
    case "staff-meal":
      return "Reuse";
    case "prep-loss":
      return "Compost";
    default:
      return "Landfill";
  }
}

function wasteCostBreakdown(materialCost: number) {
  const collection = materialCost * 0.08;
  const transportation = materialCost * 0.05;
  const processing = materialCost * 0.04;

  return {
    material: materialCost,
    collection,
    transportation,
    processing,
    total: materialCost + collection + transportation + processing,
  };
}

function itemBatchBarcodeValues(item: Item): string[] {
  return [...new Set(item.stocks.flatMap((stock) => stock.batches.flatMap((batch) => batchBarcodeValues(batch))))];
}

function SectionCard({
  eyebrow,
  title,
  caption,
  children,
}: {
  eyebrow: string;
  title: string;
  caption?: string;
  children: ReactNode;
}) {
  return (
    <Paper sx={{ p: { xs: 2.25, md: 2.75 }, borderRadius: 2.5, height: "100%" }}>
      <Stack spacing={2}>
        <Box sx={{ textAlign: "center" }}>
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
            {eyebrow}
          </Typography>
          <Typography variant="h6" sx={{ mt: 0.35 }}>
            {title}
          </Typography>
          {caption ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.9 }}>
              {caption}
            </Typography>
          ) : null}
        </Box>
        {children}
      </Stack>
    </Paper>
  );
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Paper sx={{ p: 2.25, borderRadius: 2.5, height: "100%" }}>
      <Stack spacing={1} alignItems="center" textAlign="center">
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4">{value}</Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </Stack>
    </Paper>
  );
}

function StatusCard({
  label,
  value,
  detail,
  accent,
  background,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  background: string;
}) {
  return (
    <Paper sx={{ p: 2, borderRadius: 2.5, backgroundColor: background, border: `1px solid ${accent}` }}>
      <Stack spacing={1} alignItems="center" textAlign="center">
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
          <Box sx={{ width: 10, height: 10, borderRadius: "999px", backgroundColor: accent, flexShrink: 0 }} />
          <Typography variant="subtitle2" fontWeight={800}>
            {label}
          </Typography>
        </Stack>
        <Typography variant="h5">{value}</Typography>
        <Typography variant="body2" color="text.secondary">
          {detail}
        </Typography>
      </Stack>
    </Paper>
  );
}

function InsightRow({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={1.5} alignItems="flex-start">
      <Box>
        <Typography variant="subtitle2" fontWeight={800}>
          {label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {caption}
        </Typography>
      </Box>
      <Typography variant="subtitle2" textAlign="right">
        {value}
      </Typography>
    </Stack>
  );
}

export function ReportsPage({
  snapshot,
  currentUser,
  layoutMode = "desktop",
}: Props) {
  const theme = useTheme();
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? REPORT_SECTIONS[0].slug;
  const activeSection = REPORT_SECTIONS.find((section) => section.slug === activeSlug) ?? REPORT_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [exportingData, setExportingData] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const canExportReports = can(currentUser, "reports.export");
  const canPrintReports = can(currentUser, "reports.print");
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const dateFilter = useMemo(
    () => ({
      preset: datePreset,
      customStartDate,
      customEndDate,
    }),
    [customEndDate, customStartDate, datePreset],
  );

  const supplierNameById = useMemo(
    () => new Map(snapshot.suppliers.map((supplier) => [supplier.id, supplier.name])),
    [snapshot.suppliers],
  );

  const filteredItems = useMemo(() => {
    return snapshot.items.filter((item) => {
      const locationMatches =
        locationFilter === "all"
          ? true
          : item.stocks.some((stock) => stock.locationId === locationFilter);
      const supplierName = supplierNameById.get(item.supplierId) ?? "";
      const matchesSearch =
        !normalizedSearch ||
        `${item.sku} ${item.name} ${item.category} ${supplierName} ${itemBarcodeValues(item).join(" ")} ${itemBatchBarcodeValues(item).join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch);

      return locationMatches && matchesSearch;
    });
  }, [locationFilter, normalizedSearch, snapshot.items, supplierNameById]);

  const filteredLedger = useMemo(() => {
    return snapshot.movementLedger.filter((entry) => {
      const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
      const matchesDate = matchesDateFilter(entry.createdAt, dateFilter);
      const matchesSearch =
        !normalizedSearch ||
        `${entry.reference} ${entry.itemName} ${entry.locationName} ${entry.actorName}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesLocation && matchesDate && matchesSearch;
    });
  }, [dateFilter, locationFilter, normalizedSearch, snapshot.movementLedger]);

  const filteredWaste = useMemo(() => {
    return snapshot.wasteEntries.filter((entry) => {
      const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
      const matchesDate = matchesDateFilter(entry.createdAt, dateFilter);
      const matchesSearch =
        !normalizedSearch ||
        `${entry.itemName} ${entry.locationName} ${entry.reason} ${entry.station} ${entry.reportedByName}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesLocation && matchesDate && matchesSearch;
    });
  }, [dateFilter, locationFilter, normalizedSearch, snapshot.wasteEntries]);

  const filteredRequests = useMemo(() => {
    return snapshot.requests.filter((request) => {
      const matchesLocation =
        locationFilter === "all" ? true : requestTouchesLocation(request, locationFilter);
      const matchesDate = matchesDateFilter(request.requestedAt, dateFilter);
      const matchesSearch =
        !normalizedSearch ||
        `${request.reference} ${request.itemName} ${request.requestedByName} ${request.fromLocationName ?? ""} ${request.toLocationName ?? ""} ${request.supplierName ?? ""}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesLocation && matchesDate && matchesSearch;
    });
  }, [dateFilter, locationFilter, normalizedSearch, snapshot.requests]);

  const filteredMarketPrices = useMemo(() => {
    return snapshot.marketPrices.filter((entry) => {
      const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
      const matchesDate = matchesDateFilter(entry.marketDate, dateFilter);
      const matchesSearch =
        !normalizedSearch ||
        `${entry.itemName} ${entry.locationName} ${entry.supplierName ?? ""} ${entry.sourceName} ${entry.marketDate}`
          .toLowerCase()
          .includes(normalizedSearch);
      return matchesLocation && matchesDate && matchesSearch;
    });
  }, [dateFilter, locationFilter, normalizedSearch, snapshot.marketPrices]);

  const filteredLowAlerts = useMemo(
    () =>
      lowStockAlerts(snapshot).filter((entry) => {
        const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
        const matchesSearch =
          !normalizedSearch ||
          `${entry.itemName} ${entry.locationName} ${entry.sku}`.toLowerCase().includes(normalizedSearch);
        return matchesLocation && matchesSearch;
      }),
    [locationFilter, normalizedSearch, snapshot],
  );

  const filteredNearExpiryAlerts = useMemo(
    () =>
      nearExpiryAlerts(snapshot).filter((entry) => {
        const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
        const matchesSearch =
          !normalizedSearch ||
          `${entry.itemName} ${entry.locationName} ${entry.sku}`.toLowerCase().includes(normalizedSearch);
        return matchesLocation && matchesSearch;
      }),
    [locationFilter, normalizedSearch, snapshot],
  );

  const filteredExpiredAlerts = useMemo(
    () =>
      expiredAlerts(snapshot).filter((entry) => {
        const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
        const matchesSearch =
          !normalizedSearch ||
          `${entry.itemName} ${entry.locationName} ${entry.sku}`.toLowerCase().includes(normalizedSearch);
        return matchesLocation && matchesSearch;
      }),
    [locationFilter, normalizedSearch, snapshot],
  );

  const postedAtByReference = useMemo(() => {
    const values = new Map<string, number>();

    for (const entry of filteredLedger) {
      const createdAt = safeTimeValue(entry.createdAt);
      if (createdAt === null) {
        continue;
      }

      const current = values.get(entry.reference);
      if (current === undefined || createdAt < current) {
        values.set(entry.reference, createdAt);
      }
    }

    return values;
  }, [filteredLedger]);

  const visibleInventoryValue = useMemo(() => {
    return filteredItems.reduce((sum, item) => {
      const scopedOnHand =
        locationFilter === "all"
          ? totalOnHand(item)
          : item.stocks
              .filter((stock) => stock.locationId === locationFilter)
              .reduce((running, stock) => running + stock.onHand, 0);
      return sum + scopedOnHand * item.costPrice;
    }, 0);
  }, [filteredItems, locationFilter]);

  const analyticsData = useMemo(() => {
    const now = Date.now();

    function scopedStocks(item: Item) {
      return locationFilter === "all"
        ? item.stocks
        : item.stocks.filter((stock) => stock.locationId === locationFilter);
    }

    function scopedOnHand(item: Item) {
      return scopedStocks(item).reduce((sum, stock) => sum + stock.onHand, 0);
    }

    function scopedReserved(item: Item) {
      return scopedStocks(item).reduce((sum, stock) => sum + stock.reserved, 0);
    }

    const totalOnHandUnits = filteredItems.reduce((sum, item) => sum + scopedOnHand(item), 0);
    const totalReservedUnits = filteredItems.reduce((sum, item) => sum + scopedReserved(item), 0);
    const stockoutItemsCount = filteredItems.filter((item) => scopedOnHand(item) === 0).length;
    const nearStockoutItemsCount = filteredItems.filter((item) => {
      const stocks = scopedStocks(item);
      return (
        scopedOnHand(item) > 0 &&
        stocks.some((stock) => stock.onHand <= Math.max(stock.minLevel, snapshot.settings.lowStockThreshold))
      );
    }).length;
    const overstockItemsCount = filteredItems.filter((item) =>
      scopedStocks(item).some((stock) => stock.maxLevel > 0 && stock.onHand > stock.maxLevel),
    ).length;

    const stockCountEntries = filteredLedger.filter((entry) => entry.changeType === "stock-count");
    const accuracyRate = stockCountEntries.length
      ? average(
          stockCountEntries.map((entry) => {
            const baseline = Math.max(entry.quantityBefore, entry.quantityAfter, 1);
            return clampPercent((1 - Math.abs(entry.quantityChange) / baseline) * 100);
          }),
        )
      : 100;

    const alertedItems = new Set([
      ...filteredLowAlerts.map((entry) => entry.itemId),
      ...filteredNearExpiryAlerts.map((entry) => entry.itemId),
      ...filteredExpiredAlerts.map((entry) => entry.itemId),
    ]);
    const healthyItemsCount = filteredItems.filter((item) => {
      const isOverstocked = scopedStocks(item).some(
        (stock) => stock.maxLevel > 0 && stock.onHand > stock.maxLevel,
      );
      return scopedOnHand(item) > 0 && !isOverstocked && !alertedItems.has(item.id);
    }).length;

    const locationInventoryData = snapshot.locations
      .map((locationEntry) => {
        const onHand = filteredItems.reduce((sum, item) => {
          return (
            sum +
            item.stocks
              .filter((stock) => stock.locationId === locationEntry.id)
              .reduce((running, stock) => running + stock.onHand, 0)
          );
        }, 0);
        const reserved = filteredItems.reduce((sum, item) => {
          return (
            sum +
            item.stocks
              .filter((stock) => stock.locationId === locationEntry.id)
              .reduce((running, stock) => running + stock.reserved, 0)
          );
        }, 0);
        return { label: truncateLabel(locationEntry.name, 12), onHand, reserved };
      })
      .filter((entry) => entry.onHand > 0 || entry.reserved > 0)
      .sort((left, right) => right.onHand + right.reserved - (left.onHand + left.reserved))
      .slice(0, 6)
      .map((entry) => ({
        label: entry.label,
        segments: [
          { label: "On hand", value: entry.onHand, color: CHART_COLORS.blue },
          { label: "Reserved", value: entry.reserved, color: CHART_COLORS.sky },
        ],
      }));

    const ageStats = AGE_BUCKETS.map((bucket) => ({
      label: bucket.label,
      color: bucket.color,
      quantity: 0,
      value: 0,
    }));

    for (const item of filteredItems) {
      for (const stock of scopedStocks(item)) {
        const sourceBatches =
          stock.batches.length > 0
            ? stock.batches.filter((batch) => batch.quantity > 0)
            : stock.onHand > 0
              ? [
                  {
                    id: `${item.id}:${stock.locationId}:fallback`,
                    locationId: stock.locationId,
                    lotCode: "live",
                    quantity: stock.onHand,
                    receivedAt: item.updatedAt,
                    expiryDate: undefined,
                  },
                ]
              : [];

        for (const batch of sourceBatches) {
          const receivedAt = safeTimeValue(batch.receivedAt) ?? safeTimeValue(item.updatedAt) ?? now;
          const ageInDays = Math.max(0, Math.floor((now - receivedAt) / DAY_MS));
          const bucketIndex = AGE_BUCKETS.findIndex(
            (bucket) => ageInDays >= bucket.min && ageInDays <= bucket.max,
          );
          const targetIndex = bucketIndex === -1 ? AGE_BUCKETS.length - 1 : bucketIndex;
          ageStats[targetIndex].quantity += batch.quantity;
          ageStats[targetIndex].value += batch.quantity * item.costPrice;
        }
      }
    }

    const recent30Ledger = filteredLedger.filter((entry) => {
      const createdAt = safeTimeValue(entry.createdAt);
      return createdAt !== null && now - createdAt <= 30 * DAY_MS;
    });

    const inboundQuantity = recent30Ledger.reduce(
      (sum, entry) => sum + Math.max(entry.quantityChange, 0),
      0,
    );
    const outboundQuantity = recent30Ledger.reduce(
      (sum, entry) => sum + Math.abs(Math.min(entry.quantityChange, 0)),
      0,
    );
    const currentInventory = filteredItems.reduce((sum, item) => sum + scopedOnHand(item), 0);
    const openingInventoryEstimate = Math.max(currentInventory - inboundQuantity + outboundQuantity, 0);
    const averageInventory = Math.max((currentInventory + openingInventoryEstimate) / 2, 1);
    const turnoverRatio = outboundQuantity / averageInventory;
    const sellThroughRate = (outboundQuantity / Math.max(outboundQuantity + currentInventory, 1)) * 100;

    const movementValueByItem = new Map<
      string,
      { movementValue: number; movementQty: number; events: number }
    >();
    for (const entry of recent30Ledger) {
      const matchedItem = filteredItems.find((item) => item.id === entry.itemId);
      const movementValue = Math.abs(entry.quantityChange) * (matchedItem?.costPrice ?? 0);
      const current = movementValueByItem.get(entry.itemId) ?? {
        movementValue: 0,
        movementQty: 0,
        events: 0,
      };
      current.movementValue += movementValue;
      current.movementQty += Math.abs(entry.quantityChange);
      current.events += 1;
      movementValueByItem.set(entry.itemId, current);
    }

    const abcCounts = { A: 0, B: 0, C: 0 };
    const sortedMovementItems = [...movementValueByItem.values()].sort(
      (left, right) => right.movementValue - left.movementValue,
    );
    const totalMovementValue = sortedMovementItems.reduce((sum, entry) => sum + entry.movementValue, 0);
    let cumulativeShare = 0;
    for (const entry of sortedMovementItems) {
      cumulativeShare += totalMovementValue > 0 ? entry.movementValue / totalMovementValue : 0;
      if (cumulativeShare <= 0.8) {
        abcCounts.A += 1;
      } else if (cumulativeShare <= 0.95) {
        abcCounts.B += 1;
      } else {
        abcCounts.C += 1;
      }
    }

    if (totalMovementValue === 0 && filteredItems.length > 0) {
      abcCounts.C = filteredItems.length;
    }

    const fastMoverCount = sortedMovementItems.filter((entry) => entry.events >= 8).length;

    const postedRequests = filteredRequests.filter((request) => request.status === "posted");
    const pickRequests = filteredRequests.filter(
      (request) => request.kind === "gin" || request.kind === "transfer",
    );
    const pickAccuracy = pickRequests.length
      ? average(
          pickRequests.map((request) => {
            const actualQuantity = filteredLedger
              .filter((entry) => entry.reference === request.reference)
              .reduce((sum, entry) => sum + Math.abs(entry.quantityChange), 0);
            return clampPercent(
              (Math.min(actualQuantity, request.quantity) / Math.max(request.quantity, 1)) * 100,
            );
          }),
        )
      : 100;

    const totalGrnRequests = filteredRequests.filter((request) => request.kind === "grn").length;
    const postedGrnRequests = filteredRequests.filter(
      (request) => request.kind === "grn" && request.status === "posted",
    ).length;
    const receivingEfficiency =
      totalGrnRequests > 0 ? (postedGrnRequests / totalGrnRequests) * 100 : 100;

    const putAwayCycleHours = average(
      postedRequests
        .filter((request) => request.kind === "grn")
        .map((request) => requestLeadHours(request, postedAtByReference))
        .filter((value): value is number => value !== null),
    );

    const orderLeadHours = average(
      postedRequests
        .map((request) => requestLeadHours(request, postedAtByReference))
        .filter((value): value is number => value !== null),
    );

    const operationalTrend = buildRollingMonths(6).map((month) => {
      const monthRequests = postedRequests.filter((request) => {
        const requestedAt = safeTimeValue(request.requestedAt);
        return requestedAt !== null && requestedAt >= month.start && requestedAt < month.end;
      });
      const monthLeadHours = monthRequests
        .map((request) => requestLeadHours(request, postedAtByReference))
        .filter((value): value is number => value !== null);
      const monthPutAwayHours = monthRequests
        .filter((request) => request.kind === "grn")
        .map((request) => requestLeadHours(request, postedAtByReference))
        .filter((value): value is number => value !== null);

      return {
        label: month.label,
        leadTime: Number(average(monthLeadHours).toFixed(1)),
        putAway: Number(average(monthPutAwayHours).toFixed(1)),
      };
    });

    return {
      totalOnHandUnits,
      totalReservedUnits,
      stockoutItemsCount,
      nearStockoutItemsCount,
      overstockItemsCount,
      accuracyRate,
      healthyItemsCount,
      locationInventoryData,
      ageStats,
      totalCapitalTied: ageStats.reduce((sum, entry) => sum + entry.value, 0),
      agedExposureValue: ageStats
        .filter((entry) => entry.label !== "0-30")
        .reduce((sum, entry) => sum + entry.value, 0),
      turnoverRatio,
      sellThroughRate,
      abcCounts,
      fastMoverCount,
      pickAccuracy,
      receivingEfficiency,
      putAwayCycleHours,
      orderLeadHours,
      operationalTrend,
    };
  }, [
    filteredExpiredAlerts,
    filteredItems,
    filteredLedger,
    filteredLowAlerts,
    filteredNearExpiryAlerts,
    filteredRequests,
    locationFilter,
    postedAtByReference,
    snapshot.locations,
    snapshot.settings.lowStockThreshold,
  ]);

  const wasteData = useMemo(() => {
    const now = Date.now();
    const rollingMonths = buildRollingMonths(12);

    const wasteTrend = rollingMonths.map((month) => {
      const current = filteredWaste
        .filter((entry) => {
          const createdAt = safeTimeValue(entry.createdAt);
          return createdAt !== null && createdAt >= month.start && createdAt < month.end;
        })
        .reduce((sum, entry) => sum + entry.quantity, 0);

      const previousStart = addMonths(new Date(month.start), -12).getTime();
      const previousEnd = addMonths(new Date(month.end), -12).getTime();
      const previous = filteredWaste
        .filter((entry) => {
          const createdAt = safeTimeValue(entry.createdAt);
          return createdAt !== null && createdAt >= previousStart && createdAt < previousEnd;
        })
        .reduce((sum, entry) => sum + entry.quantity, 0);

      return {
        label: month.label,
        current,
        previous,
      };
    });

    const diversionStats = {
      Reuse: 0,
      Compost: 0,
      Landfill: 0,
    };

    for (const entry of filteredWaste) {
      diversionStats[wasteDisposition(entry.reason)] += entry.quantity;
    }

    const totalWasteQuantity = filteredWaste.reduce((sum, entry) => sum + entry.quantity, 0);
    const divertedQuantity = diversionStats.Reuse + diversionStats.Compost;
    const diversionRate = (divertedQuantity / Math.max(totalWasteQuantity, 1)) * 100;
    const materialCost = filteredWaste.reduce((sum, entry) => sum + entry.estimatedCost, 0);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

    const currentMonthEntries = filteredWaste.filter((entry) => {
      const createdAt = safeTimeValue(entry.createdAt);
      return createdAt !== null && createdAt >= monthStart;
    });
    const quarterEntries = filteredWaste.filter((entry) => {
      const createdAt = safeTimeValue(entry.createdAt);
      return createdAt !== null && now - createdAt <= 90 * DAY_MS;
    });
    const trailingYearEntries = filteredWaste.filter((entry) => {
      const createdAt = safeTimeValue(entry.createdAt);
      return createdAt !== null && now - createdAt <= 365 * DAY_MS;
    });

    const costPeriods = [
      { label: "Month", entries: currentMonthEntries },
      { label: "Quarter", entries: quarterEntries },
      { label: "12M", entries: trailingYearEntries },
    ].map((period) => {
      const breakdown = wasteCostBreakdown(
        period.entries.reduce((sum, entry) => sum + entry.estimatedCost, 0),
      );
      return {
        label: period.label,
        segments: [
          { label: "Material", value: breakdown.material, color: CHART_COLORS.red },
          { label: "Collection", value: breakdown.collection, color: CHART_COLORS.amber },
          { label: "Transport", value: breakdown.transportation, color: CHART_COLORS.sky },
          { label: "Processing", value: breakdown.processing, color: CHART_COLORS.violet },
        ],
      };
    });

    const fullCost = wasteCostBreakdown(materialCost);

    return {
      totalWasteQuantity,
      diversionRate,
      diversionStats,
      fullCost,
      wasteTrend,
      costPeriods,
      zeroWasteProgress: diversionRate,
      landfillShare: (diversionStats.Landfill / Math.max(totalWasteQuantity, 1)) * 100,
      highestWasteMonth:
        [...wasteTrend].sort((left, right) => right.current - left.current)[0]?.label ?? "N/A",
    };
  }, [filteredWaste]);

  const movementData = useMemo(() => {
    const now = Date.now();
    const flowSummary = [
      { label: "Daily", days: 1 },
      { label: "Weekly", days: 7 },
      { label: "Monthly", days: 30 },
    ].map((period) => {
      const scopedEntries = filteredLedger.filter((entry) => {
        const createdAt = safeTimeValue(entry.createdAt);
        return createdAt !== null && now - createdAt <= period.days * DAY_MS;
      });
      const inward = scopedEntries.reduce((sum, entry) => sum + Math.max(entry.quantityChange, 0), 0);
      const outward = scopedEntries.reduce(
        (sum, entry) => sum + Math.abs(Math.min(entry.quantityChange, 0)),
        0,
      );
      return {
        label: period.label,
        segments: [
          { label: "Inward", value: inward, color: CHART_COLORS.blue },
          { label: "Outward", value: outward, color: CHART_COLORS.amber },
        ],
      };
    });

    const itemActivity = new Map<
      string,
      { itemName: string; onHand: number; lastMovementAt: number | null; movementEvents30: number }
    >();

    for (const item of filteredItems) {
      itemActivity.set(item.id, {
        itemName: item.name,
        onHand:
          locationFilter === "all"
            ? totalOnHand(item)
            : item.stocks
                .filter((stock) => stock.locationId === locationFilter)
                .reduce((sum, stock) => sum + stock.onHand, 0),
        lastMovementAt: null,
        movementEvents30: 0,
      });
    }

    for (const entry of filteredLedger) {
      const current = itemActivity.get(entry.itemId);
      if (!current) {
        continue;
      }

      const createdAt = safeTimeValue(entry.createdAt);
      if (createdAt !== null) {
        current.lastMovementAt =
          current.lastMovementAt === null ? createdAt : Math.max(current.lastMovementAt, createdAt);
        if (now - createdAt <= 30 * DAY_MS) {
          current.movementEvents30 += 1;
        }
      }
    }

    const velocityCounts = { Fast: 0, Medium: 0, Slow: 0, Dead: 0 };

    const idleRows = [...itemActivity.values()]
      .filter((entry) => entry.onHand > 0)
      .map((entry) => {
        const idleDays =
          entry.lastMovementAt === null ? Number.POSITIVE_INFINITY : (now - entry.lastMovementAt) / DAY_MS;
        let bucket: "Fast" | "Medium" | "Slow" | "Dead";
        if (entry.movementEvents30 >= 8) {
          bucket = "Fast";
        } else if (entry.movementEvents30 >= 3) {
          bucket = "Medium";
        } else if (entry.movementEvents30 >= 1) {
          bucket = "Slow";
        } else {
          bucket = "Dead";
        }
        velocityCounts[bucket] += 1;
        return {
          itemName: entry.itemName,
          onHand: entry.onHand,
          idleDays,
          bucket,
          lastMovementAt: entry.lastMovementAt,
        };
      })
      .sort((left, right) => right.idleDays - left.idleDays);

    const slowOrDeadRows = idleRows
      .filter((entry) => entry.bucket === "Slow" || entry.bucket === "Dead")
      .slice(0, 6);

    const transferRoutes = new Map<string, { label: string; quantity: number; transfers: number }>();
    for (const request of filteredRequests.filter((entry) => entry.kind === "transfer")) {
      const routeLabel = `${request.fromLocationName ?? "Unknown"} -> ${request.toLocationName ?? "Unknown"}`;
      const current = transferRoutes.get(routeLabel) ?? {
        label: routeLabel,
        quantity: 0,
        transfers: 0,
      };
      current.quantity += request.quantity;
      current.transfers += 1;
      transferRoutes.set(routeLabel, current);
    }

    const routeRows = [...transferRoutes.values()]
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 5);

    return {
      flowSummary,
      velocityCounts,
      slowOrDeadRows,
      routeRows,
      last30Inward:
        flowSummary.find((entry) => entry.label === "Monthly")?.segments[0].value ?? 0,
      last30Outward:
        flowSummary.find((entry) => entry.label === "Monthly")?.segments[1].value ?? 0,
      deadStockCount: idleRows.filter((entry) => entry.bucket === "Dead").length,
      slowStockCount: idleRows.filter((entry) => entry.bucket === "Slow").length,
      totalTransferQuantity: routeRows.reduce((sum, entry) => sum + entry.quantity, 0),
    };
  }, [filteredItems, filteredLedger, filteredRequests, locationFilter]);

  const activeDateLabel =
    DATE_FILTER_OPTIONS.find((option) => option.value === datePreset)?.label ?? "All time";
  const activeExportLabel =
    activeSection.slug === "analytics"
      ? "Export analytics data"
      : activeSection.slug === "waste-tracker"
        ? "Export waste data"
        : "Export movement data";
  const activeGenerateLabel =
    activeSection.slug === "analytics"
      ? "Generate analytics report"
      : activeSection.slug === "waste-tracker"
        ? "Generate waste report"
        : "Generate movement report";
  const activeLocationLabel =
    locationFilter === "all"
      ? "All locations"
      : snapshot.locations.find((entry) => entry.id === locationFilter)?.name ?? "Selected location";
  const activeFilterSummary = [
    activeLocationLabel,
    `Date: ${activeDateLabel}`,
    normalizedSearch ? `Search: ${deferredSearch.trim()}` : "Search: none",
  ].join(" · ");

  function buildAnalyticsSheets(): WorkbookSheet[] {
    return [
      {
        name: "Analytics Summary",
        rows: [
          { Metric: "Real-time on-hand", Value: analyticsData.totalOnHandUnits, Window: activeDateLabel },
          { Metric: "Inventory accuracy %", Value: Number(analyticsData.accuracyRate.toFixed(2)), Window: activeDateLabel },
          { Metric: "Stockout items", Value: analyticsData.stockoutItemsCount, Window: activeDateLabel },
          { Metric: "Near stockout items", Value: analyticsData.nearStockoutItemsCount, Window: activeDateLabel },
          { Metric: "Overstocked items", Value: analyticsData.overstockItemsCount, Window: activeDateLabel },
          { Metric: "Turnover ratio", Value: Number(analyticsData.turnoverRatio.toFixed(2)), Window: activeDateLabel },
          { Metric: "Sell-through %", Value: Number(analyticsData.sellThroughRate.toFixed(2)), Window: activeDateLabel },
          { Metric: "Pick accuracy %", Value: Number(analyticsData.pickAccuracy.toFixed(2)), Window: activeDateLabel },
          { Metric: "Receiving efficiency %", Value: Number(analyticsData.receivingEfficiency.toFixed(2)), Window: activeDateLabel },
          { Metric: "Put-away cycle hours", Value: Number(analyticsData.putAwayCycleHours.toFixed(2)), Window: activeDateLabel },
          { Metric: "Order lead hours", Value: Number(analyticsData.orderLeadHours.toFixed(2)), Window: activeDateLabel },
        ],
      },
      {
        name: "Inventory Snapshot",
        rows: filteredItems.map((item) => {
          const scopedStocks =
            locationFilter === "all"
              ? item.stocks
              : item.stocks.filter((stock) => stock.locationId === locationFilter);
          const onHand = scopedStocks.reduce((sum, stock) => sum + stock.onHand, 0);
          const reserved = scopedStocks.reduce((sum, stock) => sum + stock.reserved, 0);
          const isLow = scopedStocks.some((stock) => stock.onHand <= stock.minLevel);
          const isOver = scopedStocks.some((stock) => stock.maxLevel > 0 && stock.onHand > stock.maxLevel);
          return {
            SKU: item.sku,
            "Primary Barcode": item.barcode,
            Barcodes: itemBarcodeValues(item).join(", "),
            "Batch Barcodes": itemBatchBarcodeValues(item).join(", "),
            Item: item.name,
            Category: item.category,
            Supplier: supplierNameById.get(item.supplierId) ?? "",
            "On Hand": onHand,
            Reserved: reserved,
            "Cost Price": item.costPrice,
            "Stock Value": onHand * item.costPrice,
            "Low Stock": isLow ? "Yes" : "No",
            Overstocked: isOver ? "Yes" : "No",
            "Updated At": item.updatedAt,
          };
        }),
      },
      {
        name: "Alert Register",
        rows: [
          ...filteredLowAlerts.map((entry) => ({
            Type: "Low stock",
            Item: entry.itemName,
            SKU: entry.sku,
            Location: entry.locationName,
            Quantity: entry.quantity,
            Detail: entry.message,
          })),
          ...filteredNearExpiryAlerts.map((entry) => ({
            Type: "Near expiry",
            Item: entry.itemName,
            SKU: entry.sku,
            Location: entry.locationName,
            Quantity: entry.quantity,
            Detail: entry.message,
          })),
          ...filteredExpiredAlerts.map((entry) => ({
            Type: "Expired",
            Item: entry.itemName,
            SKU: entry.sku,
            Location: entry.locationName,
            Quantity: entry.quantity,
            Detail: entry.message,
          })),
        ],
      },
      {
        name: "Market Prices",
        rows: filteredMarketPrices.map((entry) => ({
          "Market Date": entry.marketDate,
          Item: entry.itemName,
          Location: entry.locationName,
          Supplier: entry.supplierName ?? "",
          Source: entry.sourceName,
          "Quoted Price": entry.quotedPrice,
          "Variance %": entry.variancePct ?? "",
        })),
      },
    ];
  }

  function buildWasteSheets(): WorkbookSheet[] {
    return [
      {
        name: "Waste Summary",
        rows: [
          { Metric: "Total waste quantity", Value: wasteData.totalWasteQuantity, Window: activeDateLabel },
          { Metric: "Diversion rate %", Value: Number(wasteData.diversionRate.toFixed(2)), Window: activeDateLabel },
          { Metric: "Total waste cost", Value: Number(wasteData.fullCost.total.toFixed(2)), Window: activeDateLabel },
          { Metric: "Landfill share %", Value: Number(wasteData.landfillShare.toFixed(2)), Window: activeDateLabel },
          { Metric: "Peak waste month", Value: wasteData.highestWasteMonth, Window: activeDateLabel },
        ],
      },
      {
        name: "Waste Entries",
        rows: filteredWaste.map((entry) => ({
          Item: entry.itemName,
          Location: entry.locationName,
          Quantity: entry.quantity,
          Unit: entry.unit,
          Reason: entry.reason,
          Shift: entry.shift,
          Station: entry.station,
          "Estimated Cost": entry.estimatedCost,
          "Created At": entry.createdAt,
          Note: entry.note,
        })),
      },
      {
        name: "Waste Trend",
        rows: wasteData.wasteTrend.map((entry) => ({
          Month: entry.label,
          "Current Period": entry.current,
          "Previous Period": entry.previous,
        })),
      },
    ];
  }

  function buildMovementSheets(): WorkbookSheet[] {
    return [
      {
        name: "Movement Summary",
        rows: [
          { Metric: "30-day inward", Value: movementData.last30Inward, Window: activeDateLabel },
          { Metric: "30-day outward", Value: movementData.last30Outward, Window: activeDateLabel },
          { Metric: "Slow stock items", Value: movementData.slowStockCount, Window: activeDateLabel },
          { Metric: "Dead stock items", Value: movementData.deadStockCount, Window: activeDateLabel },
          { Metric: "Transfer quantity", Value: movementData.totalTransferQuantity, Window: activeDateLabel },
        ],
      },
      {
        name: "Movement Ledger",
        rows: filteredLedger.map((entry) => ({
          Reference: entry.reference,
          Item: entry.itemName,
          Location: entry.locationName,
          Type: entry.changeType,
          "Qty Before": entry.quantityBefore,
          "Qty Change": entry.quantityChange,
          "Qty After": entry.quantityAfter,
          Actor: entry.actorName,
          "Created At": entry.createdAt,
          Note: entry.note,
        })),
      },
      {
        name: "Transfer Routes",
        rows: movementData.routeRows.map((route) => ({
          Route: route.label,
          Transfers: route.transfers,
          Quantity: route.quantity,
        })),
      },
    ];
  }

  async function handleExportActiveSection() {
    if (!canExportReports) {
      setFeedback("You do not have permission to export report data.");
      return;
    }
    setExportingData(true);
    setFeedback(undefined);
    try {
      if (activeSection.slug === "analytics") {
        await exportWorkbook(
          buildAnalyticsSheets(),
          `omnistock-analytics-export-${getFileDateStampForWorkspace()}.xlsx`,
        );
        setFeedback("Analytics data exported to Excel.");
      } else if (activeSection.slug === "waste-tracker") {
        await exportWasteEntries(filteredWaste);
        setFeedback("Waste data exported to Excel.");
      } else {
        await exportMovementLedger(filteredLedger);
        setFeedback("Movement data exported to Excel.");
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export the report data.");
    } finally {
      setExportingData(false);
    }
  }

  async function handleGenerateReport() {
    if (!canExportReports) {
      setFeedback("You do not have permission to generate report exports.");
      return;
    }
    setGeneratingReport(true);
    setFeedback(undefined);
    try {
      openReportDocument({
        title: activeSection.title,
        subtitle: activeSection.description,
        companyName: snapshot.settings.companyName,
        generatedBy: currentUser.name,
        generatedAt: formatDateTime(getCurrentTimestampIso()),
        filtersLabel: activeFilterSummary,
        settings: snapshot.settings,
        sheets:
          activeSection.slug === "analytics"
            ? buildAnalyticsSheets()
            : activeSection.slug === "waste-tracker"
              ? buildWasteSheets()
              : buildMovementSheets(),
      });
      setFeedback(`${activeSection.label} report preview opened using the default print template.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not generate the report.");
    } finally {
      setGeneratingReport(false);
    }
  }

  function handlePrintReport() {
    if (!canPrintReports) {
      setFeedback("You do not have permission to print reports.");
      return;
    }

    setFeedback(undefined);

    try {
      openReportDocument({
        title: activeSection.title,
        subtitle: activeSection.description,
        companyName: snapshot.settings.companyName,
        generatedBy: currentUser.name,
        generatedAt: formatDateTime(getCurrentTimestampIso()),
        filtersLabel: activeFilterSummary,
        settings: snapshot.settings,
        sheets:
          activeSection.slug === "analytics"
            ? buildAnalyticsSheets()
            : activeSection.slug === "waste-tracker"
              ? buildWasteSheets()
              : buildMovementSheets(),
        autoPrint: true,
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not open the print view.");
    }
  }

  return (
    <Stack spacing={layoutMode === "mobile" ? 2 : 2.5}>
      {layoutMode === "desktop" ? (
        <Box sx={{ px: { xs: 0.25, md: 0.5 }, py: { xs: 0.5, md: 0.75 } }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Reports & Analytics
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5 }}>
                {activeSection.title}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 780 }}>
                {activeSection.description}
              </Typography>
            </Box>

            <Box className="hero-meta" sx={{ width: { xs: "100%", lg: 360 }, maxWidth: "100%" }}>
              <Box className="meta-card" sx={{ borderRadius: "14px !important" }}>
                <span>Prepared For</span>
                <strong>{currentUser.name}</strong>
                <small>Current report session owner for exports and print actions.</small>
              </Box>
              <Box className="meta-card" sx={{ borderRadius: "14px !important" }}>
                <span>Visible Inventory Value</span>
                <strong>{formatCurrency(visibleInventoryValue, snapshot.settings.currency)}</strong>
                <small>Capital currently visible inside the active filters and reporting scope.</small>
              </Box>
            </Box>
          </Stack>
        </Box>
      ) : null}

      <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 2.5 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Filters
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              Report Controls
            </Typography>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "1.7fr 0.72fr 0.72fr",
              },
            }}
          >
            <TextField
              label="Search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Item, reference, supplier, station, or route"
              fullWidth
            />
            <TextField
              size="small"
              select
              label="Filter by location"
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value)}
              SelectProps={SAFE_MUI_SELECT_PROPS}
              fullWidth
            >
              <MenuItem value="all">All locations</MenuItem>
              {snapshot.locations.map((locationEntry) => (
                <MenuItem key={locationEntry.id} value={locationEntry.id}>
                  {locationEntry.name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              select
              label="Date range"
              value={datePreset}
              onChange={(event) => setDatePreset(event.target.value as DateFilterPreset)}
              SelectProps={SAFE_MUI_SELECT_PROPS}
              fullWidth
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {datePreset === "custom" ? (
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" } }}>
              <TextField
                size="small"
                label="Custom start date"
                type="date"
                value={customStartDate}
                onChange={(event) => setCustomStartDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                size="small"
                label="Custom end date"
                type="date"
                value={customEndDate}
                onChange={(event) => setCustomEndDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Box>
          ) : null}

          <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
            <Button
              variant="contained"
              onClick={() => void handleExportActiveSection()}
              disabled={!canExportReports || exportingData || generatingReport}
            >
              {exportingData ? "Exporting..." : activeExportLabel}
            </Button>
            <Button
              variant="outlined"
              onClick={() => void handleGenerateReport()}
              disabled={!canExportReports || exportingData || generatingReport}
            >
              {generatingReport ? "Generating..." : activeGenerateLabel}
            </Button>
            <Button variant="text" onClick={handlePrintReport} disabled={!canPrintReports}>
              Print report
            </Button>
          </Stack>

          {feedback ? <Alert severity="info">{feedback}</Alert> : null}
        </Stack>
      </Paper>

      {activeSection.slug === "analytics" ? (
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              },
            }}
          >
            <MetricCard
              label="Real-Time On-Hand"
              value={analyticsData.totalOnHandUnits.toLocaleString()}
              detail={`Reserved stock ${analyticsData.totalReservedUnits.toLocaleString()} units across the visible scope.`}
            />
            <MetricCard
              label="Inventory Accuracy"
              value={formatPercent(analyticsData.accuracyRate)}
              detail="Average count accuracy based on stock-count adjustments versus expected balances."
            />
            <MetricCard
              label="Stockout / Near Stockout"
              value={`${analyticsData.stockoutItemsCount} / ${analyticsData.nearStockoutItemsCount}`}
              detail="Items already out of stock versus items drifting into near-stockout territory."
            />
            <MetricCard
              label="Operational Lead Time"
              value={`${analyticsData.orderLeadHours.toFixed(1)}h`}
              detail="Average request-to-posting lead time across the filtered operational flow."
            />
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1.08fr 0.92fr" } }}>
            <SectionCard
              eyebrow="Inventory Levels & Accuracy"
              title="Live stock balance and record accuracy"
              caption="The chart below shows the heaviest stock-holding locations with on-hand and reserved quantities."
            >
              <Stack spacing={2}>
                <StackedBarChart data={analyticsData.locationInventoryData} />
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" } }}>
                  <InsightRow
                    label="Low-stock items"
                    value={String(filteredLowAlerts.length)}
                    caption="Items currently under minimum levels."
                  />
                  <InsightRow
                    label="Expired items"
                    value={String(filteredExpiredAlerts.length)}
                    caption="Batches already past expiry that still need action."
                  />
                  <InsightRow
                    label="Near-expiry lots"
                    value={String(filteredNearExpiryAlerts.length)}
                    caption={`Batches within the next ${snapshot.settings.expiryAlertDays} days.`}
                  />
                  <InsightRow
                    label="Healthy items"
                    value={String(analyticsData.healthyItemsCount)}
                    caption="Items currently clear of low-stock and expiry pressure."
                  />
                </Box>
              </Stack>
            </SectionCard>

            <SectionCard
              eyebrow="Inventory Aging & Value"
              title="Capital tied up by stock age"
              caption="Older buckets help expose where cash is sitting in slow-moving or aging inventory."
            >
              <Stack spacing={2}>
                <DonutChart
                  segments={analyticsData.ageStats.map((entry) => ({
                    label: `${entry.label} days`,
                    value: entry.value,
                    color: entry.color,
                  }))}
                  centerLabel="Capital"
                  centerValue={formatCurrency(analyticsData.totalCapitalTied, snapshot.settings.currency)}
                />
                <InsightRow
                  label="Total capital tied"
                  value={formatCurrency(analyticsData.totalCapitalTied, snapshot.settings.currency)}
                  caption="Current stock value held inside the filtered aging buckets."
                />
                <InsightRow
                  label="Aged exposure"
                  value={formatCurrency(analyticsData.agedExposureValue, snapshot.settings.currency)}
                  caption="Value sitting beyond 30 days and requiring stronger rotation attention."
                />
              </Stack>
            </SectionCard>
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "0.96fr 1.04fr" } }}>
            <SectionCard
              eyebrow="Movement & Velocity"
              title="Turnover, sell-through, and ABC split"
              caption="ABC segmentation is based on 30-day movement value across the current reporting filters."
            >
              <Stack spacing={2}>
                <DonutChart
                  segments={[
                    { label: "A movers", value: analyticsData.abcCounts.A, color: CHART_COLORS.blue },
                    { label: "B movers", value: analyticsData.abcCounts.B, color: CHART_COLORS.sky },
                    { label: "C movers", value: analyticsData.abcCounts.C, color: CHART_COLORS.slate },
                  ]}
                  centerLabel="Turnover"
                  centerValue={analyticsData.turnoverRatio.toFixed(2)}
                />
                <InsightRow
                  label="Sell-through rate"
                  value={formatPercent(analyticsData.sellThroughRate)}
                  caption="Outbound movement share against stock available in the same period."
                />
                <InsightRow
                  label="Fast movers"
                  value={String(analyticsData.fastMoverCount)}
                  caption="Items with 8 or more movement events in the last 30 days."
                />
              </Stack>
            </SectionCard>

            <SectionCard
              eyebrow="Fulfillment & Operational Metrics"
              title="Operational accuracy and cycle times"
              caption="These metrics use posted request history to track fulfillment pace and warehouse handling efficiency."
            >
              <Stack spacing={2}>
                <LineAreaChart
                  data={analyticsData.operationalTrend}
                  series={[
                    {
                      key: "leadTime",
                      label: "Order lead time (h)",
                      color: CHART_COLORS.blue,
                      fillOpacity: 0.12,
                    },
                    {
                      key: "putAway",
                      label: "Put-away cycle (h)",
                      color: CHART_COLORS.cyan,
                    },
                  ]}
                />
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" } }}>
                  <InsightRow
                    label="Pick accuracy"
                    value={formatPercent(analyticsData.pickAccuracy)}
                    caption="Matched issue and transfer quantity against requested quantity."
                  />
                  <InsightRow
                    label="Receiving efficiency"
                    value={formatPercent(analyticsData.receivingEfficiency)}
                    caption="Posted GRNs compared to the total GRN workload in scope."
                  />
                  <InsightRow
                    label="Put-away cycle"
                    value={`${analyticsData.putAwayCycleHours.toFixed(1)}h`}
                    caption="Average GRN request-to-posting elapsed time."
                  />
                  <InsightRow
                    label="Order lead time"
                    value={`${analyticsData.orderLeadHours.toFixed(1)}h`}
                    caption="Average end-to-end posting lead time for operational requests."
                  />
                </Box>
              </Stack>
            </SectionCard>
          </Box>

          <SectionCard
            eyebrow="Color-Coded Alerts"
            title="Immediate inventory attention zones"
            caption="Green, yellow, and red indicators show the current operational pressure points at a glance."
          >
            <Box
              sx={{
                display: "grid",
                gap: 2,
                gridTemplateColumns: {
                  xs: "1fr",
                  md: "repeat(2, minmax(0, 1fr))",
                  xl: "repeat(4, minmax(0, 1fr))",
                },
              }}
            >
              <StatusCard
                label="Green - Healthy"
                value={String(analyticsData.healthyItemsCount)}
                detail="Items currently within stocking range and clear of expiry pressure."
                accent={theme.palette.success.main}
                background={alpha(theme.palette.success.main, 0.08)}
              />
              <StatusCard
                label="Yellow - Near Expiry"
                value={String(filteredNearExpiryAlerts.length)}
                detail="Batches that should move first under FEFO before fresher lots."
                accent={theme.palette.warning.main}
                background={alpha(theme.palette.warning.main, 0.1)}
              />
              <StatusCard
                label="Red - Low / Expired"
                value={String(filteredLowAlerts.length + filteredExpiredAlerts.length)}
                detail="Combined pressure from critical stock gaps and already-expired inventory."
                accent={theme.palette.error.main}
                background={alpha(theme.palette.error.main, 0.08)}
              />
              <StatusCard
                label="Amber - Overstocked"
                value={String(analyticsData.overstockItemsCount)}
                detail="Items that exceed maximum stocking thresholds and tie up cash."
                accent={CHART_COLORS.amber}
                background={alpha(CHART_COLORS.amber, 0.1)}
              />
            </Box>
          </SectionCard>
        </Stack>
      ) : null}

      {activeSection.slug === "waste-tracker" ? (
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              },
            }}
          >
            <MetricCard
              label="Total Waste Generated"
              value={wasteData.totalWasteQuantity.toLocaleString()}
              detail="Total waste quantity across the current reporting scope."
            />
            <MetricCard
              label="Waste Diversion Rate"
              value={formatPercent(wasteData.diversionRate)}
              detail="Share of waste modeled as reused or composted instead of going to landfill."
            />
            <MetricCard
              label="Total Waste Cost"
              value={formatCurrency(wasteData.fullCost.total, snapshot.settings.currency)}
              detail="Material cost plus modeled collection, transport, and processing surcharges."
            />
            <MetricCard
              label="Zero-Waste Progress"
              value={formatPercent(wasteData.zeroWasteProgress)}
              detail="Current progress toward diverting waste away from landfill."
            />
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1.08fr 0.92fr" } }}>
            <SectionCard
              eyebrow="Total Waste Generated"
              title="12-month waste generation trend"
              caption="Current waste volume is compared against the equivalent prior-year period month by month."
            >
              <LineAreaChart
                data={wasteData.wasteTrend}
                series={[
                  {
                    key: "current",
                    label: "Current period",
                    color: CHART_COLORS.red,
                    fillOpacity: 0.12,
                  },
                  {
                    key: "previous",
                    label: "Previous period",
                    color: CHART_COLORS.slate,
                  },
                ]}
              />
            </SectionCard>

            <SectionCard
              eyebrow="Waste Diversion Rate"
              title="Diversion versus landfill pressure"
              caption="Diversion is modeled from recorded waste reasons until dedicated disposal stream tracking is added."
            >
              <Stack spacing={2}>
                <DonutChart
                  segments={[
                    { label: "Reuse", value: wasteData.diversionStats.Reuse, color: CHART_COLORS.green },
                    { label: "Compost", value: wasteData.diversionStats.Compost, color: CHART_COLORS.cyan },
                    { label: "Landfill", value: wasteData.diversionStats.Landfill, color: CHART_COLORS.red },
                  ]}
                  centerLabel="Diversion"
                  centerValue={formatPercent(wasteData.diversionRate)}
                />
                <InsightRow
                  label="Landfill share"
                  value={formatPercent(wasteData.landfillShare)}
                  caption="Waste still ending up as landfill exposure under the current classification."
                />
                <InsightRow
                  label="Peak waste month"
                  value={wasteData.highestWasteMonth}
                  caption="Highest current-period month inside the visible 12-month trend."
                />
              </Stack>
            </SectionCard>
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "0.95fr 1.05fr" } }}>
            <SectionCard
              eyebrow="Total Waste Costs"
              title="Cost stack by reporting horizon"
              caption="Shows material waste cost alongside modeled collection, transport, and processing uplifts."
            >
              <StackedBarChart data={wasteData.costPeriods} />
            </SectionCard>

            <SectionCard
              eyebrow="KPI Tracking"
              title="Sustainability goal progress"
              caption="Quick KPI tiles to track diversion performance, landfill reduction, and cost pressure."
            >
              <Box
                sx={{
                  display: "grid",
                  gap: 1.5,
                  gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
                }}
              >
                <StatusCard
                  label="Diversion Progress"
                  value={formatPercent(wasteData.zeroWasteProgress)}
                  detail="Current progress toward the zero-waste-to-landfill goal."
                  accent={theme.palette.success.main}
                  background={alpha(theme.palette.success.main, 0.08)}
                />
                <StatusCard
                  label="Landfill Reduction"
                  value={formatPercent(100 - wasteData.landfillShare)}
                  detail="Share already kept away from landfill through reuse and composting."
                  accent={theme.palette.info.main}
                  background={alpha(theme.palette.info.main, 0.08)}
                />
                <StatusCard
                  label="Cost Pressure"
                  value={formatCurrency(wasteData.fullCost.total, snapshot.settings.currency)}
                  detail="Full waste burden including logistics and handling surcharges."
                  accent={theme.palette.warning.main}
                  background={alpha(theme.palette.warning.main, 0.1)}
                />
                <StatusCard
                  label="Waste Volume"
                  value={wasteData.totalWasteQuantity.toLocaleString()}
                  detail="Total generated waste used for current sustainability score tracking."
                  accent={theme.palette.error.main}
                  background={alpha(theme.palette.error.main, 0.08)}
                />
              </Box>
            </SectionCard>
          </Box>
        </Stack>
      ) : null}

      {activeSection.slug === "movement-ledger" ? (
        <Stack spacing={2.5}>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              },
            }}
          >
            <MetricCard
              label="30-Day Inward Movement"
              value={movementData.last30Inward.toLocaleString()}
              detail="Units received or added into stock across the last monthly window."
            />
            <MetricCard
              label="30-Day Outward Movement"
              value={movementData.last30Outward.toLocaleString()}
              detail="Units issued, transferred, wasted, or adjusted out in the same window."
            />
            <MetricCard
              label="Slow / Dead Stock"
              value={`${movementData.slowStockCount} / ${movementData.deadStockCount}`}
              detail="Items with weak or no recent movement that are tying up storage and cash."
            />
            <MetricCard
              label="Transfer Flow"
              value={movementData.totalTransferQuantity.toLocaleString()}
              detail="Visible transfer quantity moved between warehouses, outlets, and branches."
            />
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "1.02fr 0.98fr" } }}>
            <SectionCard
              eyebrow="Total Inventory Movement"
              title="Daily, weekly, and monthly inward/outward flow"
              caption="Compare movement windows quickly to spot where operational load is peaking."
            >
              <StackedBarChart data={movementData.flowSummary} />
            </SectionCard>

            <SectionCard
              eyebrow="SKU Velocity"
              title="Fast, medium, slow, and dead movers"
              caption="Velocity is based on movement frequency during the last 30 days."
            >
              <Stack spacing={2}>
                <DonutChart
                  segments={[
                    { label: "Fast", value: movementData.velocityCounts.Fast, color: CHART_COLORS.green },
                    { label: "Medium", value: movementData.velocityCounts.Medium, color: CHART_COLORS.blue },
                    { label: "Slow", value: movementData.velocityCounts.Slow, color: CHART_COLORS.amber },
                    { label: "Dead", value: movementData.velocityCounts.Dead, color: CHART_COLORS.red },
                  ]}
                  centerLabel="FMS mix"
                  centerValue={String(
                    movementData.velocityCounts.Fast +
                      movementData.velocityCounts.Medium +
                      movementData.velocityCounts.Slow +
                      movementData.velocityCounts.Dead,
                  )}
                />
              </Stack>
            </SectionCard>
          </Box>

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "0.95fr 1.05fr" } }}>
            <SectionCard
              eyebrow="Slow-Moving & Dead Stock"
              title="Items needing rotation or clearance action"
              caption="Focus on items with stock still on hand but little or no recent movement."
            >
              <Stack spacing={1.25}>
                {movementData.slowOrDeadRows.length > 0 ? (
                  movementData.slowOrDeadRows.map((row) => (
                    <Paper key={`${row.itemName}-${row.bucket}`} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                      <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                        <Box minWidth={0}>
                          <Typography variant="subtitle2" fontWeight={800}>
                            {row.itemName}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>
                            On hand {row.onHand.toLocaleString()}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.55, display: "block" }}>
                            {row.lastMovementAt === null
                              ? "No movement history found in the visible scope."
                              : `Last movement ${formatDateTime(new Date(row.lastMovementAt).toISOString())}`}
                          </Typography>
                        </Box>
                        <Stack alignItems="flex-end" spacing={0.75}>
                          <Chip
                            size="small"
                            color={row.bucket === "Dead" ? "error" : "warning"}
                            label={row.bucket}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {Number.isFinite(row.idleDays) ? `${Math.round(row.idleDays)} idle days` : "No movement"}
                          </Typography>
                        </Stack>
                      </Stack>
                    </Paper>
                  ))
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No slow-moving or dead-stock items matched the current filters.
                  </Typography>
                )}
              </Stack>
            </SectionCard>

            <SectionCard
              eyebrow="Transfer Analysis"
              title="Top inter-location movement routes"
              caption="Track which transfer lanes carry the most stock and where congestion is likely to build."
            >
              <Stack spacing={2}>
                <StackedBarChart
                  data={movementData.routeRows.map((route) => ({
                    label: truncateLabel(route.label, 14),
                    segments: [{ label: "Transfer qty", value: route.quantity, color: CHART_COLORS.violet }],
                  }))}
                />
                <Stack spacing={1.25}>
                  {movementData.routeRows.length > 0 ? (
                    movementData.routeRows.map((route) => (
                      <InsightRow
                        key={route.label}
                        label={route.label}
                        value={`${route.quantity.toLocaleString()} units`}
                        caption={`${route.transfers} transfer documents posted on this route.`}
                      />
                    ))
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No transfer activity matched the current filters.
                    </Typography>
                  )}
                </Stack>
              </Stack>
            </SectionCard>
          </Box>
        </Stack>
      ) : null}
    </Stack>
  );
}
