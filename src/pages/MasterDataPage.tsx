import { useDeferredValue, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { can } from "../../shared/permissions";
import { findItemByBarcode, totalOnHand } from "../../shared/selectors";
import type {
  CreateItemRequest,
  CreateLocationRequest,
  CreateMarketPriceRequest,
  CreateSupplierRequest,
  DeleteItemRequest,
  DeleteLocationRequest,
  DeleteMarketPriceRequest,
  DeleteSupplierRequest,
  Item,
  InventorySnapshot,
  Location,
  LocationType,
  MarketPriceEntry,
  PermissionKey,
  PriceCategory,
  RecordStatus,
  Supplier,
  UpdateItemRequest,
  UpdateLocationRequest,
  UpdateMarketPriceRequest,
  UpdateSupplierRequest,
  User,
} from "../../shared/types";
import { DeleteIcon, EditIcon, ViewIcon } from "../components/AppIcons";
import { BarcodeScanner } from "../components/BarcodeScanner";
import {
  DATE_FILTER_OPTIONS,
  type DateFilterPreset,
  matchesDateFilter,
} from "../lib/dateFilters";
import { exportMarketPrices } from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onCreateItem: (input: CreateItemRequest) => Promise<Item>;
  onUpdateItem: (input: UpdateItemRequest) => Promise<Item>;
  onDeleteItem: (input: DeleteItemRequest) => Promise<void>;
  onCreateSupplier: (input: CreateSupplierRequest) => Promise<Supplier>;
  onUpdateSupplier: (input: UpdateSupplierRequest) => Promise<Supplier>;
  onDeleteSupplier: (input: DeleteSupplierRequest) => Promise<void>;
  onCreateLocation: (input: CreateLocationRequest) => Promise<Location>;
  onUpdateLocation: (input: UpdateLocationRequest) => Promise<Location>;
  onDeleteLocation: (input: DeleteLocationRequest) => Promise<void>;
  onCreateMarketPrice: (input: CreateMarketPriceRequest) => Promise<MarketPriceEntry>;
  onUpdateMarketPrice: (input: UpdateMarketPriceRequest) => Promise<MarketPriceEntry>;
  onDeleteMarketPrice: (input: DeleteMarketPriceRequest) => Promise<void>;
}

interface PriceFormState {
  itemId: string;
  category: PriceCategory;
  locationId: string;
  supplierId: string;
  quotedPrice: string;
  sourceName: string;
  marketDate: string;
  note: string;
}

interface ItemFormState {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  supplierId: string;
  costPrice: string;
  sellingPrice: string;
  status: RecordStatus;
}

interface SupplierFormState {
  code: string;
  name: string;
  email: string;
  phone: string;
  leadTimeDays: string;
  status: RecordStatus;
}

interface LocationFormState {
  code: string;
  name: string;
  type: LocationType;
  city: string;
  status: RecordStatus;
}

type MasterDialogMode = "create" | "edit" | "view" | "delete";

const MASTER_SECTIONS = [
  {
    slug: "items",
    label: "Items",
    title: "Item Catalog",
    description: "Review SKU setup, barcode details, and total stock positions.",
  },
  {
    slug: "suppliers",
    label: "Suppliers",
    title: "Supplier Directory",
    description: "Keep approved vendors, contacts, and lead times tidy and searchable.",
  },
  {
    slug: "locations",
    label: "Locations",
    title: "Warehouses & Outlets",
    description: "Track every warehouse and outlet that participates in OmniStock operations.",
  },
  {
    slug: "market-prices",
    label: "Market Prices",
    title: "Daily Market Price Tracker",
    description: "Capture changing restaurant buying rates and compare daily variance quickly.",
  },
] as const;

function inferCategory(itemCategory: string): PriceCategory {
  const normalized = itemCategory.toLowerCase();
  if (normalized.includes("oil")) {
    return "oil";
  }
  if (normalized.includes("meat") || normalized.includes("chicken") || normalized.includes("beef")) {
    return "meat";
  }
  if (normalized.includes("fish") || normalized.includes("seafood")) {
    return "seafood";
  }
  if (normalized.includes("milk") || normalized.includes("dairy") || normalized.includes("cheese")) {
    return "dairy";
  }
  if (normalized.includes("vegetable") || normalized.includes("produce")) {
    return "vegetables";
  }
  return "dry-goods";
}

function defaultPriceForm(snapshot: InventorySnapshot): PriceFormState {
  const item = snapshot.items[0];
  return {
    itemId: item?.id ?? "",
    category: inferCategory(item?.category ?? ""),
    locationId: snapshot.locations[0]?.id ?? "",
    supplierId: item?.supplierId ?? snapshot.suppliers[0]?.id ?? "",
    quotedPrice: item ? String(item.costPrice) : "",
    sourceName: "Daily market sheet",
    marketDate: new Date().toISOString().slice(0, 10),
    note: "",
  };
}

const PRICE_CATEGORIES: PriceCategory[] = [
  "meat",
  "vegetables",
  "seafood",
  "dairy",
  "dry-goods",
  "oil",
];

const CREATE_STATUSES: Array<Exclude<RecordStatus, "archived">> = ["active", "inactive"];

