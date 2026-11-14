import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { authClient } from "../auth-client";
import { AccountScreen } from "../components/account-screen";
import { PageHeading } from "../components/page-heading";
import {
  createTemplate,
  getIdentity,
  listTemplates,
} from "../server/functions";

const Home = () => {
  const { identity, templates } = Route.useLoaderData();
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
      templates={templates}
      onSessionChanged={async () => {
        await router.invalidate();
      }}
      onCreateTemplate={async (draft) => {
        const created = await createTemplate({ data: draft });
        await router.invalidate();
        return created;
      }}
    />
  );
};

export const Route = createFileRoute("/")({
  loader: async () => {
    const identity = await getIdentity();
    if (!identity) {
      return { identity: null, templates: [] };
    }
    const templates = await listTemplates();
    return { identity, templates };
  },
  component: Home,
  errorComponent: () => (
    <main className="compact:pt-10 compact:pb-14 flex-1 pt-16 pb-20">
      <PageHeading>We couldn’t load your workspace</PageHeading>
      <p>Please try again in a moment.</p>
      <a href="/">Reload Habitarc</a>
    </main>
  ),
});
