import { cn } from "cn";
import { useState } from "react";

import { Button } from "#components/ui/button.tsx";

import { authClient } from "../auth-client";
import type { Identity } from "../identity";
import { SignInPanel } from "./sign-in-panel";
import { WorkspacePanel } from "./workspace-panel";

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
  const signedIn = async () => {
    setError("");
    await onSessionChanged();
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
          <WorkspacePanel identity={identity} error={error} />
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
            <SignInPanel onSessionChanged={signedIn} />
          </>
        )}
      </main>
      <footer className="text-muted-foreground border-t py-6 text-sm leading-normal">
        Small steps, at your own pace.
      </footer>
    </div>
  );
};
