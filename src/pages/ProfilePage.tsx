import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { ROLE_PRESETS } from "../../shared/permissions";
import type {
  ChangeOwnPasswordRequest,
  InventorySnapshot,
  UpdateOwnProfileRequest,
  User,
} from "../../shared/types";
import { formatDateTime } from "../lib/format";

interface Props {
  snapshot: InventorySnapshot;
  currentUser: User;
  onUpdateProfile: (input: UpdateOwnProfileRequest) => Promise<void>;
  onChangePassword: (input: ChangeOwnPasswordRequest) => Promise<void>;
}

export function ProfilePage({
  snapshot,
  currentUser,
  onUpdateProfile,
  onChangePassword,
}: Props) {
  const [name, setName] = useState(currentUser.name);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<string>();
  const [submitting, setSubmitting] = useState<"profile" | "password" | undefined>();

  const assignedLocations = snapshot.locations.filter((location) =>
    currentUser.assignedLocationIds.includes(location.id),
  );

  useEffect(() => {
    setName(currentUser.name);
  }, [currentUser.name]);

  async function handleProfileSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("profile");
    setFeedback(undefined);

    try {
      await onUpdateProfile({ name });
      setFeedback("Your profile information has been updated.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setSubmitting(undefined);
    }
  }

  async function handlePasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting("password");
    setFeedback(undefined);

    try {
      if (!oldPassword || !newPassword || !confirmPassword) {
        throw new Error("Enter your current password and your new password twice.");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("Your new password confirmation does not match.");
      }

      await onChangePassword({ oldPassword, newPassword });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFeedback("Your password has been updated and your session has been refreshed.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setSubmitting(undefined);
    }
  }

  return (
    <Stack spacing={2.5}>
      <Box sx={{ px: { xs: 0.25, md: 0.5 }, py: { xs: 0.5, md: 0.75 } }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          justifyContent="space-between"
          spacing={2}
        >
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              My Profile
            </Typography>
            <Typography variant="h4" sx={{ mt: 0.5 }}>
              {currentUser.name}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1.25, maxWidth: 720 }}>
              Update your display information here. Your username stays fixed for self-service use,
              your email account remains separate, and password changes require your current password
              before a new one is saved.
            </Typography>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} useFlexGap flexWrap="wrap">
            <Chip label={ROLE_PRESETS[currentUser.role].label} color="primary" />
            <Chip
              variant="outlined"
              label={`${assignedLocations.length} assigned site${assignedLocations.length === 1 ? "" : "s"}`}
            />
            <Chip variant="outlined" label={`Last active ${formatDateTime(currentUser.lastSeenAt)}`} />
          </Stack>
        </Stack>
      </Box>

      {feedback ? <Alert severity="info">{feedback}</Alert> : null}

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            xl: "minmax(0, 1fr) minmax(0, 1fr)",
          },
        }}
      >
        <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
                Personal Details
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Profile information
              </Typography>
            </Box>

            <Box component="form" onSubmit={handleProfileSubmit}>
              <Stack spacing={2}>
                <TextField label="Display name" value={name} onChange={(event) => setName(event.target.value)} fullWidth />
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  <TextField label="Username" value={currentUser.username} fullWidth disabled />
                  <TextField label="Email" value={currentUser.email} fullWidth disabled />
                </Box>
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  <TextField label="Role" value={ROLE_PRESETS[currentUser.role].label} fullWidth disabled />
                  <TextField label="Last active" value={formatDateTime(currentUser.lastSeenAt)} fullWidth disabled />
                </Box>

                <Stack direction="row" justifyContent="flex-start">
                  <Button type="submit" variant="contained" disabled={submitting === "profile"}>
                    {submitting === "profile" ? "Saving..." : "Save profile"}
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
                Security
              </Typography>
              <Typography variant="h6" sx={{ mt: 0.5 }}>
                Change password
              </Typography>
            </Box>

            <Box component="form" onSubmit={handlePasswordSubmit}>
              <Stack spacing={2}>
                <TextField
                  label="Current password"
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  autoComplete="current-password"
                  fullWidth
                />
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
                  <TextField
                    label="New password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    fullWidth
                  />
                  <TextField
                    label="Confirm new password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat the new password"
                    autoComplete="new-password"
                    fullWidth
                  />
                </Box>

                <Stack direction="row" justifyContent="flex-start">
                  <Button type="submit" variant="outlined" disabled={submitting === "password"}>
                    {submitting === "password" ? "Updating..." : "Update password"}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </Box>

      <Paper sx={{ p: { xs: 2.25, md: 3 }, borderRadius: 4 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 800, letterSpacing: "0.16em" }}>
              Assigned Locations
            </Typography>
            <Typography variant="h6" sx={{ mt: 0.5 }}>
              Sites you can work with
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {assignedLocations.length > 0 ? (
              assignedLocations.map((location) => (
                <Chip
                  key={location.id}
                  variant="outlined"
                  label={`${location.code} - ${location.name}`}
                />
              ))
            ) : (
              <Typography variant="body2" color="text.secondary">
                No locations have been assigned to this profile yet.
              </Typography>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
