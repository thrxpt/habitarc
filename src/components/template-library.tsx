import { cn } from "cn";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";

import type {
  HabitCreationResponse,
  HabitDraft,
  HabitWorkspace,
} from "../habits";
import type { Role } from "../identity";
import { formatTemplateRange } from "../templates";
import type {
  ActivityTemplate,
  TemplateMaintenanceActions,
  TemplateReference,
} from "../templates";
import { HabitCreateForm } from "./habit-create-form";
import { TemplateMaintenance } from "./template-maintenance";

interface TemplateLibraryProps {
  habitWorkspace?: HabitWorkspace;
  onCreateHabit?: (draft: HabitDraft) => Promise<HabitCreationResponse>;
  templateMaintenance?: TemplateMaintenanceActions;
  role: Role;
  templates: ActivityTemplate[];
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string;
  onLoadMore?: () => Promise<void> | void;
}

const TemplateSummary = ({
  template,
  range,
  asHeading,
}: {
  template: ActivityTemplate;
  range: string;
  asHeading: boolean;
}) => (
  <>
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      {asHeading ? (
        <h3 className="text-lg font-[650]">{template.name}</h3>
      ) : (
        <span className="text-lg font-[650]">{template.name}</span>
      )}
      <span className="text-muted-foreground text-sm">{range}</span>
    </div>
    {template.description.length > 0 && (
      <p className="text-muted-foreground mt-2 max-w-prose leading-[1.6]">
        {template.description}
      </p>
    )}
  </>
);

const useTemplateSelection = (
  templates: ActivityTemplate[],
  onCreateHabit: TemplateLibraryProps["onCreateHabit"]
) => {
  const [selection, setSelection] = useState<TemplateReference | null>(null);
  const [serverConflict, setServerConflict] = useState("");
  const conflictNotice = useRef<HTMLDivElement>(null);
  const selectedTemplate = templates.find(
    (template) =>
      template.id === selection?.templateId &&
      template.version === selection.templateVersion
  );
  const selectionChanged = selection !== null && selectedTemplate === undefined;
  const conflict =
    serverConflict ||
    (selectionChanged
      ? "This Activity Template changed or is no longer available. Choose an active template again."
      : "");

  useEffect(() => {
    if (conflict.length > 0) {
      conflictNotice.current?.focus();
    }
  }, [conflict]);

  const selectTemplate = (template: ActivityTemplate) => {
    setServerConflict("");
    setSelection((current) =>
      current?.templateId === template.id &&
      current.templateVersion === template.version
        ? null
        : { templateId: template.id, templateVersion: template.version }
    );
  };

  const submitHabit =
    onCreateHabit &&
    (async (draft: HabitDraft) => {
      const result = await onCreateHabit(draft);
      if (result.kind === "conflict") {
        setSelection((current) =>
          current?.templateId === draft.templateId &&
          current.templateVersion === draft.templateVersion
            ? null
            : current
        );
        setServerConflict(result.message);
      }
      return result;
    });
  return {
    selectedTemplate,
    conflict,
    conflictNotice,
    selectTemplate,
    submitHabit,
  };
};

export const TemplateLibrary = ({
  habitWorkspace,
  onCreateHabit,
  templateMaintenance,
  role,
  templates,
  hasMore = false,
  loadingMore = false,
  loadMoreError = "",
  onLoadMore,
}: TemplateLibraryProps) => {
  const {
    selectedTemplate,
    conflict,
    conflictNotice,
    selectTemplate,
    submitHabit,
  } = useTemplateSelection(templates, onCreateHabit);
  const [maintenanceStatus, setMaintenanceStatus] = useState<{
    message: string;
    focus: boolean;
  } | null>(null);
  const maintenanceNotice = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    if (maintenanceStatus?.focus === true) {
      maintenanceNotice.current?.focus();
    }
  }, [maintenanceStatus]);

  return (
    <section
      className="mt-12 max-w-2xl"
      aria-labelledby="template-library-heading"
    >
      <h2
        id="template-library-heading"
        className="mb-3 text-[23px] leading-[1.3] font-[650]"
      >
        {role === "participant"
          ? "Activity Template library"
          : "Published Activity Templates"}
      </h2>
      {conflict.length > 0 && (
        <Alert
          ref={conflictNotice}
          tabIndex={-1}
          variant="destructive"
          className="mb-4"
        >
          <AlertDescription>{conflict}</AlertDescription>
        </Alert>
      )}
      {templateMaintenance && (
        <output
          ref={maintenanceNotice}
          tabIndex={-1}
          className="mb-4 block text-sm empty:mb-0"
        >
          {maintenanceStatus?.message}
        </output>
      )}
      {templates.length === 0 ? (
        <p className="text-muted-foreground leading-[1.65]">
          {role === "participant"
            ? "No Activity Templates are available yet."
            : "No Activity Templates published yet."}
        </p>
      ) : (
        <ul className="divide-y border-y">
          {templates.map((template) => {
            const isSelected = template.id === selectedTemplate?.id;
            const range = formatTemplateRange(template);
            return (
              <li key={template.id} className="py-4">
                {role === "participant" ? (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      selectTemplate(template);
                    }}
                    className={cn(
                      "hover:bg-muted/50 focus-visible:ring-ring/50 w-full rounded-lg border px-4 py-4 text-left transition-colors outline-none focus-visible:ring-3",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card"
                    )}
                  >
                    <TemplateSummary
                      template={template}
                      range={range}
                      asHeading={false}
                    />
                    <p className="text-muted-foreground mt-2 text-sm">
                      {isSelected
                        ? `Selected (${range})`
                        : `Select to inspect (${template.unit})`}
                    </p>
                  </button>
                ) : (
                  <div className="py-1">
                    <TemplateSummary
                      template={template}
                      range={range}
                      asHeading
                    />
                    {templateMaintenance && (
                      <TemplateMaintenance
                        template={template}
                        actions={templateMaintenance}
                        onSaved={(message, focus) => {
                          setMaintenanceStatus({ message, focus });
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {loadMoreError.length > 0 && (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{loadMoreError}</AlertDescription>
        </Alert>
      )}
      {hasMore && onLoadMore !== undefined && (
        <div className="mt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={loadingMore}
            onClick={() => {
              void onLoadMore();
            }}
          >
            {loadingMore
              ? "Loading more Activity Templates…"
              : "Load more Activity Templates"}
          </Button>
        </div>
      )}
      {role === "participant" && selectedTemplate && (
        <p className="text-muted-foreground mt-4 text-sm leading-[1.6]">
          Selected Activity Template: {selectedTemplate.name} (
          {formatTemplateRange(selectedTemplate)}).
        </p>
      )}
      {role === "participant" && selectedTemplate && habitWorkspace && (
        <HabitCreateForm
          key={`${selectedTemplate.id}:${selectedTemplate.version}`}
          template={selectedTemplate}
          accountDate={habitWorkspace.accountDate}
          timezone={habitWorkspace.timezone}
          existingHabit={habitWorkspace.items.find(
            (item) =>
              item.template.id === selectedTemplate.id &&
              (item.archivedFrom === null ||
                item.archivedFrom > habitWorkspace.accountDate)
          )}
          onCreateHabit={submitHabit}
        />
      )}
    </section>
  );
};
