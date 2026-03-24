import { useDeferredValue, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { totalOnHand } from "../../shared/selectors";
import type {
  CreateMarketPriceRequest,
  InventorySnapshot,
  MarketPriceEntry,
  PriceCategory,
  User,
} from "../../shared/types";
import { ModuleSubnav } from "../components/ModuleSubnav";
import { exportMarketPrices } from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
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

function labelForCategory(category: PriceCategory): string {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function MasterDataPage({ snapshot, currentUser, onCreateMarketPrice }: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? MASTER_SECTIONS[0].slug;
  const activeSection = MASTER_SECTIONS.find((section) => section.slug === activeSlug) ?? MASTER_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [priceForm, setPriceForm] = useState<PriceFormState>(() => defaultPriceForm(snapshot));
  const [feedback, setFeedback] = useState<string>();
  const [savingPrice, setSavingPrice] = useState(false);
  const [exporting, setExporting] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const subnavItems = MASTER_SECTIONS.map((section) => ({
    label: section.label,
    to: `/master-data/${section.slug}`,
  }));

  useEffect(() => {
    setPriceForm((current) => {
      if (current.itemId && snapshot.items.some((item) => item.id === current.itemId)) {
        return current;
      }
      return defaultPriceForm(snapshot);
    });
    setFeedback(undefined);
  }, [snapshot.generatedAt]);

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
      <ModuleSubnav items={subnavItems} />

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
            <input
              className="table-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filter by item, SKU, or barcode"
            />
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
            <input
              className="table-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search supplier, code, email, or phone"
            />
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
            <input
              className="table-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code, location, city, or type"
            />
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
    </div>
  );
}