function labelForCategory(category: PriceCategory): string {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function singularLabelForSection(slug: (typeof MASTER_SECTIONS)[number]["slug"]): string {
  if (slug === "items") {
    return "Item";
  }
  if (slug === "suppliers") {
    return "Supplier";
  }
  if (slug === "locations") {
    return "Location";
  }
  return "Market Price";
}

function addButtonLabelForSection(slug: (typeof MASTER_SECTIONS)[number]["slug"]): string {
  return `Add New ${singularLabelForSection(slug)}`;
}

function createPermissionForSection(
  slug: (typeof MASTER_SECTIONS)[number]["slug"],
): PermissionKey {
  if (slug === "items" || slug === "market-prices") {
    return "master.items";
  }
  if (slug === "suppliers") {
    return "master.suppliers";
  }
  return "master.locations";
}

function defaultItemForm(snapshot: InventorySnapshot): ItemFormState {
  const supplier = snapshot.suppliers[0];
  return {
    sku: "",
    barcode: "",
    name: "",
    category: "",
    unit: "pcs",
    supplierId: supplier?.id ?? "",
    costPrice: "0",
    sellingPrice: "0",
    status: "active",
  };
}

function defaultSupplierForm(): SupplierFormState {
  return {
    code: "",
    name: "",
    email: "",
    phone: "",
    leadTimeDays: "0",
    status: "active",
  };
}

function defaultLocationForm(): LocationFormState {
  return {
    code: "",
    name: "",
    type: "warehouse",
    city: "",
    status: "active",
  };
}

function itemFormFromItem(item: Item): ItemFormState {
  return {
    sku: item.sku,
    barcode: item.barcode,
    name: item.name,
    category: item.category,
    unit: item.unit,
    supplierId: item.supplierId,
    costPrice: String(item.costPrice),
    sellingPrice: String(item.sellingPrice),
    status: item.status,
  };
}

function supplierFormFromSupplier(supplier: Supplier): SupplierFormState {
  return {
    code: supplier.code,
    name: supplier.name,
    email: supplier.email,
    phone: supplier.phone,
    leadTimeDays: String(supplier.leadTimeDays),
    status: supplier.status,
  };
}

function locationFormFromLocation(location: Location): LocationFormState {
  return {
    code: location.code,
    name: location.name,
    type: location.type,
    city: location.city,
    status: location.status,
  };
}

function priceFormFromEntry(entry: MarketPriceEntry): PriceFormState {
  return {
    itemId: entry.itemId,
    category: entry.category,
    locationId: entry.locationId,
    supplierId: entry.supplierId ?? "",
    quotedPrice: String(entry.quotedPrice),
    sourceName: entry.sourceName,
    marketDate: entry.marketDate,
    note: entry.note,
  };
}

export function MasterDataPage({
  snapshot,
  currentUser,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onCreateSupplier,
  onUpdateSupplier,
  onDeleteSupplier,
  onCreateLocation,
  onUpdateLocation,
  onDeleteLocation,
  onCreateMarketPrice,
  onUpdateMarketPrice,
  onDeleteMarketPrice,
}: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? MASTER_SECTIONS[0].slug;
  const activeSection = MASTER_SECTIONS.find((section) => section.slug === activeSlug) ?? MASTER_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [dialogMode, setDialogMode] = useState<MasterDialogMode | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [itemStatusFilter, setItemStatusFilter] = useState<"all" | RecordStatus>("all");
  const [supplierStatusFilter, setSupplierStatusFilter] = useState<"all" | RecordStatus>("all");
  const [locationTypeFilter, setLocationTypeFilter] = useState<"all" | LocationType>("all");
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<"all" | PriceCategory>("all");
  const [marketDatePreset, setMarketDatePreset] = useState<DateFilterPreset>("all");
  const [marketStartDate, setMarketStartDate] = useState("");
  const [marketEndDate, setMarketEndDate] = useState("");
  const [itemForm, setItemForm] = useState<ItemFormState>(() => defaultItemForm(snapshot));
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(defaultSupplierForm);
  const [locationForm, setLocationForm] = useState<LocationFormState>(defaultLocationForm);
  const [priceForm, setPriceForm] = useState<PriceFormState>(() => defaultPriceForm(snapshot));
  const [feedback, setFeedback] = useState<string>();
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const canCreateRecords = can(currentUser, createPermissionForSection(activeSection.slug));
  const canEditRecords = can(currentUser, "master.edit");
  const canDeleteRecords = can(currentUser, "master.delete");
  const canExportData = can(currentUser, "reports.export");
  useEffect(() => {
    setPriceForm((current) => {
      if (current.itemId && snapshot.items.some((item) => item.id === current.itemId)) {
        return current;
      }
      return defaultPriceForm(snapshot);
    });
    setSearch("");
    setItemStatusFilter("all");
    setSupplierStatusFilter("all");
    setLocationTypeFilter("all");
    setMarketCategoryFilter("all");
    setMarketDatePreset("all");
    setMarketStartDate("");
    setMarketEndDate("");
    setItemForm(defaultItemForm(snapshot));
    setSupplierForm(defaultSupplierForm());
    setLocationForm(defaultLocationForm());
    setDialogMode(null);
    setSelectedEntryId(null);
    setBarcodeScannerOpen(false);
    setFeedback(undefined);
  }, [activeSection.slug, snapshot.generatedAt]);

  useEffect(() => {
    if (!dialogMode) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingEntry && !savingPrice) {
        setDialogMode(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dialogMode, savingPrice, submittingEntry]);

  const filteredItems = snapshot.items.filter((item) => {
    if (item.status === "archived") {
      return false;
    }
    const matchesStatus = itemStatusFilter === "all" ? true : item.status === itemStatusFilter;
    if (!deferredSearch.trim()) {
      return matchesStatus;
    }

    const value = deferredSearch.toLowerCase();
    return matchesStatus && (
      item.name.toLowerCase().includes(value) ||
      item.sku.toLowerCase().includes(value) ||
      item.barcode.includes(value)
    );
  });

  const filteredSuppliers = snapshot.suppliers.filter((supplier) => {
    if (supplier.status === "archived") {
      return false;
    }
    const matchesStatus =
      supplierStatusFilter === "all" ? true : supplier.status === supplierStatusFilter;
    if (!deferredSearch.trim()) {
      return matchesStatus;
    }

    const value = deferredSearch.toLowerCase();
    return matchesStatus && (
      supplier.name.toLowerCase().includes(value) ||
      supplier.code.toLowerCase().includes(value) ||
      supplier.email.toLowerCase().includes(value) ||
      supplier.phone.includes(value)
    );
  });

  const filteredLocations = snapshot.locations.filter((locationEntry) => {
    if (locationEntry.status === "archived") {
      return false;
    }
    const matchesType = locationTypeFilter === "all" ? true : locationEntry.type === locationTypeFilter;
    if (!deferredSearch.trim()) {
      return matchesType;
    }

    const value = deferredSearch.toLowerCase();
    return matchesType && (
      locationEntry.name.toLowerCase().includes(value) ||
      locationEntry.code.toLowerCase().includes(value) ||
      locationEntry.city.toLowerCase().includes(value) ||
      locationEntry.type.toLowerCase().includes(value)
    );
  });

  const filteredMarketPrices = snapshot.marketPrices.filter((entry) => {
    const matchesCategory =
      marketCategoryFilter === "all" ? true : entry.category === marketCategoryFilter;
    const matchesDate = matchesDateFilter(entry.marketDate, {
      preset: marketDatePreset,
      customStartDate: marketStartDate,
      customEndDate: marketEndDate,
    });
    if (!deferredSearch.trim()) {
      return matchesCategory && matchesDate;
    }

    const value = deferredSearch.toLowerCase();
    return matchesCategory && matchesDate && (
      entry.itemName.toLowerCase().includes(value) ||
      entry.locationName.toLowerCase().includes(value) ||
      (entry.supplierName ?? "").toLowerCase().includes(value) ||
      labelForCategory(entry.category).toLowerCase().includes(value) ||
      entry.sourceName.toLowerCase().includes(value) ||
      entry.marketDate.includes(value)
    );
  });

  const today = new Date().toISOString().slice(0, 10);
  const todayPrices = snapshot.marketPrices.filter((entry) => entry.marketDate === today);
  const volatilePrices = snapshot.marketPrices.filter(
    (entry) => Math.abs(entry.variancePct ?? 0) >= 5,
  );
  const warehouses = snapshot.locations.filter((locationEntry) => locationEntry.type === "warehouse");
  const outlets = snapshot.locations.filter((locationEntry) => locationEntry.type === "outlet");
  const popupBusy = submittingEntry || savingPrice;
  const selectedItemRecord =
    activeSection.slug === "items" && selectedEntryId
      ? snapshot.items.find((item) => item.id === selectedEntryId)
      : undefined;
  const selectedSupplierRecord =
    activeSection.slug === "suppliers" && selectedEntryId
      ? snapshot.suppliers.find((supplier) => supplier.id === selectedEntryId)
      : undefined;
  const selectedLocationRecord =
    activeSection.slug === "locations" && selectedEntryId
      ? snapshot.locations.find((locationEntry) => locationEntry.id === selectedEntryId)
      : undefined;
  const selectedMarketPriceRecord =
    activeSection.slug === "market-prices" && selectedEntryId
      ? snapshot.marketPrices.find((entry) => entry.id === selectedEntryId)
      : undefined;

  function patch<K extends keyof PriceFormState>(key: K, value: PriceFormState[K]) {
    setPriceForm((current) => ({ ...current, [key]: value }));
  }

  function patchItem<K extends keyof ItemFormState>(key: K, value: ItemFormState[K]) {
    setItemForm((current) => ({ ...current, [key]: value }));
  }

  function patchSupplier<K extends keyof SupplierFormState>(
    key: K,
    value: SupplierFormState[K],
  ) {
    setSupplierForm((current) => ({ ...current, [key]: value }));
  }

  function patchLocation<K extends keyof LocationFormState>(
    key: K,
    value: LocationFormState[K],
  ) {
    setLocationForm((current) => ({ ...current, [key]: value }));
  }

  function closeDialog(force = false) {
    if (!force && popupBusy) {
      return;
    }

    setDialogMode(null);
    setSelectedEntryId(null);
    setBarcodeScannerOpen(false);
  }

  function openEntryModal() {
    if (!canCreateRecords) {
      setFeedback(`You do not have permission to add ${activeSection.label.toLowerCase()}.`);
      return;
    }
    setFeedback(undefined);
    setSelectedEntryId(null);
    setBarcodeScannerOpen(false);

    if (activeSection.slug === "items") {
      setItemForm(defaultItemForm(snapshot));
    } else if (activeSection.slug === "suppliers") {
      setSupplierForm(defaultSupplierForm());
    } else if (activeSection.slug === "locations") {
      setLocationForm(defaultLocationForm());
    } else if (activeSection.slug === "market-prices") {
      setPriceForm(defaultPriceForm(snapshot));
    }

    setDialogMode("create");
  }

  function openEditModal(entryId: string) {
    if (!canEditRecords) {
      setFeedback("You do not have permission to edit master data.");
      return;
    }
    setFeedback(undefined);
    setSelectedEntryId(entryId);
    setBarcodeScannerOpen(false);

    if (activeSection.slug === "items") {
      const item = snapshot.items.find((record) => record.id === entryId);
      if (!item) {
        return;
      }
      setItemForm(itemFormFromItem(item));
    } else if (activeSection.slug === "suppliers") {
      const supplier = snapshot.suppliers.find((record) => record.id === entryId);
      if (!supplier) {
        return;
      }
      setSupplierForm(supplierFormFromSupplier(supplier));
    } else if (activeSection.slug === "locations") {
      const locationEntry = snapshot.locations.find((record) => record.id === entryId);
      if (!locationEntry) {
        return;
      }
      setLocationForm(locationFormFromLocation(locationEntry));
    } else if (activeSection.slug === "market-prices") {
      const entry = snapshot.marketPrices.find((record) => record.id === entryId);
      if (!entry) {
        return;
      }
      setPriceForm(priceFormFromEntry(entry));
    }

    setDialogMode("edit");
  }

  function openViewModal(entryId: string) {
    setFeedback(undefined);
    setSelectedEntryId(entryId);
    setDialogMode("view");
  }

  function openDeleteModal(entryId: string) {
    if (!canDeleteRecords) {
      setFeedback("You do not have permission to delete master data.");
      return;
    }
    setFeedback(undefined);
    setSelectedEntryId(entryId);
    setDialogMode("delete");
  }

  function handleItemBarcodeDetected(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    const match = findItemByBarcode(snapshot, normalized);
    setItemForm((current) => ({
      ...current,
      barcode: normalized,
      sku: current.sku || match?.sku || "",
      name: current.name || match?.name || "",
      category: current.category || match?.category || "",
      unit: current.unit === "pcs" && match?.unit ? match.unit : current.unit,
      supplierId: current.supplierId || match?.supplierId || "",
      costPrice:
        match && (current.costPrice === "0" || !current.costPrice)
          ? String(match.costPrice)
          : current.costPrice,
      sellingPrice:
        match && (current.sellingPrice === "0" || !current.sellingPrice)
          ? String(match.sellingPrice)
          : current.sellingPrice,
    }));

    if (match) {
      setFeedback(
        `Matched existing item ${match.name} (${match.sku}). Review the filled details before saving.`,
      );
    } else {
      setFeedback(`Captured barcode ${normalized}. Complete the remaining item details and save.`);
    }

    setBarcodeScannerOpen(false);
  }

  function handleItemSelection(itemId: string) {
    const item = snapshot.items.find((record) => record.id === itemId);
    setPriceForm((current) => ({
      ...current,
      itemId,
      category: item ? inferCategory(item.category) : current.category,
      supplierId: item?.supplierId ?? current.supplierId,
      quotedPrice: item ? String(item.costPrice) : current.quotedPrice,
    }));
  }

  async function handleCreateMarketPrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);

    if (!priceForm.itemId || !priceForm.locationId || !priceForm.marketDate) {
      setFeedback("Choose an item, location, and market date before saving a rate.");
      return;
    }

    setSavingPrice(true);

    try {
      const entry = await onCreateMarketPrice({
        itemId: priceForm.itemId,
        category: priceForm.category,
        locationId: priceForm.locationId,
        supplierId: priceForm.supplierId || undefined,
        quotedPrice: Number(priceForm.quotedPrice),
        sourceName: priceForm.sourceName,
        marketDate: priceForm.marketDate,
        note: priceForm.note,
      });

      setFeedback(
        `${entry.itemName} market rate captured at ${formatCurrency(
          entry.quotedPrice,
          snapshot.settings.currency,
        )}.`,
      );
      setPriceForm(defaultPriceForm(snapshot));
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save the market rate.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleExportMarketPrices() {
    if (!canExportData) {
      setFeedback("You do not have permission to export market price data.");
      return;
    }
    setExporting(true);
    setFeedback(undefined);

    try {
      await exportMarketPrices(snapshot.marketPrices);
      setFeedback("Market price history exported to Excel.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export market prices.");
    } finally {
      setExporting(false);
    }
  }

  async function handleCreateItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const item = await onCreateItem({
        sku: itemForm.sku,
        barcode: itemForm.barcode,
        name: itemForm.name,
        category: itemForm.category,
        unit: itemForm.unit,
        supplierId: itemForm.supplierId,
        costPrice: Number(itemForm.costPrice),
        sellingPrice: Number(itemForm.sellingPrice),
        status: itemForm.status,
      });

      setFeedback(`${item.name} was added to the item catalog.`);
      setItemForm(defaultItemForm(snapshot));
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the item.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleCreateSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const supplier = await onCreateSupplier({
        code: supplierForm.code,
        name: supplierForm.name,
        email: supplierForm.email,
        phone: supplierForm.phone,
        leadTimeDays: Number(supplierForm.leadTimeDays),
        status: supplierForm.status,
      });

      setFeedback(`${supplier.name} was added to the supplier directory.`);
      setSupplierForm(defaultSupplierForm());
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the supplier.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleCreateLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const createdLocation = await onCreateLocation({
        code: locationForm.code,
        name: locationForm.name,
        type: locationForm.type,
        city: locationForm.city,
        status: locationForm.status,
      });

      setFeedback(`${createdLocation.name} was added to the location directory.`);
      setLocationForm(defaultLocationForm());
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the location.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleUpdateItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItemRecord) {
      return;
    }

    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const item = await onUpdateItem({
        itemId: selectedItemRecord.id,
        sku: itemForm.sku,
        barcode: itemForm.barcode,
        name: itemForm.name,
        category: itemForm.category,
        unit: itemForm.unit,
        supplierId: itemForm.supplierId,
        costPrice: Number(itemForm.costPrice),
        sellingPrice: Number(itemForm.sellingPrice),
        status: itemForm.status,
      });
      setFeedback(`${item.name} was updated.`);
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the item.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleUpdateSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSupplierRecord) {
      return;
    }

    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const supplier = await onUpdateSupplier({
        supplierId: selectedSupplierRecord.id,
        code: supplierForm.code,
        name: supplierForm.name,
        email: supplierForm.email,
        phone: supplierForm.phone,
        leadTimeDays: Number(supplierForm.leadTimeDays),
        status: supplierForm.status,
      });
      setFeedback(`${supplier.name} was updated.`);
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the supplier.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleUpdateLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLocationRecord) {
      return;
    }

    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      const updatedLocation = await onUpdateLocation({
        locationId: selectedLocationRecord.id,
        code: locationForm.code,
        name: locationForm.name,
        type: locationForm.type,
        city: locationForm.city,
        status: locationForm.status,
      });
      setFeedback(`${updatedLocation.name} was updated.`);
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the location.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  async function handleUpdateMarketPrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMarketPriceRecord) {
      return;
    }

    setFeedback(undefined);
    setSavingPrice(true);

    try {
      const entry = await onUpdateMarketPrice({
        marketPriceId: selectedMarketPriceRecord.id,
        itemId: priceForm.itemId,
        category: priceForm.category,
        locationId: priceForm.locationId,
        supplierId: priceForm.supplierId || undefined,
        quotedPrice: Number(priceForm.quotedPrice),
        sourceName: priceForm.sourceName,
        marketDate: priceForm.marketDate,
        note: priceForm.note,
      });
      setFeedback(`${entry.itemName} market price was updated.`);
      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update the market price.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleDeleteEntry() {
    if (!selectedEntryId) {
      return;
    }

    setFeedback(undefined);
    setSubmittingEntry(true);

    try {
      if (activeSection.slug === "items") {
        await onDeleteItem({ itemId: selectedEntryId });
        setFeedback("Item removed from the active catalog.");
      } else if (activeSection.slug === "suppliers") {
        await onDeleteSupplier({ supplierId: selectedEntryId });
        setFeedback("Supplier removed from the active directory.");
      } else if (activeSection.slug === "locations") {
        await onDeleteLocation({ locationId: selectedEntryId });
        setFeedback("Location removed from the active list.");
      } else if (activeSection.slug === "market-prices") {
        await onDeleteMarketPrice({ marketPriceId: selectedEntryId });
        setFeedback("Market price entry deleted.");
      }

      closeDialog(true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not delete this entry.");
    } finally {
      setSubmittingEntry(false);
    }
  }

  let heroStats: Array<{ label: string; value: string; detail: string }>;
  if (activeSection.slug === "items") {
    heroStats = [
      {
        label: "Items",
        value: String(snapshot.items.length),
        detail: "Active SKU records across the restaurant network.",
      },
      {
        label: "Tracked Units",
        value: String(new Set(snapshot.items.map((item) => item.unit)).size),
        detail: "Different unit styles in the item catalog.",
      },
    ];
  } else if (activeSection.slug === "suppliers") {
    const averageLead =
      snapshot.suppliers.length === 0
        ? 0
        : Math.round(
            snapshot.suppliers.reduce((sum, supplier) => sum + supplier.leadTimeDays, 0) /
              snapshot.suppliers.length,
          );
    heroStats = [
      {
        label: "Suppliers",
        value: String(snapshot.suppliers.length),
        detail: "Approved vendors available for restaurant purchasing.",
      },
      {
        label: "Avg Lead Time",
        value: `${averageLead} days`,
        detail: "Average inbound lead time across supplier records.",
      },
    ];
  } else if (activeSection.slug === "locations") {
    heroStats = [
      {
        label: "Warehouses",
        value: String(warehouses.length),
        detail: "Stock-holding warehouse locations in the network.",
      },
      {
        label: "Outlets",
        value: String(outlets.length),
        detail: "Restaurants and outlets receiving inventory issues.",
      },
    ];
  } else {
    heroStats = [
      {
        label: "Today's Rates",
        value: String(todayPrices.length),
        detail: "Fresh market captures logged into OmniStock today.",
      },
      {
        label: "High Variance",
        value: String(volatilePrices.length),
        detail: "Rates with a 5% or greater change versus the prior quote.",
      },
    ];
  }

  return (
    <div className="page-stack">
      <section className="page-intro">
        <div>
          <p className="eyebrow">Master Data</p>
          <h1>{activeSection.title}</h1>
          <p className="hero-copy">
            {activeSection.description} {currentUser.name} can review records across{" "}
            {snapshot.locations.length} active facilities and outlets.
          </p>
        </div>

        <div className="hero-meta">
          {heroStats.map((stat) => (
            <div key={stat.label} className="meta-card">
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </div>
          ))}
        </div>
      </section>

      {activeSection.slug === "items" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Item Catalog</p>
              <h2>SKU Registry</h2>
            </div>
            <div className="table-toolbar">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by item, SKU, or barcode"
              />
              <select
                value={itemStatusFilter}
                onChange={(event) => setItemStatusFilter(event.target.value as "all" | RecordStatus)}
              >
                <option value="all">All statuses</option>
                {CREATE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primary-button"
                onClick={openEntryModal}
                disabled={!canCreateRecords}
              >
                {addButtonLabelForSection(activeSection.slug)}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>SKU / Barcode</th>
                  <th>Category</th>
                  <th>Supplier</th>
                  <th>Total Stock</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td>
                      {item.sku}
                      <small>{item.barcode}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>
                      {snapshot.suppliers.find((supplier) => supplier.id === item.supplierId)?.name}
                    </td>
                    <td>
                      {totalOnHand(item)} {item.unit}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="action-icon-button"
                          onClick={() => openViewModal(item.id)}
                          aria-label={`View ${item.name}`}
                          title="View"
                        >
                          <ViewIcon size={16} />
                        </button>
                        {canEditRecords ? (
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => openEditModal(item.id)}
                            aria-label={`Edit ${item.name}`}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        ) : null}
                        {canDeleteRecords ? (
                          <button
                            type="button"
                            className="action-icon-button danger"
                            onClick={() => openDeleteModal(item.id)}
                            aria-label={`Delete ${item.name}`}
                            title="Delete"
                          >
                            <DeleteIcon size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSection.slug === "suppliers" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Suppliers</p>
              <h2>Approved Vendor Directory</h2>
            </div>
            <div className="table-toolbar">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search supplier, code, email, or phone"
              />
              <select
                value={supplierStatusFilter}
                onChange={(event) => setSupplierStatusFilter(event.target.value as "all" | RecordStatus)}
              >
                <option value="all">All statuses</option>
                {CREATE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="primary-button"
                onClick={openEntryModal}
                disabled={!canCreateRecords}
              >
                {addButtonLabelForSection(activeSection.slug)}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Code</th>
                  <th>Contact</th>
                  <th>Lead Time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.name}</td>
                    <td>{supplier.code}</td>
                    <td>
                      {supplier.email}
                      <small>{supplier.phone}</small>
                    </td>
                    <td>{supplier.leadTimeDays} days</td>
                    <td>{supplier.status}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="action-icon-button"
                          onClick={() => openViewModal(supplier.id)}
                          aria-label={`View ${supplier.name}`}
                          title="View"
                        >
                          <ViewIcon size={16} />
                        </button>
                        {canEditRecords ? (
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => openEditModal(supplier.id)}
                            aria-label={`Edit ${supplier.name}`}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        ) : null}
                        {canDeleteRecords ? (
                          <button
                            type="button"
                            className="action-icon-button danger"
                            onClick={() => openDeleteModal(supplier.id)}
                            aria-label={`Delete ${supplier.name}`}
                            title="Delete"
                          >
                            <DeleteIcon size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSection.slug === "locations" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Facilities</p>
              <h2>Warehouses & Outlets</h2>
            </div>
            <div className="table-toolbar">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, location, city, or type"
              />
              <select
                value={locationTypeFilter}
                onChange={(event) => setLocationTypeFilter(event.target.value as "all" | LocationType)}
              >
                <option value="all">All types</option>
                <option value="warehouse">Warehouse</option>
                <option value="outlet">Outlet</option>
              </select>
              <button
                type="button"
                className="primary-button"
                onClick={openEntryModal}
                disabled={!canCreateRecords}
              >
                {addButtonLabelForSection(activeSection.slug)}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Location</th>
                  <th>Code</th>
                  <th>Type</th>
                  <th>City</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLocations.map((locationEntry) => (
                  <tr key={locationEntry.id}>
                    <td>{locationEntry.name}</td>
                    <td>{locationEntry.code}</td>
                    <td>{locationEntry.type}</td>
                    <td>{locationEntry.city}</td>
                    <td>{locationEntry.status}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="action-icon-button"
                          onClick={() => openViewModal(locationEntry.id)}
                          aria-label={`View ${locationEntry.name}`}
                          title="View"
                        >
                          <ViewIcon size={16} />
                        </button>
                        {canEditRecords ? (
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => openEditModal(locationEntry.id)}
                            aria-label={`Edit ${locationEntry.name}`}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        ) : null}
                        {canDeleteRecords ? (
                          <button
                            type="button"
                            className="action-icon-button danger"
                            onClick={() => openDeleteModal(locationEntry.id)}
                            aria-label={`Delete ${locationEntry.name}`}
                            title="Delete"
                          >
                            <DeleteIcon size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSection.slug === "market-prices" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Restaurant Buying</p>
              <h2>Daily Market Price Tracker</h2>
            </div>
            <div className="table-toolbar">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item, supplier, location, source, or date"
              />
              <select
                value={marketCategoryFilter}
                onChange={(event) => setMarketCategoryFilter(event.target.value as "all" | PriceCategory)}
              >
                <option value="all">All categories</option>
                {PRICE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {labelForCategory(category)}
                  </option>
                ))}
              </select>
              <select
                value={marketDatePreset}
                onChange={(event) => setMarketDatePreset(event.target.value as DateFilterPreset)}
              >
                {DATE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {marketDatePreset === "custom" ? (
                <>
                  <input
                    type="date"
                    value={marketStartDate}
                    onChange={(event) => setMarketStartDate(event.target.value)}
                  />
                  <input
                    type="date"
                    value={marketEndDate}
                    onChange={(event) => setMarketEndDate(event.target.value)}
                  />
                </>
              ) : null}
              <button
                type="button"
                className="secondary-button"
                disabled={exporting || !canExportData}
                onClick={() => void handleExportMarketPrices()}
              >
                {exporting ? "Exporting..." : "Export Price History"}
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={openEntryModal}
                disabled={!canCreateRecords}
              >
                {addButtonLabelForSection(activeSection.slug)}
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Supplier / Location</th>
                  <th>Quoted Price</th>
                  <th>Variance</th>
                  <th>Source</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMarketPrices.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.marketDate}
                      <small>{formatDateTime(entry.createdAt)}</small>
                    </td>
                    <td>
                      {entry.itemName}
                      <small>{labelForCategory(entry.category)}</small>
                    </td>
                    <td>
                      {entry.supplierName ?? "Open market"}
                      <small>{entry.locationName}</small>
                    </td>
                    <td>{formatCurrency(entry.quotedPrice, snapshot.settings.currency)}</td>
                    <td className={(entry.variancePct ?? 0) > 0 ? "text-warning" : "text-positive"}>
                      {entry.variancePct === undefined
                        ? "New"
                        : `${entry.variancePct > 0 ? "+" : ""}${entry.variancePct.toFixed(2)}%`}
                    </td>
                    <td>{entry.sourceName}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="action-icon-button"
                          onClick={() => openViewModal(entry.id)}
                          aria-label={`View ${entry.itemName}`}
                          title="View"
                        >
                          <ViewIcon size={16} />
                        </button>
                        {canEditRecords ? (
                          <button
                            type="button"
                            className="action-icon-button"
                            onClick={() => openEditModal(entry.id)}
                            aria-label={`Edit ${entry.itemName}`}
                            title="Edit"
                          >
                            <EditIcon size={16} />
                          </button>
                        ) : null}
                        {canDeleteRecords ? (
                          <button
                            type="button"
                            className="action-icon-button danger"
                            onClick={() => openDeleteModal(entry.id)}
                            aria-label={`Delete ${entry.itemName}`}
                            title="Delete"
                          >
                            <DeleteIcon size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {feedback ? <p className="feedback-copy">{feedback}</p> : null}
        </section>
      ) : null}

      {dialogMode ? (
        <div
          className="page-popup-scrim"
          onClick={() => {
            if (!popupBusy) {
              closeDialog();
            }
          }}
        >
          <div className="page-popup-card entry-popup-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">
                  {dialogMode === "view"
                    ? "Entry Details"
                    : dialogMode === "delete"
                      ? "Delete Entry"
                      : "Master Data Entry"}
                </p>
                <h2>
                  {dialogMode === "create"
                    ? `Add New ${singularLabelForSection(activeSection.slug)}`
                    : dialogMode === "edit"
                      ? `Edit ${singularLabelForSection(activeSection.slug)}`
                      : dialogMode === "delete"
                        ? `Delete ${singularLabelForSection(activeSection.slug)}`
                        : `${singularLabelForSection(activeSection.slug)} Details`}
                </h2>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => closeDialog()}
                  disabled={popupBusy}
                >
                  Close
                </button>
              </div>
            </div>

            {dialogMode === "view" && activeSection.slug === "items" && selectedItemRecord ? (
              <dl className="detail-list">
                <div><dt>ID</dt><dd>{selectedItemRecord.id}</dd></div>
                <div><dt>Name</dt><dd>{selectedItemRecord.name}</dd></div>
                <div><dt>SKU</dt><dd>{selectedItemRecord.sku}</dd></div>
                <div><dt>Barcode</dt><dd>{selectedItemRecord.barcode}</dd></div>
                <div><dt>Category</dt><dd>{selectedItemRecord.category}</dd></div>
                <div><dt>Unit</dt><dd>{selectedItemRecord.unit}</dd></div>
                <div>
                  <dt>Supplier</dt>
                  <dd>{snapshot.suppliers.find((supplier) => supplier.id === selectedItemRecord.supplierId)?.name ?? "Unknown"}</dd>
                </div>
                <div><dt>Cost Price</dt><dd>{formatCurrency(selectedItemRecord.costPrice, snapshot.settings.currency)}</dd></div>
                <div><dt>Selling Price</dt><dd>{formatCurrency(selectedItemRecord.sellingPrice, snapshot.settings.currency)}</dd></div>
                <div><dt>Status</dt><dd>{selectedItemRecord.status}</dd></div>
                <div><dt>Total Stock</dt><dd>{totalOnHand(selectedItemRecord)} {selectedItemRecord.unit}</dd></div>
                <div><dt>Updated</dt><dd>{formatDateTime(selectedItemRecord.updatedAt)}</dd></div>
              </dl>
            ) : null}

            {dialogMode === "view" && activeSection.slug === "suppliers" && selectedSupplierRecord ? (
              <dl className="detail-list">
                <div><dt>ID</dt><dd>{selectedSupplierRecord.id}</dd></div>
                <div><dt>Name</dt><dd>{selectedSupplierRecord.name}</dd></div>
                <div><dt>Code</dt><dd>{selectedSupplierRecord.code}</dd></div>
                <div><dt>Email</dt><dd>{selectedSupplierRecord.email}</dd></div>
                <div><dt>Phone</dt><dd>{selectedSupplierRecord.phone}</dd></div>
                <div><dt>Lead Time</dt><dd>{selectedSupplierRecord.leadTimeDays} days</dd></div>
                <div><dt>Status</dt><dd>{selectedSupplierRecord.status}</dd></div>
              </dl>
            ) : null}

            {dialogMode === "view" && activeSection.slug === "locations" && selectedLocationRecord ? (
              <dl className="detail-list">
                <div><dt>ID</dt><dd>{selectedLocationRecord.id}</dd></div>
                <div><dt>Name</dt><dd>{selectedLocationRecord.name}</dd></div>
                <div><dt>Code</dt><dd>{selectedLocationRecord.code}</dd></div>
                <div><dt>Type</dt><dd>{selectedLocationRecord.type}</dd></div>
                <div><dt>City</dt><dd>{selectedLocationRecord.city || "Not set"}</dd></div>
                <div><dt>Status</dt><dd>{selectedLocationRecord.status}</dd></div>
              </dl>
            ) : null}

            {dialogMode === "view" && activeSection.slug === "market-prices" && selectedMarketPriceRecord ? (
              <dl className="detail-list">
                <div><dt>ID</dt><dd>{selectedMarketPriceRecord.id}</dd></div>
                <div><dt>Date</dt><dd>{selectedMarketPriceRecord.marketDate}</dd></div>
                <div><dt>Item</dt><dd>{selectedMarketPriceRecord.itemName}</dd></div>
                <div><dt>Category</dt><dd>{labelForCategory(selectedMarketPriceRecord.category)}</dd></div>
                <div><dt>Location</dt><dd>{selectedMarketPriceRecord.locationName}</dd></div>
                <div><dt>Supplier</dt><dd>{selectedMarketPriceRecord.supplierName ?? "Open market"}</dd></div>
                <div><dt>Quoted Price</dt><dd>{formatCurrency(selectedMarketPriceRecord.quotedPrice, snapshot.settings.currency)}</dd></div>
                <div><dt>Variance</dt><dd>{selectedMarketPriceRecord.variancePct === undefined ? "New" : `${selectedMarketPriceRecord.variancePct > 0 ? "+" : ""}${selectedMarketPriceRecord.variancePct.toFixed(2)}%`}</dd></div>
                <div><dt>Source</dt><dd>{selectedMarketPriceRecord.sourceName}</dd></div>
                <div><dt>Captured By</dt><dd>{selectedMarketPriceRecord.capturedByName}</dd></div>
                <div><dt>Created</dt><dd>{formatDateTime(selectedMarketPriceRecord.createdAt)}</dd></div>
                <div className="detail-list-wide"><dt>Note</dt><dd>{selectedMarketPriceRecord.note || "No note provided."}</dd></div>
              </dl>
            ) : null}

            {dialogMode === "delete" ? (
              <div className="confirm-dialog">
                <p className="confirm-copy">
                  This will remove the selected {singularLabelForSection(activeSection.slug).toLowerCase()} from the active list.
                </p>
                <div className="button-row">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => closeDialog()}
                    disabled={submittingEntry}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-button danger-button"
                    onClick={() => void handleDeleteEntry()}
                    disabled={submittingEntry}
                  >
                    {submittingEntry ? "Deleting..." : `Confirm Delete ${singularLabelForSection(activeSection.slug)}`}
                  </button>
                </div>
              </div>
            ) : null}

            {(dialogMode === "create" || dialogMode === "edit") && activeSection.slug === "items" ? (
              <form
                className="form-grid compact-form"
                onSubmit={dialogMode === "edit" ? handleUpdateItem : handleCreateItem}
              >
                <label className="field">
                  <span>Item name</span>
                  <input
                    value={itemForm.name}
                    onChange={(event) => patchItem("name", event.target.value)}
                    placeholder="Chicken Breast Fillet"
                  />
                </label>

                <label className="field">
                  <span>SKU</span>
                  <input
                    value={itemForm.sku}
                    onChange={(event) => patchItem("sku", event.target.value)}
                    placeholder="CHK-BRST-001"
                  />
                </label>

                <div className="field field-wide">
                  <span>Barcode</span>
                  <div className="barcode-field-toolbar">
                    <input
                      value={itemForm.barcode}
                      onChange={(event) => patchItem("barcode", event.target.value)}
                      placeholder="1234567890123"
                    />
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => setBarcodeScannerOpen((current) => !current)}
                    >
                      {barcodeScannerOpen ? "Hide Scanner" : "Scan Barcode"}
                    </button>
                  </div>
                </div>

                {barcodeScannerOpen ? <BarcodeScanner onDetected={handleItemBarcodeDetected} /> : null}

                <label className="field">
                  <span>Category</span>
                  <input
                    value={itemForm.category}
                    onChange={(event) => patchItem("category", event.target.value)}
                    placeholder="Meat"
                  />
                </label>

                <label className="field">
                  <span>Unit</span>
                  <input
                    value={itemForm.unit}
                    onChange={(event) => patchItem("unit", event.target.value)}
                    placeholder="kg"
                  />
                </label>

                <label className="field">
                  <span>Supplier</span>
                  <select
                    value={itemForm.supplierId}
                    onChange={(event) => patchItem("supplierId", event.target.value)}
                  >
                    <option value="">Select a supplier</option>
                    {snapshot.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Cost price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.costPrice}
                    onChange={(event) => patchItem("costPrice", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Selling price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.sellingPrice}
                    onChange={(event) => patchItem("sellingPrice", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    value={itemForm.status}
                    onChange={(event) => patchItem("status", event.target.value as RecordStatus)}
                  >
                    {CREATE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="button-row field-wide">
                  <button type="submit" className="primary-button" disabled={submittingEntry}>
                    {submittingEntry ? "Saving..." : dialogMode === "edit" ? "Update Item" : "Save Item"}
                  </button>
                </div>
              </form>
            ) : null}

            {(dialogMode === "create" || dialogMode === "edit") && activeSection.slug === "suppliers" ? (
              <form
                className="form-grid compact-form"
                onSubmit={dialogMode === "edit" ? handleUpdateSupplier : handleCreateSupplier}
              >
                <label className="field">
                  <span>Supplier name</span>
                  <input
                    value={supplierForm.name}
                    onChange={(event) => patchSupplier("name", event.target.value)}
                    placeholder="Fresh Farms"
                  />
                </label>

                <label className="field">
                  <span>Code</span>
                  <input
                    value={supplierForm.code}
                    onChange={(event) => patchSupplier("code", event.target.value)}
                    placeholder="SUP-FF"
                  />
                </label>

                <label className="field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(event) => patchSupplier("email", event.target.value)}
                    placeholder="orders@freshfarms.com"
                  />
                </label>

                <label className="field">
                  <span>Phone</span>
                  <input
                    value={supplierForm.phone}
                    onChange={(event) => patchSupplier("phone", event.target.value)}
                    placeholder="+92 300 0000000"
                  />
                </label>

                <label className="field">
                  <span>Lead time (days)</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={supplierForm.leadTimeDays}
                    onChange={(event) => patchSupplier("leadTimeDays", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    value={supplierForm.status}
                    onChange={(event) => patchSupplier("status", event.target.value as RecordStatus)}
                  >
                    {CREATE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="button-row field-wide">
                  <button type="submit" className="primary-button" disabled={submittingEntry}>
                    {submittingEntry ? "Saving..." : dialogMode === "edit" ? "Update Supplier" : "Save Supplier"}
                  </button>
                </div>
              </form>
            ) : null}

            {(dialogMode === "create" || dialogMode === "edit") && activeSection.slug === "locations" ? (
              <form
                className="form-grid compact-form"
                onSubmit={dialogMode === "edit" ? handleUpdateLocation : handleCreateLocation}
              >
                <label className="field">
                  <span>Location name</span>
                  <input
                    value={locationForm.name}
                    onChange={(event) => patchLocation("name", event.target.value)}
                    placeholder="Central Warehouse"
                  />
                </label>

                <label className="field">
                  <span>Code</span>
                  <input
                    value={locationForm.code}
                    onChange={(event) => patchLocation("code", event.target.value)}
                    placeholder="WH-001"
                  />
                </label>

                <label className="field">
                  <span>Type</span>
                  <select
                    value={locationForm.type}
                    onChange={(event) => patchLocation("type", event.target.value as LocationType)}
                  >
                    <option value="warehouse">Warehouse</option>
                    <option value="outlet">Outlet</option>
                  </select>
                </label>

                <label className="field">
                  <span>City</span>
                  <input
                    value={locationForm.city}
                    onChange={(event) => patchLocation("city", event.target.value)}
                    placeholder="Karachi"
                  />
                </label>

                <label className="field">
                  <span>Status</span>
                  <select
                    value={locationForm.status}
                    onChange={(event) => patchLocation("status", event.target.value as RecordStatus)}
                  >
                    {CREATE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="button-row field-wide">
                  <button type="submit" className="primary-button" disabled={submittingEntry}>
                    {submittingEntry ? "Saving..." : dialogMode === "edit" ? "Update Location" : "Save Location"}
                  </button>
                </div>
              </form>
            ) : null}

            {(dialogMode === "create" || dialogMode === "edit") && activeSection.slug === "market-prices" ? (
              <form
                className="form-grid compact-form"
                onSubmit={dialogMode === "edit" ? handleUpdateMarketPrice : handleCreateMarketPrice}
              >
                <label className="field">
                  <span>Item</span>
                  <select
                    value={priceForm.itemId}
                    onChange={(event) => handleItemSelection(event.target.value)}
                  >
                    {snapshot.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Market category</span>
                  <select
                    value={priceForm.category}
                    onChange={(event) => patch("category", event.target.value as PriceCategory)}
                  >
                    {PRICE_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {labelForCategory(category)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Location</span>
                  <select
                    value={priceForm.locationId}
                    onChange={(event) => patch("locationId", event.target.value)}
                  >
                    {snapshot.locations.map((locationEntry) => (
                      <option key={locationEntry.id} value={locationEntry.id}>
                        {locationEntry.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Supplier</span>
                  <select
                    value={priceForm.supplierId}
                    onChange={(event) => patch("supplierId", event.target.value)}
                  >
                    <option value="">No supplier</option>
                    {snapshot.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Quoted price</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceForm.quotedPrice}
                    onChange={(event) => patch("quotedPrice", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Market date</span>
                  <input
                    type="date"
                    value={priceForm.marketDate}
                    onChange={(event) => patch("marketDate", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Source</span>
                  <input
                    value={priceForm.sourceName}
                    onChange={(event) => patch("sourceName", event.target.value)}
                    placeholder="Market board, supplier call, or Excel import reference"
                  />
                </label>

                <label className="field field-wide">
                  <span>Note</span>
                  <textarea
                    rows={4}
                    value={priceForm.note}
                    onChange={(event) => patch("note", event.target.value)}
                    placeholder="Capture delivery assumptions, freight notes, or supplier context."
                  />
                </label>

                <div className="button-row field-wide">
                  <button type="submit" className="primary-button" disabled={savingPrice}>
                    {savingPrice
                      ? "Saving..."
                      : dialogMode === "edit"
                        ? "Update Market Price"
                        : "Save Market Price"}
                  </button>
                </div>
              </form>
            ) : null}

            {feedback ? <p className="feedback-copy">{feedback}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
