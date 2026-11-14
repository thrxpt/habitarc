import { formatSchedule } from "../habits";
import type { Habit, HabitWorkspace } from "../habits";
import { formatTemplateRange } from "../templates";

const formatTrackingPeriod = (habit: Habit, accountDate: string): string => {
  const start = `Started ${habit.startDate}`;
  if (habit.archivedFrom === null) {
    return start;
  }
  const label =
    habit.archivedFrom > accountDate ? "Archive begins" : "Archived from";
  return `${start} · ${label} ${habit.archivedFrom}`;
};

export const HabitList = ({ workspace }: { workspace: HabitWorkspace }) => (
  <section className="mt-12 max-w-2xl" aria-labelledby="habit-list-heading">
    <h2
      id="habit-list-heading"
      className="mb-3 text-[23px] leading-[1.3] font-[650]"
    >
      Your Habits
    </h2>
    <p className="text-muted-foreground mb-6 text-sm">
      Account date: {workspace.accountDate} ({workspace.timezone})
    </p>
    {workspace.items.length === 0 ? (
      <p className="text-muted-foreground">
        Choose an Activity Template below to start your first Habit.
      </p>
    ) : (
      <ul className="divide-y border-y">
        {workspace.items.map((habit) => (
          <li id={`habit-${habit.id}`} key={habit.id} className="py-5">
            <h3 className="mb-2 text-lg font-[650]">{habit.template.name}</h3>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-muted-foreground text-sm">Daily Target</dt>
                <dd>
                  {habit.goal.dailyTarget.toLocaleString("en-US")}{" "}
                  {habit.template.unit}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">Schedule</dt>
                <dd>{formatSchedule(habit.goal.weekdays)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  Per-entry range
                </dt>
                <dd>{formatTemplateRange(habit.template)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-sm">
                  Tracking period
                </dt>
                <dd>{formatTrackingPeriod(habit, workspace.accountDate)}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    )}
  </section>
);
