import { cn } from "cn";
import { useState } from "react";
import type { ReactNode } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";

import { authClient } from "../auth-client";

export const AccountShell = ({
  signedIn,
  onSignedOut,
  mainClassName = "compact:pt-10 compact:pb-14 pt-16 pb-20",
  children,
}: {
  signedIn: boolean;
  onSignedOut: () => Promise<void>;
  mainClassName?: string;
  children: ReactNode;
}) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const signOut = async () => {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("We couldn’t sign you out. Please try again.");
      } else {
        await onSignedOut();
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
        {signedIn && (
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
      <main className={cn("flex-1", mainClassName)}>
        {signedIn && error && (
          <Alert variant="destructive" className="mb-4 max-w-2xl">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </main>
      <footer className="text-muted-foreground border-t py-6 text-sm leading-normal">
        Small steps, at your own pace.
      </footer>
    </div>
  );
};
