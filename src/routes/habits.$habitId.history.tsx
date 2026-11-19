import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { authClient } from "../auth-client";
import { isValidIsoDate } from "../calendar";
import { AccountShell } from "../components/account-shell";
import { HistoryPanel } from "../components/history-panel";
import { PageHeading } from "../components/page-heading";
import { deleteEntry, getHistory, updateEntry } from "../server/functions";

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
  const [refresh, setRefresh] = useState<{
    from: typeof loaded;
    result: typeof loaded;
  } | null>(null);
  const data = refresh?.from === loaded ? refresh.result : loaded;
  const { before } = Route.useSearch();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

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
        key={JSON.stringify([viewer.id, history.habitId, before])}
        history={history}
        onSubmit={async (draft) => {
          if ("amount" in draft) {
            return await updateEntry({ data: draft });
          }
          return await deleteEntry({ data: draft });
        }}
        onRefresh={async () => {
          const result = await getHistory({ data: { ...params, before } });
          setRefresh({ from: loaded, result });
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
  loader: async ({ params: { habitId }, deps: { before } }) =>
    await getHistory({ data: { habitId, before } }),
  component: HistoryPage,
  errorComponent: HistoryUnavailable,
});
