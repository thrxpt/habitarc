import { useState } from "react";
import type { SubmitEvent } from "react";

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
  MeasurementUnit,
  TemplateField,
  TemplateFieldErrors,
} from "../templates";

interface TemplateCreateFormProps {
  onCreateTemplate?: (
    draft: ActivityTemplateDraft
  ) => Promise<ActivityTemplate>;
}

const fieldErrorId = (field: TemplateField) => `template-${field}-error`;

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
    id: "template-entry-minimum",
    label: "Minimum",
  },
  {
    field: "entryMaximum" as const,
    id: "template-entry-maximum",
    label: "Maximum",
  },
] as const;

export const TemplateCreateForm = ({
  onCreateTemplate,
}: TemplateCreateFormProps) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unit, setUnit] = useState<MeasurementUnit>("minutes");
  const [entryMinimum, setEntryMinimum] = useState("");
  const [entryMaximum, setEntryMaximum] = useState("");
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

    if (!onCreateTemplate) {
      setSubmitError("Template creation is unavailable right now.");
      return;
    }

    setFieldErrors({});
    setPending(true);
    try {
      await onCreateTemplate(validation.value);
      setName("");
      setDescription("");
      setUnit("minutes");
      setEntryMinimum("");
      setEntryMaximum("");
    } catch (error) {
      if (hasFieldErrors(error)) {
        setFieldErrors(error.fieldErrors);
      }
      setSubmitError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : "We couldn’t save the Activity Template. Please try again."
      );
    } finally {
      setPending(false);
    }
  };

  const ceiling = MEASUREMENT_CEILINGS[unit];

  return (
    <section
      className="border-primary mt-12 max-w-2xl border-t-3 pt-7"
      aria-labelledby="create-template-heading"
    >
      <h2
        id="create-template-heading"
        className="mb-3 text-[23px] leading-[1.3] font-[650]"
      >
        Create Activity Template
      </h2>
      <p className="text-muted-foreground mb-6 max-w-prose leading-[1.65]">
        Define a shared activity, its Measurement Unit, and valid whole-number
        entry bounds.
      </p>
      <form
        noValidate
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
            <FieldLabel htmlFor="template-name">Name</FieldLabel>
            <Input
              id="template-name"
              name="name"
              type="text"
              required
              disabled={pending}
              value={name}
              aria-invalid={fieldErrors.name !== undefined}
              aria-describedby={
                fieldErrors.name === undefined
                  ? undefined
                  : fieldErrorId("name")
              }
              onChange={(event) => {
                setName(event.currentTarget.value);
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
            <FieldLabel htmlFor="template-description">Description</FieldLabel>
            <textarea
              id="template-description"
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
                setDescription(event.currentTarget.value);
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
            data-disabled={pending}
            data-invalid={fieldErrors.unit !== undefined}
          >
            <FieldLabel htmlFor="template-unit">Measurement Unit</FieldLabel>
            <select
              id="template-unit"
              name="unit"
              disabled={pending}
              value={unit}
              aria-invalid={fieldErrors.unit !== undefined}
              aria-describedby={
                fieldErrors.unit === undefined
                  ? "template-unit-hint"
                  : `${fieldErrorId("unit")} template-unit-hint`
              }
              className="border-input bg-card focus-visible:border-ring focus-visible:ring-ring/50 disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 h-12 w-full min-w-0 rounded-lg border px-2.5 py-1 text-base transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm"
              onChange={(event) => {
                const selected = event.currentTarget.value;
                if (isMeasurementUnit(selected)) {
                  setUnit(selected);
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
            <FieldDescription id="template-unit-hint">
              Whole numbers from 1 to {ceiling.toLocaleString("en-US")} {unit}.
            </FieldDescription>
            {fieldErrors.unit !== undefined && (
              <FieldError id={fieldErrorId("unit")}>
                {fieldErrors.unit}
              </FieldError>
            )}
          </Field>

          <div className="compact:grid-cols-1 grid grid-cols-2 gap-4">
            {BOUND_FIELDS.map(({ field, id, label }) => {
              const value =
                field === "entryMinimum" ? entryMinimum : entryMaximum;
              const setValue =
                field === "entryMinimum" ? setEntryMinimum : setEntryMaximum;
              const fieldError = fieldErrors[field];
              return (
                <Field
                  key={field}
                  data-disabled={pending}
                  data-invalid={fieldError !== undefined}
                >
                  <FieldLabel htmlFor={id}>{label}</FieldLabel>
                  <Input
                    id={id}
                    name={field}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={ceiling}
                    step={1}
                    required
                    disabled={pending}
                    value={value}
                    aria-invalid={fieldError !== undefined}
                    aria-describedby={
                      fieldError === undefined
                        ? undefined
                        : fieldErrorId(field)
                    }
                    onChange={(event) => {
                      setValue(event.currentTarget.value);
                      clearFieldError(field);
                    }}
                  />
                  {fieldError !== undefined && (
                    <FieldError id={fieldErrorId(field)}>
                      {fieldError}
                    </FieldError>
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

          <div>
            <Button size="lg" disabled={pending} type="submit">
              {pending ? "Creating…" : "Create Activity Template"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </section>
  );
};
