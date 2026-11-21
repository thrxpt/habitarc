// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { useAccountDateRefresh } from "../src/use-account-date-refresh";

const invalidate = vi.hoisted(() =>
  vi.fn<() => Promise<void>>().mockResolvedValue()
);

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

const RefreshProbe = ({ rolloverAt }: { rolloverAt: number | null }) => {
  useAccountDateRefresh(rolloverAt);
  return null;
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  invalidate.mockClear();
});

test("useAccountDateRefresh re-evaluates on scheduled timer, window focus, and tab visibility", () => {
  vi.useFakeTimers();
  vi.spyOn(window.performance, "now").mockReturnValue(1000);

  render(<RefreshProbe rolloverAt={6000} />);

  // Before the scheduled timer fires: no invalidation yet.
  vi.advanceTimersByTime(4999);
  expect(invalidate).not.toHaveBeenCalled();

  // At the scheduled reminder/midnight instant: invalidates router.
  vi.advanceTimersByTime(1);
  expect(invalidate).toHaveBeenCalledTimes(1);

  // Returning focus to the window re-evaluates immediately.
  window.dispatchEvent(new Event("focus"));
  expect(invalidate).toHaveBeenCalledTimes(2);

  // Returning tab visibility to visible re-evaluates immediately.
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  expect(invalidate).toHaveBeenCalledTimes(3);
});
