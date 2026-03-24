import { useDeferredValue, useState } from "react";
import { useLocation } from "react-router-dom";
import { lowStockItems, openRequests, totalInventoryValue } from "../../shared/selectors";
import type { InventorySnapshot, User, WasteEntry } from "../../shared/types";
import { ModuleSubnav } from "../components/ModuleSubnav";
import { exportMovementLedger, exportWasteEntries, printCurrentPage } from "../lib/export";
import { formatCurrency, formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
}

const REPORT_SECTIONS = [
  {
    slug: "analytics",
    label: "Analytics",
    title: "Analytics Overview",
    description: "Monitor inventory value, waste impact, and low-stock risk in one place.",
  },
  {
    slug: "waste-tracker",
    label: "Waste Tracker",
    title: "Waste Tracker",
    description: "Inspect detailed restaurant waste logs, reasons, stations, and shift patterns.",
  },
  {
    slug: "movement-ledger",
    label: "Movement Ledger",
    title: "Movement Ledger",
    description: "Review every stock change with actor, timing, and after-balance detail.",
  },
] as const;

function topWasteReason(entries: WasteEntry[]): string {
  if (entries.length === 0) {
    return "None";
  }

  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])[0][0]
    .replace("-", " ");
}

export function ReportsPage({ snapshot, currentUser }: Props) {
  const location = useLocation();
  const activeSlug = location.pathname.split("/")[2] ?? REPORT_SECTIONS[0].slug;
  const activeSection = REPORT_SECTIONS.find((section) => section.slug === activeSlug) ?? REPORT_SECTIONS[0];
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [feedback, setFeedback] = useState<string>();
  const [exportingLedger, setExportingLedger] = useState(false);
  const [exportingWaste, setExportingWaste] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const subnavItems = REPORT_SECTIONS.map((section) => ({
    label: section.label,
    to: `/reports/${section.slug}`,
  }));

  const filteredLedger = snapshot.movementLedger.filter((entry) => {
    const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
    const matchesSearch =
      !deferredSearch.trim()
        ? true
        : `${entry.reference} ${entry.itemName} ${entry.locationName} ${entry.actorName}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase());

    return matchesLocation && matchesSearch;
  });

  const filteredWaste = snapshot.wasteEntries.filter((entry) => {
    const matchesLocation = locationFilter === "all" ? true : entry.locationId === locationFilter;
    const matchesSearch =
      !deferredSearch.trim()
        ? true
        : `${entry.itemName} ${entry.locationName} ${entry.reason} ${entry.station} ${entry.reportedByName}`
            .toLowerCase()
            .includes(deferredSearch.toLowerCase());

    return matchesLocation && matchesSearch;
  });

  const wasteCost = filteredWaste.reduce((sum, entry) => sum + entry.estimatedCost, 0);
  const expiryWaste = filteredWaste.filter((entry) => entry.reason === "expiry");

  async function handleExportLedger() {
    setExportingLedger(true);
    setFeedback(undefined);

    try {
      await exportMovementLedger(filteredLedger);
      setFeedback("Movement ledger exported to Excel.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export the ledger.");
    } finally {
      setExportingLedger(false);
    }
  }

  async function handleExportWaste() {
    setExportingWaste(true);
    setFeedback(undefined);

    try {
      await exportWasteEntries(filteredWaste);
      setFeedback("Waste tracker exported to Excel.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not export waste entries.");
    } finally {
      setExportingWaste(false);
    }
  }

  return (
    <div className="page-stack">
      <ModuleSubnav items={subnavItems} />

      <section className="hero-panel">
        <div>
          <p className="eyebrow">Reports & Analytics</p>
          <h1>{activeSection.title}</h1>
          <p className="hero-copy">{activeSection.description}</p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>Inventory Value</span>
            <strong>{formatCurrency(totalInventoryValue(snapshot), snapshot.settings.currency)}</strong>
            <small>Calculated from cost price against current on-hand quantity.</small>
          </div>
          <div className="meta-card">
            <span>Prepared For</span>
            <strong>{currentUser.name}</strong>
            <small>Reports filtered and exported inside the live workspace.</small>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Filters</p>
            <h2>Report Controls</h2>
          </div>
        </div>

        <div className="form-grid compact-form">
          <label className="field">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Reference, item, actor, reason, or location"
            />
          </label>

          <label className="field">
            <span>Filter by location</span>
            <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="all">All locations</option>
              {snapshot.locations.map((locationEntry) => (
                <option key={locationEntry.id} value={locationEntry.id}>
                  {locationEntry.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="button-row">
          <button type="button" className="primary-button" onClick={() => void handleExportLedger()}>
            {exportingLedger ? "Exporting..." : "Export Ledger"}
          </button>
          <button type="button" className="secondary-button" onClick={() => void handleExportWaste()}>
            {exportingWaste ? "Exporting..." : "Export Waste"}
          </button>
          <button type="button" className="secondary-button" onClick={printCurrentPage}>
            Print report
          </button>
        </div>
        {feedback ? <p className="feedback-copy">{feedback}</p> : null}
      </section>

      {activeSection.slug === "analytics" ? (
        <>
          <section className="metric-grid">
            <article className="metric-card tone-positive">
              <p>Waste Cost</p>
              <strong>{formatCurrency(wasteCost, snapshot.settings.currency)}</strong>
              <small>Estimated cost of filtered waste entries in the current view.</small>
            </article>
            <article className="metric-card tone-warning">
              <p>Waste Entries</p>
              <strong>{filteredWaste.length}</strong>
              <small>Restaurant waste records matched by the current filters.</small>
            </article>
            <article className="metric-card tone-neutral">
              <p>Low Stock Items</p>
              <strong>{lowStockItems(snapshot).length}</strong>
              <small>Items below minimum threshold across the network.</small>
            </article>
            <article className="metric-card tone-neutral">
              <p>Open Requests</p>
              <strong>{openRequests(snapshot).length}</strong>
              <small>Requests still waiting for operational follow-up.</small>
            </article>
          </section>

          <section className="split-grid">
            <article className="panel print-card">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Waste Analytics</p>
                  <h2>Restaurant Waste Summary</h2>
                </div>
              </div>

              <div className="stack-list">
                <div className="list-row">
                  <div>
                    <strong>Top reason</strong>
                    <p>Most frequent write-off driver in the filtered report.</p>
                  </div>
                  <span className="status-chip warning">{topWasteReason(filteredWaste)}</span>
                </div>
                <div className="list-row">
                  <div>
                    <strong>Expiry write-offs</strong>
                    <p>Entries already linked to expired or near-expiry product removal.</p>
                  </div>
                  <span className="status-chip neutral">{expiryWaste.length}</span>
                </div>
                <div className="list-row">
                  <div>
                    <strong>Open requests</strong>
                    <p>Operational requests still waiting for follow-up.</p>
                  </div>
                  <span className="status-chip neutral">{openRequests(snapshot).length}</span>
                </div>
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Highlighted Entry</p>
                  <h2>Latest Waste Record</h2>
                </div>
              </div>

              {filteredWaste[0] ? (
                <div className="document-preview">
                  <h3>{filteredWaste[0].itemName}</h3>
                  <p>
                    {filteredWaste[0].quantity} {filteredWaste[0].unit} at {filteredWaste[0].locationName}
                  </p>
                  <p>
                    {filteredWaste[0].reason} during {filteredWaste[0].shift} shift at{" "}
                    {filteredWaste[0].station}
                  </p>
                  <small>
                    Logged by {filteredWaste[0].reportedByName} on{" "}
                    {formatDateTime(filteredWaste[0].createdAt)}
                  </small>
                </div>
              ) : (
                <p className="empty-copy">No waste entries match the current filters.</p>
              )}
            </article>
          </section>
        </>
      ) : null}

      {activeSection.slug === "waste-tracker" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Waste Tracker</p>
              <h2>Detailed Waste Log</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Reason</th>
                  <th>Shift / Station</th>
                  <th>Cost</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filteredWaste.map((entry) => (
                  <tr key={entry.id}>
                    <td>
                      {entry.itemName}
                      <small>
                        {entry.quantity} {entry.unit}
                        {entry.batchLotCode ? ` - ${entry.batchLotCode}` : ""}
                      </small>
                    </td>
                    <td>{entry.locationName}</td>
                    <td>{entry.reason}</td>
                    <td>
                      {entry.shift}
                      <small>{entry.station}</small>
                    </td>
                    <td>{formatCurrency(entry.estimatedCost, snapshot.settings.currency)}</td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {activeSection.slug === "movement-ledger" ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Movement Ledger</p>
              <h2>Detailed Report</h2>
            </div>
            <span className="status-chip neutral">Prepared for {currentUser.name}</span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Change</th>
                  <th>After</th>
                  <th>Actor</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.reference}</td>
                    <td>{entry.itemName}</td>
                    <td>{entry.locationName}</td>
                    <td className={entry.quantityChange < 0 ? "text-warning" : "text-positive"}>
                      {entry.quantityChange > 0 ? "+" : ""}
                      {entry.quantityChange}
                    </td>
                    <td>{entry.quantityAfter}</td>
                    <td>{entry.actorName}</td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
