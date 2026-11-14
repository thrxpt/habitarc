// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { AccountScreen } from "../src/components/account-screen";
import type { Identity } from "../src/identity";

const { fetchMock } = vi.hoisted(() => {
  const network = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", network);
  return { fetchMock: network };
});

const participant: Identity = {
  id: "participant-a",
  name: "Participant A",
  email: "a@example.test",
  role: "participant",
  timezone: "Asia/Bangkok",
};
const noChange = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

test("invalid sign in gives generic feedback and clears the password for a retry", async () => {
  fetchMock.mockResolvedValue(
    Response.json(
      {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      },
      { status: 401 }
    )
  );
  render(<AccountScreen identity={null} onSessionChanged={noChange} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "a@example.test");
  await user.type(screen.getByLabelText("Password"), "invalid-test-input");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Email or password is incorrect"
  );
  expect(screen.getByLabelText("Password")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("a valid sign in refreshes the server-validated workspace", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ user: participant, token: "test-token" })
  );
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const { rerender } = render(
    <AccountScreen identity={null} onSessionChanged={changed} />
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), participant.email);
  await user.type(screen.getByLabelText("Password"), "synthetic-test-input");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(changed).toHaveBeenCalledOnce();
  rerender(<AccountScreen identity={participant} onSessionChanged={changed} />);
  expect(screen.getByRole("heading", { name: "Your workspace" })).toBeVisible();
  expect(screen.getByText(participant.email)).toBeVisible();
  expect(screen.getByText("Participant", { exact: true })).toBeVisible();
  expect(screen.getByText("Asia/Bangkok")).toBeVisible();
});

test("a Program Manager sees their own identity and can sign out", async () => {
  fetchMock.mockResolvedValue(Response.json({ success: true }));
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const manager: Identity = {
    ...participant,
    id: "manager",
    name: "Manager",
    email: "m@example.test",
    role: "program-manager",
  };
  const { rerender } = render(
    <AccountScreen identity={manager} onSessionChanged={changed} />
  );
  expect(
    screen.getByRole("heading", { name: "Activity Templates" })
  ).toBeVisible();
  expect(screen.getByText("Program Manager", { exact: true })).toBeVisible();
  expect(screen.queryByText(participant.email)).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Sign out" }));
  expect(changed).toHaveBeenCalledOnce();
  rerender(<AccountScreen identity={null} onSessionChanged={changed} />);
  expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("throttled sign in explains how to retry", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ message: "Too many requests" }, { status: 429 })
  );
  render(<AccountScreen identity={null} onSessionChanged={noChange} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), participant.email);
  await user.type(screen.getByLabelText("Password"), "synthetic-test-input");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Too many sign-in attempts. Wait a minute"
  );
});
