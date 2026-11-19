export const E2E_ORIGIN = "http://127.0.0.1:4173";
const E2E_DATABASE_PATTERN = /^e2e_[\da-f]{32}$/u;

export const E2E_ACCOUNTS = [
  { name: "Participant A", email: "a@example.test", role: "participant" },
  { name: "Participant B", email: "b@example.test", role: "participant" },
  { name: "Participant C", email: "c@example.test", role: "participant" },
  {
    name: "History Participant",
    email: "history@example.test",
    role: "participant",
  },
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

export const e2eDatabaseURL = (): URL => {
  const { TEST_DATABASE_URL: controlURL, HABITARC_E2E_DATABASE: databaseName } =
    process.env;
  if (
    controlURL === undefined ||
    controlURL.length === 0 ||
    databaseName === undefined ||
    !E2E_DATABASE_PATTERN.test(databaseName)
  ) {
    throw new Error(
      "Run browser tests through Playwright with a disposable TEST_DATABASE_URL."
    );
  }
  const url = new URL(controlURL);
  url.pathname = `/${databaseName}`;
  return url;
};
