import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  dashboardMetrics,
  expiredAlerts,
  inventoryAlerts,
  lowStockAlerts,
  nearExpiryAlerts,
  openRequests,
  recentLedger,
  visibleModuleCount,
} from "../../shared/selectors";
import type { InventoryAlert, InventorySnapshot, User } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import type { SyncState } from "../lib/useOmniStockApp";
import {
  AlertIcon,
  ClockIcon,
  CurrencyIcon,
  InventoryIcon,
  PlusIcon,
  ReportsIcon,
} from "../components/AppIcons";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  syncState: SyncState;
}

type AlertTab = "low-stock" | "near-expiry" | "expired";

const ALERT_COPY: Record<AlertTab, { title: string; empty: string }> = {
  "low-stock": {
    title: "Low Stock",
    empty: "No low-stock alerts right now.",
  },
  "near-expiry": {
    title: "Near Expiry",
    empty: "No batches are nearing expiry inside the alert window.",
  },
  expired: {
    title: "Expired",
    empty: "No expired stock is currently sitting in inventory.",
  },
};

const GUIDE_STORAGE_PREFIX = "omnistock:first-login-guide:";
const FIRST_LOGIN_STEPS = [
  {
    title: "Check alerts first",
    detail: "Review low stock, near-expiry, and expired items before starting daily issue or receiving.",
  },
  {
    title: "Post operations from Inventory OPS",
    detail: "Use GRN, GIN, transfers, adjustments, counts, and wastage with barcode support where needed.",
  },
  {
    title: "Keep master data clean",
    detail: "Maintain items, suppliers, warehouses, outlets, and market prices before transaction volume grows.",
  },
  {
    title: "Monitor reports every day",
    detail: "Use the reports area for movement history, waste analysis, expiry exposure, exports, and prints.",
  },
];

function alertListForTab(snapshot: InventorySnapshot, tab: AlertTab): InventoryAlert[] {
  if (tab === "low-stock") {
    return lowStockAlerts(snapshot);
  }

  if (tab === "near-expiry") {
    return nearExpiryAlerts(snapshot);
  }

  return expiredAlerts(snapshot);
}

function locationCoverage(snapshot: InventorySnapshot, locationId: string): number {
  const stocks = snapshot.items
    .flatMap((item) =>
      item.stocks
        .filter((stock) => stock.locationId === locationId)
        .map((stock) => ({
          onHand: stock.onHand,
          minLevel: stock.minLevel,
        })),
    )
    .filter((stock) => stock.onHand > 0 || stock.minLevel > 0);

  if (stocks.length === 0) {
    return 100;
  }

  const healthy = stocks.filter((stock) => stock.onHand > stock.minLevel).length;
  return Math.round((healthy / stocks.length) * 100);
}

function statIcon(label: string) {
  if (label.includes("Value")) {
    return CurrencyIcon;
  }

  if (label.includes("Low")) {
    return AlertIcon;
  }

  if (label.includes("Expiry")) {
    return ClockIcon;
  }

  return InventoryIcon;
}

function statTone(label: string): "emerald" | "blue" | "amber" | "rose" {
  if (label.includes("Value")) {
    return "emerald";
  }

  if (label.includes("Low")) {
    return "amber";
  }

  if (label.includes("Expiry")) {
    return "rose";
  }

  return "blue";
}

