import { useState } from "react";
import type { ChangeEvent, SubmitEvent, SyntheticEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";

import { authClient } from "../auth-client";

export const SignInPanel = ({
  onSessionChanged,
}: {
  onSessionChanged: () => Promise<void>;
}) => {
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
  const validateField = (event: SyntheticEvent<HTMLInputElement>) => {
    updateFieldValidity(event.currentTarget);
  };
  const fieldProps = (name: "email" | "password") => ({
    id: name,
    name,
    required: true,
    disabled: pending,
    "aria-invalid": invalidFields[name],
    "aria-describedby":
      invalidFields[name] && error ? "sign-in-error" : undefined,
    onBlur: validateField,
    onInvalid: validateField,
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      if (invalidFields[name]) {
        updateFieldValidity(event.currentTarget);
      }
    },
  });

  return (
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
          <Field data-disabled={pending} data-invalid={invalidFields.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              autoComplete="username"
              type="email"
              {...fieldProps("email")}
            />
          </Field>
          <Field data-disabled={pending} data-invalid={invalidFields.password}>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input
              autoComplete="current-password"
              type="password"
              {...fieldProps("password")}
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
        Need help with your account? Contact your Program Manager.
      </p>
    </section>
  );
};
