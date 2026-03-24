import { useState } from "react";
import type { InitializeSystemRequest } from "../../shared/types";
import type { SyncState } from "../lib/useOmniStockApp";

interface Props {
  syncState: SyncState;
  onInitialize: (input: InitializeSystemRequest) => Promise<void>;
}

interface FormState {
  companyName: string;
  currency: string;
  timezone: string;
  lowStockThreshold: string;
  expiryAlertDays: string;
  enableOffline: boolean;
  enableRealtime: boolean;
  enableBarcode: boolean;
  strictFefo: boolean;
  warehouseName: string;
  warehouseCode: string;
  warehouseCity: string;
  outletName: string;
  outletCode: string;
  outletCity: string;
  superadminName: string;
  superadminUsername: string;
  superadminEmail: string;
  superadminPassword: string;
  adminName: string;
  adminUsername: string;
  adminEmail: string;
  adminPassword: string;
  managerName: string;
  managerUsername: string;
  managerEmail: string;
  managerPassword: string;
  workerName: string;
  workerUsername: string;
  workerEmail: string;
  workerPassword: string;
}

const STEPS = ["Company", "Locations", "Users", "Go Live"] as const;

function defaultForm(): FormState {
  return {
    companyName: "",
    currency: "PKR",
    timezone: "Asia/Karachi",
    lowStockThreshold: "5",
    expiryAlertDays: "14",
    enableOffline: true,
    enableRealtime: true,
    enableBarcode: true,
    strictFefo: true,
    warehouseName: "",
    warehouseCode: "",
    warehouseCity: "",
    outletName: "",
    outletCode: "",
    outletCity: "",
    superadminName: "",
    superadminUsername: "",
    superadminEmail: "",
    superadminPassword: "",
    adminName: "",
    adminUsername: "",
    adminEmail: "",
    adminPassword: "",
    managerName: "",
    managerUsername: "",
    managerEmail: "",
    managerPassword: "",
    workerName: "",
    workerUsername: "",
    workerEmail: "",
    workerPassword: "",
  };
}

function isStrongEnough(password: string): boolean {
  return password.trim().length >= 8;
}

function hasAnyValue(values: string[]): boolean {
  return values.some((value) => value.trim().length > 0);
}

