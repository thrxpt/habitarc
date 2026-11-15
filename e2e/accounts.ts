export const E2E_ORIGIN = "http://127.0.0.1:4173";

export const E2E_ACCOUNTS = [
  { name: "Participant A", email: "a@example.test", role: "participant" },
  { name: "Participant B", email: "b@example.test", role: "participant" },
  { name: "Participant C", email: "c@example.test", role: "participant" },
  {
    name: "Program Manager",
    email: "manager@example.test",
    role: "program-manager",
  },
] as const;

export const e2ePassword = (): string => {
  const password = process.env.HABITARC_E2E_PASSWORD;
  if (password === undefined || password.length === 0) {
    throw new Error("Run browser tests through the Playwright configuration.");
  }
  return password;
};
