import { useState } from "react";
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
    <div className="loading-screen">
      <div className="page-stack" style={{ width: "min(1040px, 100%)" }}>
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Access Control</p>
            <h1>{MODE_COPY[mode].title}</h1>
            <p className="hero-copy">
              OmniStock now uses session-based sign-in. Passwords are protected in D1 with salted
              PBKDF2 hashing, and superadmin user management is handled from Administration after
              login.
            </p>
          </div>

          <div className="hero-meta">
            <div className="meta-card">
              <span>Connection</span>
              <strong>{syncState.online ? "Online" : "Offline"}</strong>
              <small>Login needs an online connection so the worker can validate your session.</small>
            </div>
            <div className="meta-card">
              <span>Realtime status</span>
              <strong>{syncState.websocket}</strong>
              <small>The websocket will reconnect automatically after authentication succeeds.</small>
            </div>
          </div>
        </section>

        <section className="split-grid">
          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Authentication</p>
                <h2>Enter your credentials</h2>
              </div>
            </div>

            <div className="chip-row">
              {(["login", "activate"] as AuthMode[]).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  className={mode === entry ? "chip-button active" : "chip-button"}
                  onClick={() => {
                    setMode(entry);
                    setFeedback(undefined);
                  }}
                >
                  {entry === "login" ? "Sign in" : "Activate superadmin"}
                </button>
              ))}
            </div>

            <form className="page-stack" onSubmit={handleSubmit}>
              <p className="helper-text">{MODE_COPY[mode].helper}</p>

              <div className="form-grid">
                <label className="field field-wide">
                  <span>Username or email</span>
                  <input
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="username or you@company.com"
                    autoComplete="username"
                  />
                </label>

                <label className="field field-wide">
                  <span>Password</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Minimum 8 characters"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </label>
              </div>

              <div className="button-row">
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting || !syncState.online}
                >
                  {submitting ? "Checking..." : MODE_COPY[mode].button}
                </button>
              </div>

              {feedback ? <p className="feedback-copy">{feedback}</p> : null}
            </form>
          </article>

          <article className="panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">What Changed</p>
                <h2>Security and user access</h2>
              </div>
            </div>

            <div className="timeline">
              <div className="timeline-item">
                <div className="timeline-dot tone-success" />
                <div>
                  <strong>Passwords are no longer plain text</strong>
                  <p>Each account now stores a salted PBKDF2 hash and iteration count in D1.</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-dot tone-success" />
                <div>
                  <strong>Superadmins can manage user access</strong>
                  <p>Edit user details, reset passwords, and remove accounts from Administration.</p>
                </div>
              </div>
              <div className="timeline-item">
                <div className="timeline-dot tone-info" />
                <div>
                  <strong>Sessions are cookie-based</strong>
                  <p>The worker keeps the browser session signed in without exposing tokens in the UI.</p>
                </div>
              </div>
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
