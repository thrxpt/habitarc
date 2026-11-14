import { useState } from "react";
import type { SubmitEvent } from "react";

import { authClient } from "../auth-client";
import type { Identity } from "../identity";

interface AccountScreenProps {
  identity: Identity | null;
  onSessionChanged: () => Promise<void>;
}

export const AccountScreen = ({
  identity,
  onSessionChanged,
}: AccountScreenProps) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const signIn = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = data.get("email");
    const credential = data.get("password");
    if (typeof email !== "string" || typeof credential !== "string") {
      setError("Enter your email and password, then try again.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email,
        password: credential,
      });
      if (result.error) {
        if (result.error.status === 429) {
          setError("Too many sign-in attempts. Wait a minute, then try again.");
        } else if (result.error.status >= 500) {
          setError("Sign in is temporarily unavailable. Please try again.");
        } else {
          setError("Email or password is incorrect. Please try again.");
        }
      } else {
        form.reset();
        await onSessionChanged();
      }
    } catch {
      setError("We couldn’t connect. Check your connection and try again.");
    }
    const password = form.elements.namedItem("password");
    if (password instanceof HTMLInputElement) {
      password.value = "";
    }
    setPending(false);
  };
  const signOut = async () => {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("We couldn’t sign you out. Please try again.");
      } else {
        await onSessionChanged();
      }
    } catch {
      setError("We couldn’t connect. Please try signing out again.");
    }
    setPending(false);
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="Habitarc home">
          habitarc<span aria-hidden="true">.</span>
        </a>
        {identity && (
          <button
            className="secondary-button"
            disabled={pending}
            onClick={() => {
              void signOut();
            }}
            type="button"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        )}
      </header>
      <main className={identity ? "workspace" : "sign-in-layout"}>
        {identity ? (
          <>
            <h1>
              {identity.role === "participant"
                ? "Your workspace"
                : "Activity Templates"}
            </h1>
            <p className="intro">Welcome, {identity.name}.</p>
            <dl className="identity-details">
              <div>
                <dt>Signed in as</dt>
                <dd>{identity.email}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>
                  {identity.role === "participant"
                    ? "Participant"
                    : "Program Manager"}
                </dd>
              </div>
              <div>
                <dt>Account Timezone</dt>
                <dd>{identity.timezone}</dd>
              </div>
            </dl>
            <section className="workspace-note" aria-label="Workspace overview">
              <h2>
                {identity.role === "participant"
                  ? "A place for your routines"
                  : "Shared activities start here"}
              </h2>
              <p>
                {identity.role === "participant"
                  ? "Your workspace is private. Your study and movement routines will live here."
                  : "Your workspace is for maintaining Activity Templates. Participants’ personal tracking histories stay private."}
              </p>
            </section>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="welcome-copy">
              <h1>
                Make room for
                <br />a steady routine.
              </h1>
              <p className="intro">
                A little study. A little movement.
                <br />A space to keep track of your effort.
              </p>
            </div>
            <section
              className="sign-in-panel"
              aria-labelledby="sign-in-heading"
            >
              <h2 id="sign-in-heading">Sign in to Habitarc</h2>
              <p>Use the account provided by your program.</p>
              <form
                onSubmit={(event) => {
                  void signIn(event);
                }}
                aria-busy={pending}
              >
                <label htmlFor="email">Email</label>
                <input
                  autoComplete="username"
                  id="email"
                  name="email"
                  type="email"
                  required
                  disabled={pending}
                />
                <label htmlFor="password">Password</label>
                <input
                  autoComplete="current-password"
                  id="password"
                  name="password"
                  type="password"
                  required
                  disabled={pending}
                />
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="primary-button"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? "Signing in…" : "Sign in"}
                </button>
              </form>
              <p className="account-help">
                Need help with your account? Contact your program’s organizer.
              </p>
            </section>
          </>
        )}
      </main>
      <footer className="site-footer">Small steps, at your own pace.</footer>
    </div>
  );
};
