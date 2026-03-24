import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import type { SyncState } from "../lib/useOmniStockApp";

interface Props {
  syncState: SyncState;
  onLogin: (identifier: string, password: string) => Promise<void>;
  onActivateSuperadmin: (identifier: string, password: string) => Promise<void>;
}

type AuthMode = "login" | "activate";

const MODE_COPY: Record<AuthMode, { title: string; button: string; helper: string }> = {
  login: {
    title: "Sign in to OmniStock",
    button: "Sign in",
    helper: "Use this for normal daily access after the workspace has been initialized.",
  },
  activate: {
    title: "Activate a legacy superadmin",
    button: "Activate superadmin",
    helper:
      "Use this once if an older superadmin account exists without a password and needs to be secured.",
  },
};

export function LoginPage({ syncState, onLogin, onActivateSuperadmin }: Props) {
  const theme = useTheme();
  const [mode, setMode] = useState<AuthMode>("login");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(undefined);

    try {
      if (!identifier.trim() || !password) {
        throw new Error("Enter your username or email and password to continue.");
      }

      if (mode === "activate") {
        await onActivateSuperadmin(identifier.trim(), password);
      } else {
        await onLogin(identifier.trim(), password);
      }
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: { xs: 2, md: 3 } }}>
      <Stack spacing={2.5} sx={{ width: "min(1120px, 100%)" }}>
        <Paper
          sx={{
            p: { xs: 2.5, md: 3 },
            borderRadius: 4,
            background:
              theme.palette.mode === "dark"
                ? alpha(theme.palette.background.paper, 0.88)
                : alpha(theme.palette.background.paper, 0.92),
          }}
        >
          <Stack direction={{ xs: "column", lg: "row" }} justifyContent="space-between" spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Access Control
              </Typography>
              <Typography variant="h4" sx={{ mt: 0.5 }}>
                {MODE_COPY[mode].title}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 760 }}>
                OmniStock now uses session-based sign-in. Passwords are protected in D1 with salted
                PBKDF2 hashing, and superadmin user management is handled from Administration after
                login.
              </Typography>
            </Box>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} useFlexGap flexWrap="wrap">
              <Chip label={syncState.online ? "Online" : "Offline"} color={syncState.online ? "success" : "warning"} />
              <Chip variant="outlined" label={`Realtime ${syncState.websocket}`} />
            </Stack>
          </Stack>
        </Paper>

        <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) minmax(360px, 0.9fr)" } }}>
          <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  Authentication
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  Enter your credentials
                </Typography>
              </Box>

              <ToggleButtonGroup
                exclusive
                color="primary"
                value={mode}
                onChange={(_, value: AuthMode | null) => {
                  if (!value) {
                    return;
                  }
                  setMode(value);
                  setFeedback(undefined);
                }}
                sx={{ flexWrap: "wrap", gap: 1, "& .MuiToggleButtonGroup-grouped": { borderRadius: "14px !important", border: "1px solid", borderColor: "divider" } }}
              >
                <ToggleButton value="login">Sign in</ToggleButton>
                <ToggleButton value="activate">Activate superadmin</ToggleButton>
              </ToggleButtonGroup>

              <Typography variant="body2" color="text.secondary">
                {MODE_COPY[mode].helper}
              </Typography>

              {feedback ? <Alert severity="error">{feedback}</Alert> : null}

              <Box component="form" onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label="Username or email"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="username or you@company.com"
                    autoComplete="username"
                    fullWidth
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    fullWidth
                  />

                  <Stack direction="row" justifyContent="flex-start">
                    <Button type="submit" variant="contained" disabled={submitting || !syncState.online}>
                      {submitting ? "Checking..." : MODE_COPY[mode].button}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Paper>

          <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
            <Stack spacing={2}>
              <Box>
                <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                  What Changed
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  Security and user access
                </Typography>
              </Box>

              <Stack spacing={1.5}>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    Passwords are no longer plain text
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Each account now stores a salted PBKDF2 hash and iteration count in D1.
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    Superadmins can manage user access
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Edit user details, reset passwords, and remove accounts from Administration.
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3 }}>
                  <Typography variant="subtitle2" fontWeight={800}>
                    Sessions are cookie-based
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    The worker keeps the browser session signed in without exposing tokens in the UI.
                  </Typography>
                </Paper>
              </Stack>
            </Stack>
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
}
