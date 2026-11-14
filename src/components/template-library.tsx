import { cn } from "cn";
import { useState } from "react";

import type { Role } from "../identity";
import { formatTemplateRange } from "../templates";
import type { ActivityTemplate } from "../templates";

interface TemplateLibraryProps {
  role: Role;
  templates: ActivityTemplate[];
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

export const TemplateLibrary = ({ role, templates }: TemplateLibraryProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedTemplate = templates.find(
    (template) => template.id === selectedId
  );

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
      {templates.length === 0 ? (
        <p className="text-muted-foreground leading-[1.65]">
          {role === "participant"
            ? "No Activity Templates are available yet."
            : "No Activity Templates published yet."}
        </p>
      ) : (
        <ul className="divide-y border-y">
          {templates.map((template) => {
            const isSelected = template.id === selectedId;
            const range = formatTemplateRange(template);
            return (
              <li key={template.id} className="py-4">
                {role === "participant" ? (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedId((previous) =>
                        previous === template.id ? null : template.id
                      );
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
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {role === "participant" && selectedTemplate && (
        <p className="text-muted-foreground mt-4 text-sm leading-[1.6]">
          Selected Activity Template: {selectedTemplate.name} (
          {formatTemplateRange(selectedTemplate)}).
        </p>
      )}
    </section>
  );
};
