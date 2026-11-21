import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth-client";
import { isValidIsoDate } from "../calendar";
import { AccountShell } from "../components/account-shell";
import { HistoryPanel } from "../components/history-panel";
import { PageHeading } from "../components/page-heading";
import { deleteEntry, getHistory, updateEntry } from "../server/functions";
import {
  getNavigationElapsedTime,
  useAccountDateRefresh,
} from "../use-account-date-refresh";

const loadHistory = async (query: { habitId: string; before?: string }) => {
  const startedAt = getNavigationElapsedTime();
  const result = await getHistory({ data: query });
  return {
    result,
    startedAt,
    rolloverAt: result === null ? null : startedAt + result.history.refreshInMs,
  };
};

const HistoryUnavailable = () => (
  <main className="compact:px-6 compact:py-10 mx-auto max-w-[1240px] px-12 py-16">
    <PageHeading>History unavailable</PageHeading>
    <Link to="/" className="underline">
      Back to workspace
    </Link>
  </main>
);

const HistoryPage = () => {
  const loaded = Route.useLoaderData();
  const [refresh, setRefresh] = useState<typeof loaded | null>(null);
  const { result: data, rolloverAt } =
    refresh !== null && refresh.startedAt >= loaded.startedAt
      ? refresh
      : loaded;
  const { before } = Route.useSearch();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  useAccountDateRefresh(rolloverAt);

  if (data === null || (!isPending && session?.user.id !== data.viewer.id)) {
    return <HistoryUnavailable />;
  }
  const { history, viewer } = data;
  const params = { habitId: history.habitId };

  return (
    <AccountShell
      signedIn
      onSignedOut={async () => {
        await router.navigate({ to: "/", replace: true });
      }}
    >
      <Link to="/" className="mb-6 inline-block text-sm underline">
        Back to workspace
      </Link>
      <PageHeading>{history.template.name} history</PageHeading>
      <p className="text-muted-foreground mb-2 text-sm">
        Signed in as {viewer.name}
      </p>
      <HistoryPanel
        key={viewer.id}
        history={history}
        onSubmit={async (draft) => {
          if ("amount" in draft) {
            return await updateEntry({ data: draft });
          }
          return await deleteEntry({ data: draft });
        }}
        onRefresh={async () => {
          const result = await loadHistory({ ...params, before });
          setRefresh((previous) =>
            previous === null || result.startedAt >= previous.startedAt
              ? result
              : previous
          );
        }}
      />
      {(before !== undefined || history.nextBefore !== null) && (
        <nav
          aria-label="History pages"
          className="mt-6 flex flex-wrap gap-4 text-sm"
        >
          {before !== undefined && (
            <Link
              to="/habits/$habitId/history"
              params={params}
              search={{}}
              className="underline"
            >
              Latest dates
            </Link>
          )}
          {history.nextBefore !== null && (
            <Link
              to="/habits/$habitId/history"
              params={params}
              search={{ before: history.nextBefore }}
              className="underline"
            >
              Older dates
            </Link>
          )}
        </nav>
      )}
    </AccountShell>
  );
};

export const Route = createFileRoute("/habits/$habitId/history")({
  validateSearch: (search: Record<string, unknown>): { before?: string } =>
    isValidIsoDate(search.before) ? { before: search.before } : {},
  loaderDeps: ({ search: { before } }) => ({ before }),
  remountDeps: ({ params, loaderDeps }) => [params.habitId, loaderDeps.before],
  loader: async ({ params: { habitId }, deps: { before } }) =>
    await loadHistory({ habitId, before }),
  component: HistoryPage,
  errorComponent: HistoryUnavailable,
});
