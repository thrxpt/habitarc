import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";

import type {
  ActivityTemplate,
  TemplateMaintenanceActions,
} from "../templates";
import { TemplateForm } from "./template-form";

type TemplateAction = "edit" | "archive";

export const TemplateMaintenance = ({
  template,
  actions,
  onSaved,
}: {
  template: ActivityTemplate;
  actions: TemplateMaintenanceActions;
  onSaved: (message: string, focus: boolean) => void;
}) => {
  const editTrigger = useRef<HTMLButtonElement>(null);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const archiveCancel = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<TemplateAction | null>(null);
  const [selection, setSelection] = useState<{
    action: TemplateAction;
    template: ActivityTemplate;
  } | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const action = selection?.action;

  useEffect(() => {
    if (action === "edit") {
      nameInput.current?.focus();
    } else if (action === "archive") {
      archiveCancel.current?.focus();
    } else if (returnFocus.current !== null) {
      const trigger =
        returnFocus.current === "edit" ? editTrigger : archiveTrigger;
      trigger.current?.focus();
      returnFocus.current = null;
    }
  }, [action]);

  const cancel = () => {
    returnFocus.current = action ?? null;
    setSelection(null);
    setArchiveError("");
  };

  if (selection === null) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          ref={editTrigger}
          aria-label={`Edit ${template.name}`}
          variant="outline"
          type="button"
          onClick={() => {
            setSelection({ action: "edit", template });
          }}
        >
          Edit
        </Button>
        <Button
          ref={archiveTrigger}
          aria-label={`Archive ${template.name}`}
          variant="ghost"
          type="button"
          onClick={() => {
            setSelection({ action: "archive", template });
          }}
        >
          Archive
        </Button>
      </div>
    );
  }

  const selected = selection.template;
  const reference = {
    templateId: selected.id,
    templateVersion: selected.version,
  };
  if (selection.action === "edit") {
    return (
      <div className="mt-4">
        <TemplateForm
          template={selected}
          nameInputRef={nameInput}
          onCancel={cancel}
          onSave={async (draft) => {
            const result = await actions.update({ ...draft, ...reference });
            if (result.kind === "saved") {
              cancel();
              onSaved(`${result.template.name} was updated.`, false);
            }
            return result;
          }}
        />
      </div>
    );
  }

  const archive = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (archivePending) {
      return;
    }
    setArchiveError("");
    setArchivePending(true);
    try {
      const result = await actions.archive(reference);
      if (result.kind === "saved") {
        onSaved(`${result.template.name} was archived.`, true);
      } else {
        setArchiveError(result.message);
      }
    } catch {
      setArchiveError(
        "We couldn’t archive the Activity Template. Please try again."
      );
    }
    setArchivePending(false);
  };

  return (
    <form
      className="mt-4 flex flex-col gap-3"
      aria-label={`Archive ${selected.name}`}
      aria-busy={archivePending}
      onSubmit={(event) => {
        void archive(event);
      }}
    >
      <p className="text-muted-foreground text-sm">
        Archiving is permanent. Participants can keep logging existing Habits.
        This template will be removed from the library.
      </p>
      {archiveError.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{archiveError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" disabled={archivePending}>
          {archivePending ? "Archiving…" : "Confirm archive"}
        </Button>
        <Button
          type="button"
          ref={archiveCancel}
          variant="outline"
          disabled={archivePending}
          onClick={cancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};
