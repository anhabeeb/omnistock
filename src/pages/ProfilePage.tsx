import { useEffect, useState } from "react";
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

      await onChangePassword({
        oldPassword,
        newPassword,
      });

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
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">My Profile</p>
          <h1>{currentUser.name}</h1>
          <p className="hero-copy">
            Update your display information here. Your username stays fixed for self-service use,
            your email account remains separate, and password changes require your current password
            before a new one is saved.
          </p>
        </div>

        <div className="hero-meta">
          <div className="meta-card">
            <span>Role</span>
            <strong>{ROLE_PRESETS[currentUser.role].label}</strong>
            <small>{ROLE_PRESETS[currentUser.role].description}</small>
          </div>
          <div className="meta-card">
            <span>Assigned sites</span>
            <strong>{assignedLocations.length}</strong>
            <small>
              {assignedLocations.map((location) => location.code).join(", ") || "No assigned sites"}
            </small>
          </div>
        </div>
      </section>

      <section className="split-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Personal Details</p>
              <h2>Profile information</h2>
            </div>
          </div>

          <form className="page-stack" onSubmit={handleProfileSubmit}>
            <div className="form-grid">
              <label className="field">
                <span>Display name</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>

              <label className="field">
                <span>Username</span>
                <input value={currentUser.username} readOnly disabled />
              </label>

              <label className="field">
                <span>Email</span>
                <input value={currentUser.email} readOnly disabled />
              </label>

              <label className="field">
                <span>Role</span>
                <input value={ROLE_PRESETS[currentUser.role].label} readOnly disabled />
              </label>

              <label className="field">
                <span>Last active</span>
                <input value={formatDateTime(currentUser.lastSeenAt)} readOnly disabled />
              </label>
            </div>

            <div className="button-row">
              <button
                type="submit"
                className="primary-button"
                disabled={submitting === "profile"}
              >
                {submitting === "profile" ? "Saving..." : "Save profile"}
              </button>
            </div>
          </form>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Security</p>
              <h2>Change password</h2>
            </div>
          </div>

          <form className="page-stack" onSubmit={handlePasswordSubmit}>
            <div className="form-grid">
              <label className="field field-wide">
                <span>Current password</span>
                <input
                  type="password"
                  value={oldPassword}
                  onChange={(event) => setOldPassword(event.target.value)}
                  autoComplete="current-password"
                />
              </label>

              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Repeat the new password"
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="button-row">
              <button
                type="submit"
                className="secondary-button"
                disabled={submitting === "password"}
              >
                {submitting === "password" ? "Updating..." : "Update password"}
              </button>
            </div>
          </form>
        </article>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Assigned Locations</p>
            <h2>Where you can operate</h2>
          </div>
        </div>
        <div className="stack-list">
          {assignedLocations.length > 0 ? (
            assignedLocations.map((location) => (
              <div key={location.id} className="list-row">
                <div>
                  <strong>{location.name}</strong>
                  <p>
                    {location.code} - {location.city}
                  </p>
                </div>
                <span className="status-chip neutral">{location.type}</span>
              </div>
            ))
          ) : (
            <p className="empty-copy">No locations are currently assigned to your account.</p>
          )}
        </div>
      </section>

      {feedback ? <p className="feedback-copy">{feedback}</p> : null}
    </div>
  );
}
