import { useDeferredValue, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { totalOnHand } from "../../shared/selectors";
import type {
  CreateItemRequest,
  CreateLocationRequest,
  CreateMarketPriceRequest,
  CreateSupplierRequest,
  Item,
  InventorySnapshot,
  Location,
  LocationType,
  MarketPriceEntry,
  PriceCategory,
  RecordStatus,
  Supplier,
  User,
} from "../../shared/types";
import { exportMarketPrices } from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onCreateItem: (input: CreateItemRequest) => Promise<Item>;
  onCreateSupplier: (input: CreateSupplierRequest) => Promise<Supplier>;
  onCreateLocation: (input: CreateLocationRequest) => Promise<Location>;
  onCreateMarketPrice: (input: CreateMarketPriceRequest) => Promise<MarketPriceEntry>;
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

export function MasterDataPage({
  snapshot,
  currentUser,
  onCreateItem,
  onCreateSupplier,
  onCreateLocation,
  onCreateMarketPrice,
}: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? MASTER_SECTIONS[0].slug;
  const activeSection = MASTER_SECTIONS.find((section) => section.slug === activeSlug) ?? MASTER_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [itemForm, setItemForm] = useState<ItemFormState>(() => defaultItemForm(snapshot));
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(defaultSupplierForm);
  const [locationForm, setLocationForm] = useState<LocationFormState>(defaultLocationForm);
  const [priceForm, setPriceForm] = useState<PriceFormState>(() => defaultPriceForm(snapshot));
  const [feedback, setFeedback] = useState<string>();
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [savingPrice, setSavingPrice] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  useEffect(() => {
    setPriceForm((current) => {
      if (current.itemId && snapshot.items.some((item) => item.id === current.itemId)) {
        return current;
      }
      return defaultPriceForm(snapshot);
    });
    setItemForm(defaultItemForm(snapshot));
    setSupplierForm(defaultSupplierForm());
    setLocationForm(defaultLocationForm());
    setEntryOpen(false);
    setFeedback(undefined);
  }, [activeSection.slug, snapshot.generatedAt]);

  useEffect(() => {
    if (!entryOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingEntry) {
        setEntryOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [entryOpen, submittingEntry]);

  const filteredItems = snapshot.items.filter((item) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const value = deferredSearch.toLowerCase();
    return (
      item.name.toLowerCase().includes(value) ||
      item.sku.toLowerCase().includes(value) ||
      item.barcode.includes(value)
    );
  });

  const filteredSuppliers = snapshot.suppliers.filter((supplier) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const value = deferredSearch.toLowerCase();
    return (
      supplier.name.toLowerCase().includes(value) ||
      supplier.code.toLowerCase().includes(value) ||
      supplier.email.toLowerCase().includes(value) ||
      supplier.phone.includes(value)
    );
  });

  const filteredLocations = snapshot.locations.filter((locationEntry) => {
    if (!deferredSearch.trim()) {
      return true;
    }

    const value = deferredSearch.toLowerCase();
    return (
      locationEntry.name.toLowerCase().includes(value) ||
      locationEntry.code.toLowerCase().includes(value) ||
      locationEntry.city.toLowerCase().includes(value) ||
      locationEntry.type.toLowerCase().includes(value)
    );
  });

  const recentPrices = snapshot.marketPrices.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const todayPrices = snapshot.marketPrices.filter((entry) => entry.marketDate === today);
  const volatilePrices = snapshot.marketPrices.filter(
    (entry) => Math.abs(entry.variancePct ?? 0) >= 5,
  );
  const selectedItem = snapshot.items.find((item) => item.id === priceForm.itemId);
  const warehouses = snapshot.locations.filter((locationEntry) => locationEntry.type === "warehouse");
  const outlets = snapshot.locations.filter((locationEntry) => locationEntry.type === "outlet");

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

  function openEntryModal() {
    setFeedback(undefined);

    if (activeSection.slug === "items") {
      setItemForm(defaultItemForm(snapshot));
    } else if (activeSection.slug === "suppliers") {
      setSupplierForm(defaultSupplierForm());
    } else if (activeSection.slug === "locations") {
      setLocationForm(defaultLocationForm());
    }

    setEntryOpen(true);
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
      setPriceForm((current) => ({
        ...current,
        quotedPrice: selectedItem ? String(selectedItem.costPrice) : "",
        sourceName: "Daily market sheet",
        note: "",
      }));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save the market rate.");
    } finally {
      setSavingPrice(false);
    }
  }

  async function handleExportMarketPrices() {
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
      setEntryOpen(false);
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
      setEntryOpen(false);
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
      setEntryOpen(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not create the location.");
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
      <section className="hero-panel">
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
            <div className="button-row">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Filter by item, SKU, or barcode"
              />
              <button type="button" className="primary-button" onClick={openEntryModal}>
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
            <div className="button-row">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search supplier, code, email, or phone"
              />
              <button type="button" className="primary-button" onClick={openEntryModal}>
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
            <div className="button-row">
              <input
                className="table-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, location, city, or type"
              />
              <button type="button" className="primary-button" onClick={openEntryModal}>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSection.slug === "market-prices" ? (
        <>
          <section className="split-grid">
            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Restaurant Buying</p>
                  <h2>Capture Market Rate</h2>
                </div>
                <span className="status-chip neutral">{snapshot.marketPrices.length} logged rates</span>
              </div>

              <form className="form-grid compact-form" onSubmit={handleCreateMarketPrice}>
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

                <div className="button-row">
                  <button type="submit" className="primary-button" disabled={savingPrice}>
                    {savingPrice ? "Saving..." : "Save Market Rate"}
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={exporting}
                    onClick={() => void handleExportMarketPrices()}
                  >
                    {exporting ? "Exporting..." : "Export Price History"}
                  </button>
                </div>
              </form>

              {feedback ? <p className="feedback-copy">{feedback}</p> : null}
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Market Sheet</p>
                  <h2>Latest Price Entries</h2>
                </div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Item</th>
                      <th>Location</th>
                      <th>Quoted Price</th>
                      <th>Variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPrices.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          {entry.marketDate}
                          <small>{entry.sourceName}</small>
                        </td>
                        <td>
                          {entry.itemName}
                          <small>{labelForCategory(entry.category)}</small>
                        </td>
                        <td>{entry.locationName}</td>
                        <td>{formatCurrency(entry.quotedPrice, snapshot.settings.currency)}</td>
                        <td className={(entry.variancePct ?? 0) > 0 ? "text-warning" : "text-positive"}>
                          {entry.variancePct === undefined
                            ? "New"
                            : `${entry.variancePct > 0 ? "+" : ""}${entry.variancePct.toFixed(2)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {recentPrices[0] ? (
                <p className="feedback-copy">
                  Latest shared market capture was posted by {recentPrices[0].capturedByName} on{" "}
                  {formatDateTime(recentPrices[0].createdAt)}.
                </p>
              ) : null}
            </article>
          </section>
        </>
      ) : null}

      {entryOpen && activeSection.slug !== "market-prices" ? (
        <div
          className="page-popup-scrim"
          onClick={() => {
            if (!submittingEntry) {
              setEntryOpen(false);
            }
          }}
        >
          <div className="page-popup-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Master Data Entry</p>
                <h2>Add New {singularLabelForSection(activeSection.slug)}</h2>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEntryOpen(false)}
                  disabled={submittingEntry}
                >
                  Close
                </button>
              </div>
            </div>

            {activeSection.slug === "items" ? (
              <form className="form-grid compact-form" onSubmit={handleCreateItem}>
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

                <label className="field">
                  <span>Barcode</span>
                  <input
                    value={itemForm.barcode}
                    onChange={(event) => patchItem("barcode", event.target.value)}
                    placeholder="1234567890123"
                  />
                </label>

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
                    {submittingEntry ? "Saving..." : "Save Item"}
                  </button>
                </div>
              </form>
            ) : null}

            {activeSection.slug === "suppliers" ? (
              <form className="form-grid compact-form" onSubmit={handleCreateSupplier}>
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
                    {submittingEntry ? "Saving..." : "Save Supplier"}
                  </button>
                </div>
              </form>
            ) : null}

            {activeSection.slug === "locations" ? (
              <form className="form-grid compact-form" onSubmit={handleCreateLocation}>
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
                    {submittingEntry ? "Saving..." : "Save Location"}
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
