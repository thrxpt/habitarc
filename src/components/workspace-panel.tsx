import { Alert, AlertDescription } from "#components/ui/alert.tsx";

import type {
  HabitCreationResponse,
  HabitDraft,
  HabitWorkspace,
} from "../habits";
import type { Identity } from "../identity";
import type { ActivityTemplate, ActivityTemplateDraft } from "../templates";
import { HabitList } from "./habit-list";
import { PageHeading } from "./page-heading";
import { TemplateCreateForm } from "./template-create-form";
import { TemplateLibrary } from "./template-library";

const EMPTY_TEMPLATES: ActivityTemplate[] = [];

export const WorkspacePanel = ({
  habitWorkspace,
  onCreateHabit,
  identity,
  templates = EMPTY_TEMPLATES,
  hasMoreTemplates = false,
  loadingMoreTemplates = false,
  loadMoreTemplatesError = "",
  error,
  onCreateTemplate,
  onLoadMoreTemplates,
}: {
  habitWorkspace?: HabitWorkspace;
  onCreateHabit?: (draft: HabitDraft) => Promise<HabitCreationResponse>;
  identity: Identity;
  templates?: ActivityTemplate[];
  hasMoreTemplates?: boolean;
  loadingMoreTemplates?: boolean;
  loadMoreTemplatesError?: string;
  error: string;
  onCreateTemplate?: (
    draft: ActivityTemplateDraft
  ) => Promise<ActivityTemplate>;
  onLoadMoreTemplates?: () => Promise<void> | void;
}) => (
  <>
    <PageHeading>
      {identity.role === "participant"
        ? "Your workspace"
        : "Activity Templates"}
    </PageHeading>
    <p className="text-muted-foreground mb-6 max-w-prose text-xl leading-[1.65]">
      Welcome, {identity.name}.
    </p>
    <dl className="compact:flex-col compact:gap-6 mt-9 flex flex-wrap gap-x-14 gap-y-7 border-y py-7">
      <div>
        <dt className="text-muted-foreground mb-2 text-sm leading-normal">
          Signed in as
        </dt>
        <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
          {identity.email}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-2 text-sm leading-normal">
          Role
        </dt>
        <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
          {identity.role === "participant" ? "Participant" : "Program Manager"}
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground mb-2 text-sm leading-normal">
          Account Timezone
        </dt>
        <dd className="m-0 text-[17px] leading-normal wrap-anywhere">
          {identity.timezone}
        </dd>
      </div>
    </dl>
    <section className="mt-12 max-w-160" aria-label="Workspace overview">
      <h2 className="mb-3 text-[23px] leading-[1.3] font-[650]">
        {identity.role === "participant"
          ? "A place for your routines"
          : "Shared activities start here"}
      </h2>
      <p className="text-muted-foreground mb-6 max-w-prose leading-[1.65]">
        {identity.role === "participant"
          ? "Your workspace is private. Choose an activity and make room for a routine that works for you."
          : "Your workspace is for maintaining Activity Templates. Participants’ personal tracking histories stay private."}
      </p>
    </section>
    {identity.role === "program-manager" && (
      <TemplateCreateForm onCreateTemplate={onCreateTemplate} />
    )}
    {identity.role === "participant" && habitWorkspace && (
      <HabitList workspace={habitWorkspace} />
    )}
    <TemplateLibrary
      habitWorkspace={
        identity.role === "participant" ? habitWorkspace : undefined
      }
      onCreateHabit={onCreateHabit}
      role={identity.role}
      templates={templates}
      hasMore={hasMoreTemplates}
      loadingMore={loadingMoreTemplates}
      loadMoreError={loadMoreTemplatesError}
      onLoadMore={onLoadMoreTemplates}
    />
    {error && (
      <Alert variant="destructive" className="mt-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )}
  </>
);
