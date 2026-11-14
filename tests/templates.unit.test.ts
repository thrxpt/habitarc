import { expect, test } from "vite-plus/test";

import { validateActivityTemplateInput } from "../src/templates";

test("accepts valid minutes and counts Activity Template bounds including ceilings", () => {
  expect(
    validateActivityTemplateInput({
      name: "  Focused Study  ",
      description: "  Deep coursework blocks  ",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 45,
    })
  ).toEqual({
    ok: true,
    value: {
      name: "Focused Study",
      description: "Deep coursework blocks",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 45,
    },
  });

  expect(
    validateActivityTemplateInput({
      name: "Full-day Study",
      description: "",
      unit: "minutes",
      entryMinimum: 1,
      entryMaximum: 1440,
    })
  ).toMatchObject({ ok: true });

  expect(
    validateActivityTemplateInput({
      name: "Flashcards",
      description: "Active recall cards",
      unit: "counts",
      entryMinimum: 1,
      entryMaximum: 1_000_000,
    })
  ).toMatchObject({ ok: true });
});

test("rejects unsupported units, non-integer bounds, zero/negative bounds, inverted ranges, and ceiling overflows", () => {
  const invalidInputs = [
    {
      name: "Reading",
      description: "",
      unit: "hours",
      entryMinimum: 1,
      entryMaximum: 2,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: 0,
      entryMaximum: 30,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: -5,
      entryMaximum: 30,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: 5.5,
      entryMaximum: 30,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 30.25,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: 45,
      entryMaximum: 5,
    },
    {
      name: "Reading",
      description: "",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 1441,
    },
    {
      name: "Flashcards",
      description: "",
      unit: "counts",
      entryMinimum: 1,
      entryMaximum: 1_000_001,
    },
    {
      name: "   ",
      description: "Blank name",
      unit: "minutes",
      entryMinimum: 5,
      entryMaximum: 45,
    },
  ];

  for (const input of invalidInputs) {
    const result = validateActivityTemplateInput(input);
    expect(result.ok).toBe(false);
  }
});
