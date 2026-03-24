import { useEffect, useState } from "react";
import {
  dashboardMetrics,
  expiredAlerts,
  inventoryAlerts,
  lowStockAlerts,
  openRequests,
  recentLedger,
  visibleModuleCount,
  nearExpiryAlerts,
} from "../../shared/selectors";
import type { InventoryAlert, InventorySnapshot, User } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import type { SyncState } from "../lib/useOmniStockApp";

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
    title: "Nearing Expiry",
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
    detail: "Use the notification center to review low stock, near-expiry, and expired items before taking action.",
  },
  {
    title: "Post movements in Inventory OPS",
    detail: "Create GRN, GIN, transfers, adjustments, counts, or wastage. Barcode scanning is available for faster item selection.",
  },
  {
    title: "Keep master data clean",
    detail: "Add items, suppliers, warehouses, outlets, and daily market rates before the operation volume grows.",
  },
  {
    title: "Review waste and stock reports",
    detail: "Use Reports and Analytics to monitor movement, waste cost, expiry exposure, and export Excel sheets.",
  },
  {
    title: "Use Administration for control",
    detail: "Manage users, settings, and activity logs so permissions and operational rules stay aligned.",
  },
];

function alertListForTab(
  snapshot: InventorySnapshot,
  tab: AlertTab,
): InventoryAlert[] {
  if (tab === "low-stock") {
    return lowStockAlerts(snapshot);
  }

  if (tab === "near-expiry") {
    return nearExpiryAlerts(snapshot);
  }

  return expiredAlerts(snapshot);
}

export function DashboardPage({ snapshot, currentUser, syncState }: Props) {
  const [alertTab, setAlertTab] = useState<AlertTab>("low-stock");
  const [showGuide, setShowGuide] = useState(false);
  const metrics = inventoryAlerts(snapshot);
  const metricCards = dashboardMetrics(snapshot);
  const pendingRequests = openRequests(snapshot).slice(0, 5);
  const recentMovements = recentLedger(snapshot, 6);
  const assignedLocations = snapshot.locations.filter((location) =>
    currentUser.assignedLocationIds.includes(location.id),
  );
  const alertCounts = {
    "low-stock": lowStockAlerts(snapshot).length,
    "near-expiry": nearExpiryAlerts(snapshot).length,
    expired: expiredAlerts(snapshot).length,
  } satisfies Record<AlertTab, number>;
  const activeAlerts = alertListForTab(snapshot, alertTab).slice(0, 6);

  useEffect(() => {
    const key = `${GUIDE_STORAGE_PREFIX}${currentUser.id}`;
    setShowGuide(window.localStorage.getItem(key) !== "seen");
  }, [currentUser.id]);

  function dismissGuide() {
    window.localStorage.setItem(`${GUIDE_STORAGE_PREFIX}${currentUser.id}`, "seen");
    setShowGuide(false);
  }

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Operational Overview</p>
          <h1>{snapshot.settings.companyName}</h1>
          <p className="hero-copy">
            {currentUser.name} can currently access {visibleModuleCount(snapshot, currentUser.id)}{" "}
            modules, covering {assignedLocations.length} assigned locations. Offline sync remains
            available, and outbound stock uses FEFO so the earliest valid expiry moves first.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>Assigned locations</span>
            <strong>{assignedLocations.length}</strong>
            <small>
              {assignedLocations.map((location) => location.code).join(", ") || "No sites assigned"}
            </small>
          </div>
          <div className="meta-card">
            <span>Alert backlog</span>
            <strong>{metrics.length}</strong>
            <small>
              Includes low stock, near-expiry, and expired batches across the network.
            </small>
          </div>
          <div className="meta-card">
            <span>Sync posture</span>
            <strong>{syncState.online ? "Healthy" : "Offline mode"}</strong>
            <small>
              {syncState.websocket === "connected"
                ? "Realtime channel live"
                : "Polling and queue fallback ready"}
            </small>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">First Login Guide</p>
            <h2>How To Operate OmniStock</h2>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => setShowGuide(true)}>
              Open guide
            </button>
            {showGuide ? (
              <button type="button" className="secondary-button" onClick={dismissGuide}>
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
      </section>

      <section className="metric-grid">
        {metricCards.map((metric) => (
          <article key={metric.label} className={`metric-card tone-${metric.tone}`}>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Notification Center</p>
              <h2>{ALERT_COPY[alertTab].title}</h2>
            </div>
            <span className="status-chip neutral">
              FEFO {snapshot.settings.strictFefo ? "enforced" : "guided"}
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
              <p className="eyebrow">Movement Ledger</p>
              <h2>Recent Stock Activity</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table compact">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Item</th>
                  <th>Location</th>
                  <th>Delta</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentMovements.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.reference}</td>
                    <td>{entry.itemName}</td>
                    <td>{entry.locationName}</td>
                    <td className={entry.quantityChange < 0 ? "text-warning" : "text-positive"}>
                      {entry.quantityChange > 0 ? "+" : ""}
                      {entry.quantityChange}
                    </td>
                    <td>{formatDateTime(entry.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Activity Feed</p>
              <h2>Audit Highlights</h2>
            </div>
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
