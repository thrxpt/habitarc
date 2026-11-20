import { useId, useState } from "react";
import type { Ref, SubmitEvent } from "react";

import { Alert, AlertDescription } from "#components/ui/alert.tsx";
import { Button } from "#components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field.tsx";
import { Input } from "#components/ui/input.tsx";

import {
  MEASUREMENT_CEILINGS,
  MEASUREMENT_UNITS,
  isMeasurementUnit,
  parseWholeNumberInput,
  validateActivityTemplateInput,
} from "../templates";
import type {
  ActivityTemplate,
  ActivityTemplateDraft,
  TemplateField,
  TemplateFieldErrors,
  TemplateMaintenanceResponse,
} from "../templates";

interface TemplateFormProps {
  template?: ActivityTemplate;
  onSave?: (
    draft: ActivityTemplateDraft
  ) => Promise<TemplateMaintenanceResponse>;
  onCancel?: () => void;
  nameInputRef?: Ref<HTMLInputElement>;
}

const hasFieldErrors = (
  error: unknown
): error is Error & { fieldErrors: TemplateFieldErrors } =>
  error instanceof Error &&
  "fieldErrors" in error &&
  typeof error.fieldErrors === "object" &&
  error.fieldErrors !== null;

const BOUND_FIELDS = [
  {
    field: "entryMinimum" as const,
    label: "Minimum",
  },
  {
    field: "entryMaximum" as const,
    label: "Maximum",
  },
] as const;

const emptyFields: Omit<
  ActivityTemplateDraft,
  "entryMinimum" | "entryMaximum"
> &
  Record<"entryMinimum" | "entryMaximum", string> = {
  name: "",
  description: "",
  unit: "minutes",
  entryMinimum: "",
  entryMaximum: "",
};

const initialFields = (template: ActivityTemplate | undefined) =>
  template === undefined
    ? emptyFields
    : {
        name: template.name,
        description: template.description,
        unit: template.unit,
        entryMinimum: template.entryMinimum.toString(),
        entryMaximum: template.entryMaximum.toString(),
      };