export function InitializationPage({ syncState, onInitialize }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function validateStep(nextStep: number): boolean {
    if (nextStep === 1 && !form.companyName.trim()) {
      setFeedback("Enter the company name before moving to location setup.");
      return false;
    }

    if (
      nextStep === 2 &&
      (!form.warehouseName.trim() ||
        !form.warehouseCode.trim() ||
        !form.outletName.trim() ||
        !form.outletCode.trim())
    ) {
      setFeedback("Create at least one warehouse and one outlet to start the network.");
      return false;
    }

    if (
      nextStep === 3 &&
      (!form.superadminName.trim() ||
        !form.superadminUsername.trim() ||
        !form.superadminEmail.trim() ||
        !isStrongEnough(form.superadminPassword))
    ) {
      setFeedback(
        "Create the first superadmin user with a username and a password of at least 8 characters before launching OmniStock.",
      );
      return false;
    }

    if (nextStep >= 3) {
      const optionalUsers = [
        {
          label: "Admin",
          values: [form.adminName, form.adminUsername, form.adminEmail, form.adminPassword],
        },
        {
          label: "Manager",
          values: [form.managerName, form.managerUsername, form.managerEmail, form.managerPassword],
        },
        {
          label: "Worker",
          values: [form.workerName, form.workerUsername, form.workerEmail, form.workerPassword],
        },
      ];

      for (const entry of optionalUsers) {
        const hasSome = hasAnyValue(entry.values);
        const hasAll = entry.values.every((value) => value.trim().length > 0);
        if (hasSome && !hasAll) {
          setFeedback(
            `${entry.label} setup is incomplete. Fill name, username, email, and password or leave it blank.`,
          );
          return false;
        }

        if (hasAll && !isStrongEnough(entry.values[3])) {
          setFeedback(`${entry.label} password must be at least 8 characters long.`);
          return false;
        }
      }

      const usernames = [
        form.superadminUsername,
        form.adminUsername,
        form.managerUsername,
        form.workerUsername,
      ]
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);

      if (new Set(usernames).size !== usernames.length) {
        setFeedback("Each username must be unique across the setup team.");
        return false;
      }

      if (
        !form.superadminEmail.includes("@") ||
        (form.adminEmail.trim() && !form.adminEmail.includes("@")) ||
        (form.managerEmail.trim() && !form.managerEmail.includes("@")) ||
        (form.workerEmail.trim() && !form.workerEmail.includes("@"))
      ) {
        setFeedback("Use valid email addresses for each user account.");
        return false;
      }
    }

    setFeedback(undefined);
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validateStep(3)) {
      setStep(2);
      return;
    }

    setSubmitting(true);
    setFeedback(undefined);

    try {
      await onInitialize({
        companyName: form.companyName.trim(),
        currency: form.currency,
        timezone: form.timezone,
        lowStockThreshold: Number(form.lowStockThreshold),
        expiryAlertDays: Number(form.expiryAlertDays),
        enableOffline: form.enableOffline,
        enableRealtime: form.enableRealtime,
        enableBarcode: form.enableBarcode,
        strictFefo: form.strictFefo,
        locations: [
          {
            name: form.warehouseName.trim(),
            code: form.warehouseCode.trim(),
            city: form.warehouseCity.trim(),
            type: "warehouse",
          },
          {
            name: form.outletName.trim(),
            code: form.outletCode.trim(),
            city: form.outletCity.trim(),
            type: "outlet",
          },
        ],
        users: [
          {
            name: form.superadminName.trim(),
            username: form.superadminUsername.trim().toLowerCase(),
            email: form.superadminEmail.trim(),
            role: "superadmin",
            password: form.superadminPassword,
          },
          ...(form.adminName.trim() && form.adminEmail.trim()
            ? [
                {
                  name: form.adminName.trim(),
                  username: form.adminUsername.trim().toLowerCase(),
                  email: form.adminEmail.trim(),
                  role: "admin" as const,
                  password: form.adminPassword,
                },
              ]
            : []),
          ...(form.managerName.trim() && form.managerEmail.trim()
            ? [
                {
                  name: form.managerName.trim(),
                  username: form.managerUsername.trim().toLowerCase(),
                  email: form.managerEmail.trim(),
                  role: "manager" as const,
                  password: form.managerPassword,
                },
              ]
            : []),
          ...(form.workerName.trim() && form.workerEmail.trim()
            ? [
                {
                  name: form.workerName.trim(),
                  username: form.workerUsername.trim().toLowerCase(),
                  email: form.workerEmail.trim(),
                  role: "worker" as const,
                  password: form.workerPassword,
                },
              ]
            : []),
        ],
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not initialize OmniStock.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="loading-screen">
      <div className="page-stack" style={{ width: "min(1120px, 100%)" }}>
        <section className="hero-panel">
          <div>
            <p className="eyebrow">First Run Setup</p>
            <h1>Initialize OmniStock</h1>
            <p className="hero-copy">
              Start with the company profile, one warehouse, one outlet, and the first user team.
              More items, suppliers, branches, and staff can be added later inside the app.
            </p>
          </div>

          <div className="hero-meta">
            <div className="meta-card">
              <span>Connection</span>
              <strong>{syncState.online ? "Online" : "Offline"}</strong>
              <small>Initial setup must save to Cloudflare before operations can begin.</small>
            </div>
            <div className="meta-card">
              <span>Wizard step</span>
              <strong>{step + 1} / 4</strong>
              <small>{STEPS[step]}</small>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="chip-row">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                className={index === step ? "chip-button active" : "chip-button"}
                onClick={() => {
                  if (index <= step) {
                    setStep(index);
                    return;
                  }

                  if (index === step + 1 && validateStep(index)) {
                    setStep(index);
                  }
                }}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          <form className="page-stack" onSubmit={handleSubmit}>
            {step === 0 ? (
              <div className="form-grid">
                <label className="field">
                  <span>Company name</span>
                  <input
                    value={form.companyName}
                    onChange={(event) => patch("companyName", event.target.value)}
                    placeholder="OmniStock Restaurants"
                  />
                </label>

                <label className="field">
                  <span>Currency</span>
                  <select
                    value={form.currency}
                    onChange={(event) => patch("currency", event.target.value)}
                  >
                    <option value="PKR">PKR</option>
                    <option value="USD">USD</option>
                    <option value="AED">AED</option>
                    <option value="SAR">SAR</option>
                  </select>
                </label>

                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={form.timezone}
                    onChange={(event) => patch("timezone", event.target.value)}
                    placeholder="Asia/Karachi"
                  />
                </label>

                <label className="field">
                  <span>Low stock threshold</span>
                  <input
                    type="number"
                    min="1"
                    value={form.lowStockThreshold}
                    onChange={(event) => patch("lowStockThreshold", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Expiry alert days</span>
                  <input
                    type="number"
                    min="1"
                    value={form.expiryAlertDays}
                    onChange={(event) => patch("expiryAlertDays", event.target.value)}
                  />
                </label>

                <div className="field field-wide">
                  <span>System behavior</span>
                  <div className="stack-list">
                    <label className="list-row">
                      <div>
                        <strong>Offline mode</strong>
                        <p>Allow IndexedDB cache and queue support when connections drop.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.enableOffline}
                        onChange={(event) => patch("enableOffline", event.target.checked)}
                      />
                    </label>
                    <label className="list-row">
                      <div>
                        <strong>Realtime sync</strong>
                        <p>Keep multiple users aligned through websockets and shared refresh.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.enableRealtime}
                        onChange={(event) => patch("enableRealtime", event.target.checked)}
                      />
                    </label>
                    <label className="list-row">
                      <div>
                        <strong>Barcode capture</strong>
                        <p>Enable scanner and camera workflows for mobile and tablet teams.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.enableBarcode}
                        onChange={(event) => patch("enableBarcode", event.target.checked)}
                      />
                    </label>
                    <label className="list-row">
                      <div>
                        <strong>Strict FEFO</strong>
                        <p>Force first-expired-first-out for restaurant stock movements.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.strictFefo}
                        onChange={(event) => patch("strictFefo", event.target.checked)}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="form-grid">
                <label className="field">
                  <span>Primary warehouse name</span>
                  <input
                    value={form.warehouseName}
                    onChange={(event) => patch("warehouseName", event.target.value)}
                    placeholder="Central Warehouse"
                  />
                </label>
                <label className="field">
                  <span>Warehouse code</span>
                  <input
                    value={form.warehouseCode}
                    onChange={(event) => patch("warehouseCode", event.target.value)}
                    placeholder="WH-CENTRAL"
                  />
                </label>
                <label className="field">
                  <span>Warehouse city</span>
                  <input
                    value={form.warehouseCity}
                    onChange={(event) => patch("warehouseCity", event.target.value)}
                    placeholder="Karachi"
                  />
                </label>

                <label className="field">
                  <span>First outlet name</span>
                  <input
                    value={form.outletName}
                    onChange={(event) => patch("outletName", event.target.value)}
                    placeholder="DHA Branch"
                  />
                </label>
                <label className="field">
                  <span>Outlet code</span>
                  <input
                    value={form.outletCode}
                    onChange={(event) => patch("outletCode", event.target.value)}
                    placeholder="OUT-DHA"
                  />
                </label>
                <label className="field">
                  <span>Outlet city</span>
                  <input
                    value={form.outletCity}
                    onChange={(event) => patch("outletCity", event.target.value)}
                    placeholder="Karachi"
                  />
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="form-grid">
                <label className="field">
                  <span>Superadmin name</span>
                  <input
                    value={form.superadminName}
                    onChange={(event) => patch("superadminName", event.target.value)}
                    placeholder="Amina Shah"
                  />
                </label>
                <label className="field">
                  <span>Superadmin email</span>
                  <input
                    type="email"
                    value={form.superadminEmail}
                    onChange={(event) => patch("superadminEmail", event.target.value)}
                    placeholder="amina@company.com"
                  />
                </label>
                <label className="field">
                  <span>Superadmin username</span>
                  <input
                    value={form.superadminUsername}
                    onChange={(event) => patch("superadminUsername", event.target.value)}
                    placeholder="amina.shah"
                    autoComplete="username"
                  />
                </label>
                <label className="field">
                  <span>Superadmin password</span>
                  <input
                    type="password"
                    value={form.superadminPassword}
                    onChange={(event) => patch("superadminPassword", event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                  />
                </label>

                <label className="field">
                  <span>Admin name</span>
                  <input
                    value={form.adminName}
                    onChange={(event) => patch("adminName", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Admin email</span>
                  <input
                    type="email"
                    value={form.adminEmail}
                    onChange={(event) => patch("adminEmail", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Admin username</span>
                  <input
                    value={form.adminUsername}
                    onChange={(event) => patch("adminUsername", event.target.value)}
                    placeholder="Optional"
                    autoComplete="username"
                  />
                </label>
                <label className="field">
                  <span>Admin password</span>
                  <input
                    type="password"
                    value={form.adminPassword}
                    onChange={(event) => patch("adminPassword", event.target.value)}
                    placeholder="Optional"
                    autoComplete="new-password"
                  />
                </label>

                <label className="field">
                  <span>Manager name</span>
                  <input
                    value={form.managerName}
                    onChange={(event) => patch("managerName", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Manager email</span>
                  <input
                    type="email"
                    value={form.managerEmail}
                    onChange={(event) => patch("managerEmail", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Manager username</span>
                  <input
                    value={form.managerUsername}
                    onChange={(event) => patch("managerUsername", event.target.value)}
                    placeholder="Optional"
                    autoComplete="username"
                  />
                </label>
                <label className="field">
                  <span>Manager password</span>
                  <input
                    type="password"
                    value={form.managerPassword}
                    onChange={(event) => patch("managerPassword", event.target.value)}
                    placeholder="Optional"
                    autoComplete="new-password"
                  />
                </label>

                <label className="field">
                  <span>Worker name</span>
                  <input
                    value={form.workerName}
                    onChange={(event) => patch("workerName", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Worker email</span>
                  <input
                    type="email"
                    value={form.workerEmail}
                    onChange={(event) => patch("workerEmail", event.target.value)}
                    placeholder="Optional"
                  />
                </label>
                <label className="field">
                  <span>Worker username</span>
                  <input
                    value={form.workerUsername}
                    onChange={(event) => patch("workerUsername", event.target.value)}
                    placeholder="Optional"
                    autoComplete="username"
                  />
                </label>
                <label className="field">
                  <span>Worker password</span>
                  <input
                    type="password"
                    value={form.workerPassword}
                    onChange={(event) => patch("workerPassword", event.target.value)}
                    placeholder="Optional"
                    autoComplete="new-password"
                  />
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="split-grid">
                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">Launch Summary</p>
                      <h2>Workspace Overview</h2>
                    </div>
                  </div>
                  <div className="stack-list">
                    <div className="list-row">
                      <div>
                        <strong>{form.companyName || "Company pending"}</strong>
                        <p>
                          {form.currency} - {form.timezone}
                        </p>
                      </div>
                      <span className="status-chip neutral">Company</span>
                    </div>
                    <div className="list-row">
                      <div>
                        <strong>{form.warehouseName || "Warehouse pending"}</strong>
                        <p>
                          {form.warehouseCode || "Code"} - {form.warehouseCity || "City"}
                        </p>
                      </div>
                      <span className="status-chip neutral">Warehouse</span>
                    </div>
                    <div className="list-row">
                      <div>
                        <strong>{form.outletName || "Outlet pending"}</strong>
                        <p>
                          {form.outletCode || "Code"} - {form.outletCity || "City"}
                        </p>
                      </div>
                      <span className="status-chip neutral">Outlet</span>
                    </div>
                    <div className="list-row">
                      <div>
                        <strong>{form.superadminName || "Superadmin pending"}</strong>
                        <p>
                          {form.superadminUsername || "Username required"} -{" "}
                          {form.superadminEmail || "Email required"}
                        </p>
                      </div>
                      <span className="status-chip neutral">First owner</span>
                    </div>
                    <div className="list-row">
                      <div>
                        <strong>Passwords</strong>
                        <p>
                          Superadmin password is {isStrongEnough(form.superadminPassword) ? "ready" : "missing"}.
                        </p>
                      </div>
                      <span className="status-chip neutral">Security</span>
                    </div>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-heading">
                    <div>
                      <p className="eyebrow">What Happens Next</p>
                      <h2>After Initialization</h2>
                    </div>
                  </div>
                  <div className="timeline">
                    <div className="timeline-item">
                      <div className="timeline-dot tone-success" />
                      <div>
                        <strong>Dashboard opens</strong>
                        <p>Users land in the live workspace with alerts, KPIs, and the quick guide.</p>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-dot tone-success" />
                      <div>
                        <strong>Master data can expand</strong>
                        <p>Add items, suppliers, more branches, and market pricing after setup.</p>
                      </div>
                    </div>
                    <div className="timeline-item">
                      <div className="timeline-dot tone-success" />
                      <div>
                        <strong>Operations can start</strong>
                        <p>GRN, GIN, transfers, counts, wastage, FEFO, and reports are ready.</p>
                      </div>
                    </div>
                  </div>
                </article>
              </div>
            ) : null}

            <div className="button-row">
              {step > 0 ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setStep((current) => current - 1)}
                >
                  Back
                </button>
              ) : null}

              {step < STEPS.length - 1 ? (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (validateStep(step + 1)) {
                      setStep((current) => current + 1);
                    }
                  }}
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting || !syncState.online}
                >
                  {submitting ? "Launching..." : "Initialize OmniStock"}
                </button>
              )}
            </div>

            {feedback ? <p className="feedback-copy">{feedback}</p> : null}
          </form>
        </section>
      </div>
    </div>
  );
}
