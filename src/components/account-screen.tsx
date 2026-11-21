import type {
  ActivityEntryDraft,
  RecordEntryResponse,
  TodayWorkspace,
} from "../entries";
import type {
  ArchiveHabitDraft,
  ArchiveHabitResponse,
  GoalRevisionDraft,
  GoalRevisionResponse,
  HabitCreationResponse,
  HabitDraft,
  HabitWorkspace,
  ReminderDraft,
  SetReminderResponse,
} from "../habits";
import type { Identity } from "../identity";
import type {
  ActivityTemplate,
  ActivityTemplateDraft,
  TemplateMaintenanceActions,
} from "../templates";
import { AccountShell } from "./account-shell";
import { PageHeading } from "./page-heading";
import { SignInPanel } from "./sign-in-panel";
import { WorkspacePanel } from "./workspace-panel";

interface AccountScreenProps {
  todayWorkspace?: TodayWorkspace;
  onRecordEntry?: (draft: ActivityEntryDraft) => Promise<RecordEntryResponse>;
  habitWorkspace?: HabitWorkspace;
  onCreateHabit?: (draft: HabitDraft) => Promise<HabitCreationResponse>;
  onReviseGoal?: (draft: GoalRevisionDraft) => Promise<GoalRevisionResponse>;
  onArchiveHabit?: (draft: ArchiveHabitDraft) => Promise<ArchiveHabitResponse>;
  onSetReminder?: (draft: ReminderDraft) => Promise<SetReminderResponse>;
  identity: Identity | null;
  templates?: ActivityTemplate[];
  hasMoreTemplates?: boolean;
  loadingMoreTemplates?: boolean;
  loadMoreTemplatesError?: string;
  onSessionChanged: () => Promise<void>;
  onCreateTemplate?: (
    draft: ActivityTemplateDraft
  ) => Promise<ActivityTemplate>;
  onLoadMoreTemplates?: () => Promise<void> | void;
  templateMaintenance?: TemplateMaintenanceActions;
}

const EMPTY_TEMPLATES: ActivityTemplate[] = [];

export const AccountScreen = ({
  todayWorkspace,
  onRecordEntry,
  habitWorkspace,
  onCreateHabit,
  onReviseGoal,
  onArchiveHabit,
  onSetReminder,
  identity,
  templates = EMPTY_TEMPLATES,
  hasMoreTemplates = false,
  loadingMoreTemplates = false,
  loadMoreTemplatesError = "",
  onSessionChanged,
  onCreateTemplate,
  onLoadMoreTemplates,
  templateMaintenance,
}: AccountScreenProps) => (
  <AccountShell
    key={identity?.id ?? "signed-out"}
    signedIn={identity !== null}
    onSignedOut={onSessionChanged}
    mainClassName={
      identity === null
        ? "compact:grid-cols-1 compact:gap-10 compact:pt-11 compact:pb-14 grid grid-cols-[1fr_400px] items-center gap-[clamp(48px,7vw,112px)] pt-18 pb-24"
        : undefined
    }
  >
    {identity ? (
      <WorkspacePanel
        key={identity.id}
        todayWorkspace={todayWorkspace}
        onRecordEntry={onRecordEntry}
        habitWorkspace={habitWorkspace}
        onCreateHabit={onCreateHabit}
        onReviseGoal={onReviseGoal}
        onArchiveHabit={onArchiveHabit}
        onSetReminder={onSetReminder}
        identity={identity}
        templates={templates}
        hasMoreTemplates={hasMoreTemplates}
        loadingMoreTemplates={loadingMoreTemplates}
        loadMoreTemplatesError={loadMoreTemplatesError}
        onCreateTemplate={onCreateTemplate}
        onLoadMoreTemplates={onLoadMoreTemplates}
        templateMaintenance={templateMaintenance}
      />
    ) : (
      <>
        <div>
          <PageHeading className="compact:text-[clamp(36px,7vw,48px)]">
            Make room for
            <br />a steady routine.
          </PageHeading>
          <p className="text-muted-foreground compact:mb-0 compact:text-lg mb-6 max-w-prose text-xl leading-[1.65]">
            A little study. A little movement.
            <br />A space to keep track of your effort.
          </p>
        </div>
        <SignInPanel onSessionChanged={onSessionChanged} />
      </>
    )}
  </AccountShell>
);