export const TemplateForm = ({
  template,
  onSave,
  onCancel,
  nameInputRef,
}: TemplateFormProps) => {
  const id = useId();
  const fieldId = (field: TemplateField) => `${id}-${field}`;
  const fieldErrorId = (field: TemplateField) => `${fieldId(field)}-error`;
  const unitHintId = `${id}-unit-hint`;
  const editing = template !== undefined;
  const measurementLocked = template?.measurementLocked === true;
  const [fields, setFields] = useState(() => initialFields(template));
  const { name, description, unit, entryMinimum, entryMaximum } = fields;
  const [fieldErrors, setFieldErrors] = useState<TemplateFieldErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [pending, setPending] = useState(false);

  const clearFieldError = (field: TemplateField) => {
    if (fieldErrors[field] !== undefined) {
      setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setSubmitError("");

    const validation = validateActivityTemplateInput({
      name,
      description,
      unit,
      entryMinimum: parseWholeNumberInput(entryMinimum),
      entryMaximum: parseWholeNumberInput(entryMaximum),
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      return;
    }

    if (!onSave) {
      setSubmitError(
        editing
          ? "Template editing is unavailable right now."
          : "Template creation is unavailable right now."
      );
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      const result = await onSave(validation.value);
      if (result.kind !== "saved") {
        setFieldErrors(result.fieldErrors);
        setSubmitError(result.message);
      } else if (!editing) {
        setFields(emptyFields);
      }
    } catch (error) {
      if (hasFieldErrors(error)) {
        setFieldErrors(error.fieldErrors);
      }
      setSubmitError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "We couldn’t save the Activity Template. Please try again."
      );
    }
    setPending(false);
  };

  const ceiling = MEASUREMENT_CEILINGS[unit];
  const measurementDisabled = pending || measurementLocked;
  const submitLabel = editing ? "Save changes" : "Create Activity Template";

  return (
    <form
      noValidate
      aria-label={
        editing ? `Edit ${template.name}` : "Create Activity Template"
      }
      aria-busy={pending}
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
    >
      <FieldGroup>
        <Field
          data-disabled={pending}
          data-invalid={fieldErrors.name !== undefined}
        >
          <FieldLabel htmlFor={fieldId("name")}>Name</FieldLabel>
          <Input
            id={fieldId("name")}
            ref={nameInputRef}
            name="name"
            type="text"
            required
            disabled={pending}
            value={name}
            aria-invalid={fieldErrors.name !== undefined}
            aria-describedby={
              fieldErrors.name === undefined ? undefined : fieldErrorId("name")
            }
            onChange={(event) => {
              const { value } = event.currentTarget;
              setFields((previous) => ({ ...previous, name: value }));
              clearFieldError("name");
            }}
          />
          {fieldErrors.name !== undefined && (
            <FieldError id={fieldErrorId("name")}>
              {fieldErrors.name}
            </FieldError>
          )}
        </Field>

        <Field
          data-disabled={pending}
          data-invalid={fieldErrors.description !== undefined}
        >
          <FieldLabel htmlFor={fieldId("description")}>Description</FieldLabel>
          <textarea
            id={fieldId("description")}
            name="description"
            rows={3}
            disabled={pending}
            value={description}
            aria-invalid={fieldErrors.description !== undefined}
            aria-describedby={
              fieldErrors.description === undefined
                ? undefined
                : fieldErrorId("description")
            }
            className="border-input bg-card placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 min-h-24 w-full min-w-0 rounded-lg border px-2.5 py-2 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm"
            onChange={(event) => {
              const { value } = event.currentTarget;
              setFields((previous) => ({ ...previous, description: value }));
              clearFieldError("description");
            }}
          />
          {fieldErrors.description !== undefined && (
            <FieldError id={fieldErrorId("description")}>
              {fieldErrors.description}
            </FieldError>
          )}
        </Field>

        <Field
          data-disabled={measurementDisabled}
          data-invalid={fieldErrors.unit !== undefined}
        >
          <FieldLabel htmlFor={fieldId("unit")}>Measurement Unit</FieldLabel>
          <select
            id={fieldId("unit")}
            name="unit"
            disabled={measurementDisabled}
            value={unit}
            aria-invalid={fieldErrors.unit !== undefined}
            aria-describedby={
              fieldErrors.unit === undefined
                ? unitHintId
                : `${fieldErrorId("unit")} ${unitHintId}`
            }
            className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-12 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm"
            onChange={(event) => {
              const selected = event.currentTarget.value;
              if (isMeasurementUnit(selected)) {
                setFields((previous) => ({ ...previous, unit: selected }));
                setFieldErrors((previous) => ({
                  ...previous,
                  unit: undefined,
                  entryMinimum: undefined,
                  entryMaximum: undefined,
                }));
              }
            }}
          >
            {MEASUREMENT_UNITS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <FieldDescription id={unitHintId}>
            {measurementLocked
              ? "This template is in use. Its unit and entry bounds are fixed."
              : `Whole numbers from 1 to ${ceiling.toLocaleString("en-US")} ${unit}.`}
          </FieldDescription>
          {fieldErrors.unit !== undefined && (
            <FieldError id={fieldErrorId("unit")}>
              {fieldErrors.unit}
            </FieldError>
          )}
        </Field>

        <div className="compact:grid-cols-1 grid grid-cols-2 gap-4">
          {BOUND_FIELDS.map(({ field, label }) => {
            const fieldError = fieldErrors[field];
            return (
              <Field
                key={field}
                data-disabled={measurementDisabled}
                data-invalid={fieldError !== undefined}
              >
                <FieldLabel htmlFor={fieldId(field)}>{label}</FieldLabel>
                <Input
                  id={fieldId(field)}
                  name={field}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={ceiling}
                  step={1}
                  required
                  disabled={measurementDisabled}
                  value={fields[field]}
                  aria-invalid={fieldError !== undefined}
                  aria-describedby={
                    fieldError === undefined ? undefined : fieldErrorId(field)
                  }
                  onChange={(event) => {
                    const { value } = event.currentTarget;
                    setFields((previous) => ({ ...previous, [field]: value }));
                    clearFieldError(field);
                  }}
                />
                {fieldError !== undefined && (
                  <FieldError id={fieldErrorId(field)}>{fieldError}</FieldError>
                )}
              </Field>
            );
          })}
        </div>

        {submitError.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="lg" disabled={pending} type="submit">
            {pending ? "Saving…" : submitLabel}
          </Button>
          {onCancel && (
            <Button
              size="lg"
              variant="outline"
              disabled={pending}
              type="button"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      </FieldGroup>
    </form>
  );
};
