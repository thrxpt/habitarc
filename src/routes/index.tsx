import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client";
import { AccountScreen } from "../components/account-screen";
import { PageHeading } from "../components/page-heading";
import {
  archiveHabit,
  archiveTemplate,
  createEntry,
  createTemplate,
  createHabit,
  getIdentity,
  getTrackingWorkspace,
  listTemplates,
  reviseGoal,
  updateTemplate,
} from "../server/functions";
import type {
  ActivityTemplate,
  ActivityTemplatePage,
  TemplateCursor,
  TemplateMaintenanceResponse,
} from "../templates";
import {
  getNavigationElapsedTime,
  useAccountDateRefresh,
} from "../use-account-date-refresh";

const EMPTY_TEMPLATE_PAGE: ActivityTemplatePage = {
  items: [],
  nextCursor: null,
};

const Home = () => {
  const { identity, templatePage, habitWorkspace, todayWorkspace, rolloverAt } =
    Route.useLoaderData();
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

  useAccountDateRefresh(rolloverAt);
  const refreshOnFocus = rolloverAt !== null;
  useEffect(() => {
    const refreshWorkspace = () => {
      void router.invalidate();
    };
    if (refreshOnFocus) {
      window.addEventListener("focus", refreshWorkspace);
    }
    return () => {
      window.removeEventListener("focus", refreshWorkspace);
    };
  }, [refreshOnFocus, router]);

  const activeExtra = extraState?.forPage === templatePage ? extraState : null;
  const templates =
    activeExtra === null
      ? templatePage.items
      : [...templatePage.items, ...activeExtra.items];
  const nextCursor =
    activeExtra === null ? templatePage.nextCursor : activeExtra.nextCursor;
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

  const refreshAfterMaintenance = async (
    response: TemplateMaintenanceResponse
  ) => {
    if (response.kind === "saved" || response.kind === "conflict") {
      await router.invalidate({ sync: true });
    }
    return response;
  };

  return (
    <AccountScreen
      todayWorkspace={todayWorkspace ?? undefined}
      onRecordEntry={async (draft) => {
        const result = await createEntry({ data: draft });
        if (result.kind === "created" || result.kind === "replayed") {
          await router.invalidate();
        }
        return result;
      }}
      habitWorkspace={habitWorkspace ?? undefined}
      onCreateHabit={async (draft) => {
        const result = await createHabit({ data: draft });
        if (result.kind !== "invalid") {
          await router.invalidate();
        }
        return result;
      }}
      onReviseGoal={async (draft) => {
        const result = await reviseGoal({ data: draft });
        if (result.kind === "saved" || result.kind === "replayed") {
          await router.invalidate({ sync: true });
        }
        return result;
      }}
      onArchiveHabit={async (draft) => {
        const result = await archiveHabit({ data: draft });
        if (result.kind === "archived" || result.kind === "replayed") {
          await router.invalidate({ sync: true });
        }
        return result;
      }}
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
      templateMaintenance={
        identity?.role === "program-manager"
          ? {
              update: async (draft) =>
                await refreshAfterMaintenance(
                  await updateTemplate({ data: draft })
                ),
              archive: async (draft) =>
                await refreshAfterMaintenance(
                  await archiveTemplate({ data: draft })
                ),
            }
          : undefined
      }
    />
  );
};

export const Route = createFileRoute("/")({
  loader: {
    staleReloadMode: "blocking",
    handler: async () => {
      const startedAt = getNavigationElapsedTime();
      const identity = await getIdentity();
      if (!identity) {
        return {
          identity: null,
          templatePage: EMPTY_TEMPLATE_PAGE,
          habitWorkspace: null,
          todayWorkspace: null,
          rolloverAt: null,
        };
      }
      const templatePage = await listTemplates();
      if (identity.role !== "participant") {
        return {
          identity,
          templatePage,
          habitWorkspace: null,
          todayWorkspace: null,
          rolloverAt: null,
        };
      }
      const { habitWorkspace, todayWorkspace, refreshInMs } =
        await getTrackingWorkspace();
      return {
        identity,
        templatePage,
        habitWorkspace,
        todayWorkspace,
        rolloverAt: startedAt + refreshInMs,
      };
    },
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
