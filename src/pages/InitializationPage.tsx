import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  MenuItem,
  Paper,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from "@mui/material";
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

function userFields(prefix: "superadmin" | "admin" | "manager" | "worker") {
  return {
    name: `${prefix}Name` as const,
    email: `${prefix}Email` as const,
    username: `${prefix}Username` as const,
    password: `${prefix}Password` as const,
  };
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
        { label: "Admin", values: [form.adminName, form.adminUsername, form.adminEmail, form.adminPassword] },
        { label: "Manager", values: [form.managerName, form.managerUsername, form.managerEmail, form.managerPassword] },
        { label: "Worker", values: [form.workerName, form.workerUsername, form.workerEmail, form.workerPassword] },
      ];

      for (const entry of optionalUsers) {
        const hasSome = hasAnyValue(entry.values);
        const hasAll = entry.values.every((value) => value.trim().length > 0);
        if (hasSome && !hasAll) {
          setFeedback(`${entry.label} setup is incomplete. Fill name, username, email, and password or leave it blank.`);
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

  function renderUserFields(label: string, prefix: "superadmin" | "admin" | "manager" | "worker", required = false) {
    const fields = userFields(prefix);
    return (
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" fontWeight={800}>
              {label}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {required ? "Required for first launch." : "Optional during setup and can be added later."}
            </Typography>
          </Box>
          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
            <TextField
              label={`${label} name`}
              value={form[fields.name]}
              onChange={(event) => patch(fields.name, event.target.value)}
              placeholder={required ? "Amina Shah" : "Optional"}
              fullWidth
            />
            <TextField
              label={`${label} email`}
              type="email"
              value={form[fields.email]}
              onChange={(event) => patch(fields.email, event.target.value)}
              placeholder={required ? "amina@company.com" : "Optional"}
              fullWidth
            />
            <TextField
              label={`${label} username`}
              value={form[fields.username]}
              onChange={(event) => patch(fields.username, event.target.value)}
              placeholder={required ? "amina.shah" : "Optional"}
              autoComplete="username"
              fullWidth
            />
            <TextField
              label={`${label} password`}
              type="password"
              value={form[fields.password]}
              onChange={(event) => patch(fields.password, event.target.value)}
              placeholder={required ? "Minimum 8 characters" : "Optional"}
              autoComplete="new-password"
              fullWidth
            />
          </Box>
        </Stack>
      </Paper>
    );
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5} sx={{ width: "min(1180px, 100%)" }}>
        <Box sx={{ px: { xs: 0.25, md: 0.5 }, py: { xs: 0.5, md: 0.75 } }}>
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                First Run Setup
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5 }}>
                Initialize OmniStock
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 760 }}>
                Start with the company profile, one warehouse, one outlet, and the first user team.
                More items, suppliers, branches, and staff can be added later inside the app.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} useFlexGap flexWrap="wrap">
              <Chip label={syncState.online ? "Online" : "Offline"} color={syncState.online ? "success" : "warning"} />
              <Chip variant="outlined" label={`Step ${step + 1} / 4 - ${STEPS[step]}`} />
            </Stack>
          </Stack>
        </Box>

        <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
          <Stack spacing={2.5}>
            <Stepper activeStep={step} alternativeLabel sx={{ display: { xs: "none", md: "flex" } }}>
              {STEPS.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ display: { xs: "flex", md: "none" } }}>
              {STEPS.map((label, index) => (
                <Chip
                  key={label}
                  label={`${index + 1}. ${label}`}
                  color={index === step ? "primary" : "default"}
                  variant={index === step ? "filled" : "outlined"}
                  onClick={() => {
                    if (index <= step) {
                      setStep(index);
                      return;
                    }
                    if (index === step + 1 && validateStep(index)) {
                      setStep(index);
                    }
                  }}
                />
              ))}
            </Stack>

            {feedback ? <Alert severity="error">{feedback}</Alert> : null}

            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={2.5}>
                {step === 0 ? (
                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                    <TextField
                      label="Company name"
                      value={form.companyName}
                      onChange={(event) => patch("companyName", event.target.value)}
                      placeholder="OmniStock Restaurants"
                      fullWidth
                    />
                    <TextField
                      select
                      label="Currency"
                      value={form.currency}
                      onChange={(event) => patch("currency", event.target.value)}
                      fullWidth
                    >
                      {["PKR", "USD", "AED", "SAR"].map((currency) => (
                        <MenuItem key={currency} value={currency}>
                          {currency}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      label="Timezone"
                      value={form.timezone}
                      onChange={(event) => patch("timezone", event.target.value)}
                      placeholder="Asia/Karachi"
                      fullWidth
                    />
                    <TextField
                      label="Low stock threshold"
                      type="number"
                      inputProps={{ min: 1 }}
                      value={form.lowStockThreshold}
                      onChange={(event) => patch("lowStockThreshold", event.target.value)}
                      fullWidth
                    />
                    <TextField
                      label="Expiry alert days"
                      type="number"
                      inputProps={{ min: 1 }}
                      value={form.expiryAlertDays}
                      onChange={(event) => patch("expiryAlertDays", event.target.value)}
                      fullWidth
                    />
                    <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, gridColumn: { xs: "1 / -1", md: "1 / -1" } }}>
                      <Stack spacing={1.25}>
                        <Typography variant="subtitle2" fontWeight={800}>
                          System behavior
                        </Typography>
                        <FormControlLabel control={<Checkbox checked={form.enableOffline} onChange={(event) => patch("enableOffline", event.target.checked)} />} label="Offline mode" />
                        <FormControlLabel control={<Checkbox checked={form.enableRealtime} onChange={(event) => patch("enableRealtime", event.target.checked)} />} label="Realtime sync" />
                        <FormControlLabel control={<Checkbox checked={form.enableBarcode} onChange={(event) => patch("enableBarcode", event.target.checked)} />} label="Barcode capture" />
                        <FormControlLabel control={<Checkbox checked={form.strictFefo} onChange={(event) => patch("strictFefo", event.target.checked)} />} label="Strict FEFO" />
                      </Stack>
                    </Paper>
                  </Box>
                ) : null}

                {step === 1 ? (
                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                    <TextField label="Primary warehouse name" value={form.warehouseName} onChange={(event) => patch("warehouseName", event.target.value)} placeholder="Central Warehouse" fullWidth />
                    <TextField label="Warehouse code" value={form.warehouseCode} onChange={(event) => patch("warehouseCode", event.target.value)} placeholder="WH-CENTRAL" fullWidth />
                    <TextField label="Warehouse city" value={form.warehouseCity} onChange={(event) => patch("warehouseCity", event.target.value)} placeholder="Karachi" fullWidth />
                    <TextField label="First outlet name" value={form.outletName} onChange={(event) => patch("outletName", event.target.value)} placeholder="DHA Branch" fullWidth />
                    <TextField label="Outlet code" value={form.outletCode} onChange={(event) => patch("outletCode", event.target.value)} placeholder="OUT-DHA" fullWidth />
                    <TextField label="Outlet city" value={form.outletCity} onChange={(event) => patch("outletCity", event.target.value)} placeholder="Karachi" fullWidth />
                  </Box>
                ) : null}

                {step === 2 ? (
                  <Stack spacing={2}>
                    {renderUserFields("Superadmin", "superadmin", true)}
                    {renderUserFields("Admin", "admin")}
                    {renderUserFields("Manager", "manager")}
                    {renderUserFields("Worker", "worker")}
                  </Stack>
                ) : null}

                {step === 3 ? (
                  <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(360px, 0.92fr)" } }}>
                    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                      <Stack spacing={1.25}>
                        <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                          Launch Summary
                        </Typography>
                        <Typography variant="h6">Workspace Overview</Typography>
                        <Chip variant="outlined" label={`${form.companyName || "Company pending"} - ${form.currency} - ${form.timezone}`} />
                        <Chip variant="outlined" label={`${form.warehouseName || "Warehouse pending"} - ${form.warehouseCode || "Code"} - ${form.warehouseCity || "City"}`} />
                        <Chip variant="outlined" label={`${form.outletName || "Outlet pending"} - ${form.outletCode || "Code"} - ${form.outletCity || "City"}`} />
                        <Chip variant="outlined" label={`${form.superadminName || "Superadmin pending"} - ${form.superadminUsername || "Username required"} - ${form.superadminEmail || "Email required"}`} />
                        <Chip color={isStrongEnough(form.superadminPassword) ? "success" : "warning"} label={`Superadmin password is ${isStrongEnough(form.superadminPassword) ? "ready" : "missing"}`} />
                      </Stack>
                    </Paper>

                    <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 3 }}>
                      <Stack spacing={1.5}>
                        <Box>
                          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                            What Happens Next
                          </Typography>
                          <Typography variant="h6" sx={{ mt: 0.5 }}>
                            After Initialization
                          </Typography>
                        </Box>
                        {[
                          "Dashboard opens with alerts, KPIs, and the first-login guide.",
                          "Master data can expand with items, suppliers, branches, and market pricing.",
                          "Operations can start with GRN, GIN, transfers, counts, wastage, FEFO, and reports.",
                        ].map((detail) => (
                          <Paper key={detail} variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                            <Typography variant="body2" color="text.secondary">
                              {detail}
                            </Typography>
                          </Paper>
                        ))}
                      </Stack>
                    </Paper>
                  </Box>
                ) : null}

                <Stack direction="row" spacing={1.25}>
                  {step > 0 ? (
                    <Button type="button" variant="outlined" onClick={() => setStep((current) => current - 1)}>
                      Back
                    </Button>
                  ) : null}

                  {step < STEPS.length - 1 ? (
                    <Button
                      type="button"
                      variant="contained"
                      onClick={() => {
                        if (validateStep(step + 1)) {
                          setStep((current) => current + 1);
                        }
                      }}
                    >
                      Continue
                    </Button>
                  ) : (
                    <Button type="submit" variant="contained" disabled={submitting || !syncState.online}>
                      {submitting ? "Launching..." : "Initialize OmniStock"}
                    </Button>
                  )}
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Stack>
    </Box>
  );
}
