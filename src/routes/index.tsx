import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client";
import { AccountScreen } from "../components/account-screen";
import { PageHeading } from "../components/page-heading";
import {
  createTemplate,
  getIdentity,
  listTemplates,
} from "../server/functions";
import type {
  ActivityTemplate,
  ActivityTemplatePage,
  TemplateCursor,
} from "../templates";

const EMPTY_TEMPLATE_PAGE: ActivityTemplatePage = {
  items: [],
  nextCursor: null,
};

const Home = () => {
  const { identity, templatePage } = Route.useLoaderData();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [extraState, setExtraState] = useState<{
    forPage: ActivityTemplatePage;
    items: ActivityTemplate[];
    nextCursor: TemplateCursor | null;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreErrorState, setLoadMoreErrorState] = useState<{
    forPage: ActivityTemplatePage;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!isPending && identity?.id !== session?.user.id) {
      void router.invalidate();
    }
  }, [identity?.id, session?.user.id, isPending, router]);

  const activeExtra = extraState?.forPage === templatePage ? extraState : null;
  const templates =
    activeExtra !== null
      ? [...templatePage.items, ...activeExtra.items]
      : templatePage.items;
  const nextCursor =
    activeExtra !== null ? activeExtra.nextCursor : templatePage.nextCursor;
  const loadMoreError =
    loadMoreErrorState?.forPage === templatePage
      ? loadMoreErrorState.message
      : "";

  const loadMoreTemplates = async () => {
    if (nextCursor === null || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadMoreErrorState(null);
    try {
      const nextPage = await listTemplates({ data: { cursor: nextCursor } });
      const seen = new Set(templates.map((template) => template.id));
      const appended = nextPage.items.filter(
        (template) => !seen.has(template.id)
      );
      setExtraState({
        forPage: templatePage,
        items: [...(activeExtra?.items ?? []), ...appended],
        nextCursor: nextPage.nextCursor,
      });
      setLoadingMore(false);
    } catch {
      setLoadingMore(false);
      setLoadMoreErrorState({
        forPage: templatePage,
        message: "We couldn’t load more Activity Templates. Please try again.",
      });
    }
  };

  return (
    <AccountScreen
      identity={identity}
      templates={templates}
      hasMoreTemplates={nextCursor !== null}
      loadingMoreTemplates={loadingMore}
      loadMoreTemplatesError={loadMoreError}
      onSessionChanged={async () => {
        await router.invalidate();
      }}
      onCreateTemplate={async (draft) => {
        const created = await createTemplate({ data: draft });
        await router.invalidate();
        return created;
      }}
      onLoadMoreTemplates={loadMoreTemplates}
    />
  );
};

export const Route = createFileRoute("/")({
  loader: async () => {
    const identity = await getIdentity();
    if (!identity) {
      return { identity: null, templatePage: EMPTY_TEMPLATE_PAGE };
    }
    const templatePage = await listTemplates();
    return { identity, templatePage };
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
