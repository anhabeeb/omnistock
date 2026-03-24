import { useEffect, useRef, useState } from "react";
import { expiredAlerts, inventoryAlerts, lowStockAlerts, nearExpiryAlerts } from "../../shared/selectors";
import type { InventorySnapshot } from "../../shared/types";
import { formatDateTime } from "../lib/format";
import { AlertIcon, BellIcon, ClockIcon } from "./AppIcons";

interface Props {
  snapshot: InventorySnapshot;
}

type AlertFilter = "all" | "low-stock" | "near-expiry" | "expired";

export function AppNotificationCenter({ snapshot }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const allAlerts = inventoryAlerts(snapshot);
  const filteredAlerts =
    filter === "all"
      ? allAlerts
      : filter === "low-stock"
        ? lowStockAlerts(snapshot)
        : filter === "near-expiry"
          ? nearExpiryAlerts(snapshot)
          : expiredAlerts(snapshot);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="notification-center" ref={rootRef}>
      <button
        type="button"
        className="toolbar-icon-button"
        aria-label="Open notifications"
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon size={18} />
        {allAlerts.length > 0 ? (
          <span className="notification-badge">{allAlerts.length > 9 ? "9+" : allAlerts.length}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notification-panel">
          <div className="notification-header">
            <div>
              <strong>Notifications</strong>
              <p>{allAlerts.length > 0 ? `${allAlerts.length} active inventory alerts` : "No active alerts"}</p>
            </div>
          </div>

          <div className="chip-row">
            {(["all", "low-stock", "near-expiry", "expired"] as AlertFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                className={filter === option ? "chip-button active" : "chip-button"}
                onClick={() => setFilter(option)}
              >
                {option === "all" ? "All" : option.replace("-", " ")}
              </button>
            ))}
          </div>

          <div className="notification-list">
            {filteredAlerts.length > 0 ? (
              filteredAlerts.slice(0, 8).map((alert) => (
                <div key={alert.id} className="notification-item">
                  <div className="notification-icon">
                    {alert.kind === "low-stock" ? <AlertIcon size={16} /> : <ClockIcon size={16} />}
                  </div>
                  <div className="notification-copy">
                    <strong>{alert.itemName}</strong>
                    <p>{alert.message}</p>
                    <small>
                      {alert.locationName}
                      {alert.expiryDate ? ` • ${formatDateTime(alert.expiryDate)}` : ""}
                    </small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">No alerts match this filter.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
