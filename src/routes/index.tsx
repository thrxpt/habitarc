import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { authClient } from "../auth-client";
import { AccountScreen } from "../components/account-screen";
import { getIdentity, getWorkspace } from "../server/functions";

const Home = () => {
  const identity = Route.useLoaderData();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  useEffect(() => {
    if (!isPending && identity?.id !== session?.user.id) {
      void router.invalidate();
    }
  }, [identity?.id, session?.user.id, isPending, router]);
  return (
    <AccountScreen
      identity={identity}
      onSessionChanged={async () => {
        await router.invalidate();
      }}
    />
  );
};

export const Route = createFileRoute("/")({
  loader: async () => {
    const identity = await getIdentity();
    return identity ? await getWorkspace({ data: identity.role }) : null;
  },
  component: Home,
  errorComponent: () => (
    <main className="compact:pt-10 compact:pb-14 flex-1 pt-16 pb-20">
      <h1 className="font-heading mb-6 text-[clamp(38px,4.5vw,62px)] leading-[1.12] font-normal tracking-[-0.035em] text-balance">
        We couldn’t load your workspace
      </h1>
      <p>Please try again in a moment.</p>
      <a href="/">Reload Habitarc</a>
    </main>
  ),
});