export function DashboardPage({ snapshot, currentUser, syncState }: Props) {
  const [alertTab, setAlertTab] = useState<AlertTab>("low-stock");
  const [showGuide, setShowGuide] = useState(false);
  const metricCards = dashboardMetrics(snapshot);
  const pendingRequests = openRequests(snapshot).slice(0, 5);
  const recentMovements = recentLedger(snapshot, 5);
  const activeAlerts = alertListForTab(snapshot, alertTab).slice(0, 6);
  const assignedLocations = snapshot.locations.filter((location) =>
    currentUser.assignedLocationIds.includes(location.id),
  );
  const alertBacklog = inventoryAlerts(snapshot).length;
  const alertCounts = {
    "low-stock": lowStockAlerts(snapshot).length,
    "near-expiry": nearExpiryAlerts(snapshot).length,
    expired: expiredAlerts(snapshot).length,
  } satisfies Record<AlertTab, number>;

  useEffect(() => {
    const key = `${GUIDE_STORAGE_PREFIX}${currentUser.id}`;
    setShowGuide(window.localStorage.getItem(key) !== "seen");
  }, [currentUser.id]);

  function dismissGuide() {
    window.localStorage.setItem(`${GUIDE_STORAGE_PREFIX}${currentUser.id}`, "seen");
    setShowGuide(false);
  }

  return (
    <div className="page-stack page-stack-dashboard">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">Dashboard Overview</p>
          <h2 className="dashboard-title">Welcome back, {currentUser.name.split(" ")[0]}</h2>
          <p className="dashboard-copy">
            {snapshot.settings.companyName} is running across {assignedLocations.length} assigned
            locations. You currently have access to {visibleModuleCount(snapshot, currentUser.id)}{" "}
            modules, with {alertBacklog} active stock alerts and {syncState.online ? "healthy" : "offline"} sync posture.
          </p>
        </div>

        <div className="dashboard-hero-actions">
          <Link to="/reports" className="toolbar-button">
            <ReportsIcon size={16} />
            <span>Movement ledger</span>
          </Link>
          <Link to="/inventory" className="toolbar-button toolbar-button-primary">
            <PlusIcon size={16} />
            <span>Inventory OPS</span>
          </Link>
        </div>
      </section>

      <section className="metric-grid dashboard-metric-grid">
        {metricCards.map((metric) => {
          const Icon = statIcon(metric.label);
          const tone = statTone(metric.label);
          return (
            <article key={metric.label} className={`stat-card tone-${tone}`}>
              <div className="stat-card-top">
                <div className={`stat-card-icon tone-${tone}`}>
                  <Icon size={20} />
                </div>
                <span className="stat-card-trace">{metric.tone === "warning" ? "Attention" : "Live"}</span>
              </div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </article>
          );
        })}
      </section>

      <section className="dashboard-main-grid">
        <article className="panel dashboard-panel-large">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Movement Ledger</p>
              <h2>Recent Stock Activity</h2>
            </div>
            <Link to="/reports" className="panel-link">
              View all
            </Link>
          </div>
          <div className="stack-list">
            {recentMovements.length > 0 ? (
              recentMovements.map((entry) => (
                <div key={entry.id} className="dashboard-movement-card">
                  <div className={`dashboard-movement-icon ${entry.quantityChange < 0 ? "negative" : "positive"}`}>
                    <InventoryIcon size={18} />
                  </div>
                  <div className="dashboard-movement-copy">
                    <strong>{entry.itemName}</strong>
                    <p>
                      {entry.changeType} - {entry.locationName}
                    </p>
                    <small>{entry.reference}</small>
                  </div>
                  <div className="dashboard-movement-value">
                    <strong className={entry.quantityChange < 0 ? "text-warning" : "text-positive"}>
                      {entry.quantityChange > 0 ? "+" : ""}
                      {entry.quantityChange}
                    </strong>
                    <small>{formatDateTime(entry.createdAt)}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">No stock movements have been posted yet.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Warehouse Status</p>
              <h2>Assigned Locations</h2>
            </div>
          </div>
          <div className="stack-list">
            {assignedLocations.length > 0 ? (
              assignedLocations.map((location) => {
                const coverage = locationCoverage(snapshot, location.id);
                return (
                  <div key={location.id} className="location-health-card">
                    <div className="location-health-header">
                      <div>
                        <strong>{location.name}</strong>
                        <p>{location.code}</p>
                      </div>
                      <span>{coverage}% ready</span>
                    </div>
                    <div className="location-health-bar">
                      <div className="location-health-fill" style={{ width: `${coverage}%` }} />
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="empty-copy">No locations are assigned to this user yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Notification Center</p>
              <h2>{ALERT_COPY[alertTab].title}</h2>
            </div>
            <span className="status-chip neutral">
              {snapshot.settings.strictFefo ? "FEFO enforced" : "FEFO guided"}
            </span>
          </div>
          <div className="chip-row">
            {(["low-stock", "near-expiry", "expired"] as AlertTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={alertTab === tab ? "chip-button active" : "chip-button"}
                onClick={() => setAlertTab(tab)}
              >
                {ALERT_COPY[tab].title} ({alertCounts[tab]})
              </button>
            ))}
          </div>
          <div className="stack-list">
            {activeAlerts.length > 0 ? (
              activeAlerts.map((alert) => (
                <div key={alert.id} className="list-row">
                  <div>
                    <strong>{alert.itemName}</strong>
                    <p>
                      {alert.locationName}
                      {alert.lotCode ? ` - ${alert.lotCode}` : ""}
                    </p>
                    <small>{alert.message}</small>
                  </div>
                  <span className={`status-chip ${alert.kind === "expired" ? "warning" : "neutral"}`}>
                    {alert.kind === "low-stock"
                      ? `${alert.quantity} left`
                      : alert.daysUntilExpiry !== undefined
                        ? alert.daysUntilExpiry < 0
                          ? "Expired"
                          : `${alert.daysUntilExpiry}d left`
                        : `${alert.quantity} units`}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-copy">{ALERT_COPY[alertTab].empty}</p>
            )}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Request Flow</p>
              <h2>Pending Submissions</h2>
            </div>
          </div>
          <div className="stack-list">
            {pendingRequests.length > 0 ? (
              pendingRequests.map((request) => (
                <div key={request.id} className="list-row">
                  <div>
                    <strong>{request.reference}</strong>
                    <p>
                      {request.itemName} - {request.quantity} {request.unit}
                    </p>
                    {request.allocationSummary ? <small>{request.allocationSummary}</small> : null}
                  </div>
                  <span className="status-chip neutral">{request.kind}</span>
                </div>
              ))
            ) : (
              <p className="empty-copy">All requests are currently posted.</p>
            )}
          </div>
        </article>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">First Login Guide</p>
              <h2>How To Operate OmniStock</h2>
            </div>
            <div className="button-row">
              <button type="button" className="toolbar-button" onClick={() => setShowGuide(true)}>
                Open guide
              </button>
              {showGuide ? (
                <button type="button" className="toolbar-button" onClick={dismissGuide}>
                  Mark as done
                </button>
              ) : null}
            </div>
          </div>
          {showGuide ? (
            <div className="stack-list">
              {FIRST_LOGIN_STEPS.map((step, index) => (
                <div key={step.title} className="list-row">
                  <div>
                    <strong>
                      {index + 1}. {step.title}
                    </strong>
                    <p>{step.detail}</p>
                  </div>
                  <span className="status-chip neutral">Step {index + 1}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-copy">
              The quick-start guide is tucked away. Open it anytime if a user needs a refresher.
            </p>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Activity Feed</p>
              <h2>Audit Highlights</h2>
            </div>
            <span className="status-chip neutral">{syncState.online ? "Live sync" : "Queued sync"}</span>
          </div>
          <div className="timeline">
            {snapshot.activity.slice(0, 6).map((event) => (
              <div key={event.id} className="timeline-item">
                <div className={`timeline-dot tone-${event.severity}`} />
                <div>
                  <strong>{event.title}</strong>
                  <p>{event.detail}</p>
                  <small>
                    {event.actorName} - {formatDateTime(event.createdAt)}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
