import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { authClient } from "../auth-client";
import { AccountScreen } from "../components/account-screen";
import { PageHeading } from "../components/page-heading";
import { getIdentity } from "../server/functions";

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
  loader: async () => await getIdentity(),
  component: Home,
  errorComponent: () => (
    <main className="compact:pt-10 compact:pb-14 flex-1 pt-16 pb-20">
      <PageHeading>We couldn’t load your workspace</PageHeading>
      <p>Please try again in a moment.</p>
      <a href="/">Reload Habitarc</a>
    </main>
  ),
});
