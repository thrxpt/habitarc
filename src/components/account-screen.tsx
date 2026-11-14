import { useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";
import { cn } from "#lib/utils.ts";

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
  const [invalidFields, setInvalidFields] = useState({
    email: false,
    password: false,
  });
  const updateFieldValidity = (input: HTMLInputElement) => {
    const { name } = input;
    if (name !== "email" && name !== "password") {
      return;
    }
    const invalid = !input.validity.valid;
    setInvalidFields((previous) => ({ ...previous, [name]: invalid }));
  };
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
    setInvalidFields({ email: false, password: false });
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
          if (result.error.status === 401) {
            setInvalidFields({ email: true, password: true });
          }
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
    <div className="compact:px-6 mx-auto flex min-h-svh max-w-[1240px] flex-col px-12">
      <header className="compact:min-h-22 flex min-h-28 items-center justify-between gap-6 border-b">
        <a
          className="text-3xl leading-normal font-[750] tracking-[-0.04em] no-underline"
          href="/"
          aria-label="Habitarc home"
        >
          habitarc
          <span className="text-ring" aria-hidden="true">
            .
          </span>
        </a>
        {identity && (
          <Button
            variant="outline"
            size="lg"
            disabled={pending}
            onClick={() => {
              void signOut();
            }}
            type="button"
          >
            {pending ? "Signing out…" : "Sign out"}
          </Button>
        )}
      </header>
      <main
        className={cn(
          "flex-1",
          identity
            ? "compact:pt-10 compact:pb-14 pt-16 pb-20"
            : "compact:grid-cols-1 compact:gap-10 compact:pt-11 compact:pb-14 grid grid-cols-[1fr_400px] items-center gap-[clamp(48px,7vw,112px)] pt-18 pb-24"
        )}
      >
        {identity ? (
          <>
            <h1 className="font-heading mb-6 text-[clamp(38px,4.5vw,62px)] leading-[1.12] font-normal tracking-[-0.035em] text-balance">
              {identity.role === "participant"
                ? "Your workspace"
                : "Activity Templates"}
            </h1>
            <p className="text-muted-foreground mb-6 max-w-prose text-xl leading-[1.65]">
              Welcome, {identity.name}.
            </p>
            <dl className="compact:flex-col compact:gap-6 mt-9 flex flex-wrap gap-x-14 gap-y-7 border-y py-7">
              <div>
                <dt className="text-muted-foreground mb-2 text-sm leading-normal">
                  Signed in as
                </dt>
                <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
                  {identity.email}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-2 text-sm leading-normal">
                  Role
                </dt>
                <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
                  {identity.role === "participant"
                    ? "Participant"
                    : "Program Manager"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-2 text-sm leading-normal">
                  Account Timezone
                </dt>
                <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
                  {identity.timezone}
                </dd>
              </div>
            </dl>
            <section
              className="mt-12 max-w-160"
              aria-label="Workspace overview"
            >
              <h2 className="mb-3 text-[23px] leading-[1.3] font-[650]">
                {identity.role === "participant"
                  ? "A place for your routines"
                  : "Shared activities start here"}
              </h2>
              <p className="text-muted-foreground mb-6 max-w-prose leading-[1.65]">
                {identity.role === "participant"
                  ? "Your workspace is private. Your study and movement routines will live here."
                  : "Your workspace is for maintaining Activity Templates. Participants’ personal tracking histories stay private."}
              </p>
            </section>
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <>
            <div>
              <h1 className="font-heading compact:text-[clamp(36px,7vw,48px)] mb-6 text-[clamp(38px,4.5vw,62px)] leading-[1.12] font-normal tracking-[-0.035em] text-balance">
                Make room for
                <br />a steady routine.
              </h1>
              <p className="text-muted-foreground compact:mb-0 compact:text-lg mb-6 max-w-prose text-xl leading-[1.65]">
                A little study. A little movement.
                <br />A space to keep track of your effort.
              </p>
            </div>
            <section
              className="border-primary compact:w-full compact:max-w-120 border-t-3 pt-7"
              aria-labelledby="sign-in-heading"
            >
              <h2
                id="sign-in-heading"
                className="mb-3 text-[23px] leading-[1.3] font-[650]"
              >
                Sign in to Habitarc
              </h2>
              <p className="text-muted-foreground mb-6 max-w-prose leading-[1.65]">
                Use the account provided by your program.
              </p>
              <form
                onSubmit={(event) => {
                  void signIn(event);
                }}
                aria-busy={pending}
              >
                <FieldGroup className="mt-6">
                  <Field
                    data-disabled={pending}
                    data-invalid={invalidFields.email}
                  >
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      autoComplete="username"
                      id="email"
                      name="email"
                      type="email"
                      required
                      disabled={pending}
                      aria-invalid={invalidFields.email}
                      aria-describedby={
                        invalidFields.email && error
                          ? "sign-in-error"
                          : undefined
                      }
                      onBlur={(event) => {
                        updateFieldValidity(event.currentTarget);
                      }}
                      onInvalid={(event) => {
                        updateFieldValidity(event.currentTarget);
                      }}
                      onChange={(event) => {
                        if (invalidFields.email) {
                          updateFieldValidity(event.currentTarget);
                        }
                      }}
                    />
                  </Field>
                  <Field
                    data-disabled={pending}
                    data-invalid={invalidFields.password}
                  >
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      autoComplete="current-password"
                      id="password"
                      name="password"
                      type="password"
                      required
                      disabled={pending}
                      aria-invalid={invalidFields.password}
                      aria-describedby={
                        invalidFields.password && error
                          ? "sign-in-error"
                          : undefined
                      }
                      onBlur={(event) => {
                        updateFieldValidity(event.currentTarget);
                      }}
                      onInvalid={(event) => {
                        updateFieldValidity(event.currentTarget);
                      }}
                      onChange={(event) => {
                        if (invalidFields.password) {
                          updateFieldValidity(event.currentTarget);
                        }
                      }}
                    />
                  </Field>
                  {error && (
                    <Alert id="sign-in-error" variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button size="lg" disabled={pending} type="submit">
                    {pending ? "Signing in…" : "Sign in"}
                  </Button>
                </FieldGroup>
              </form>
              <p className="text-muted-foreground mt-4 mb-6 max-w-prose text-sm leading-[1.65]">
                Need help with your account? Contact your program’s organizer.
              </p>
            </section>
          </>
        )}
      </main>
      <footer className="text-muted-foreground border-t py-6 text-sm leading-normal">
        Small steps, at your own pace.
      </footer>
    </div>
  );
};
