import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

// Server-rendered data starts from the browser's navigation time origin.
export const getNavigationElapsedTime = () =>
  typeof window === "undefined" ? 0 : window.performance.now();

export const useAccountDateRefresh = (rolloverAt: number | null) => {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      void router.invalidate();
    };
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") {
        void router.invalidate();
      }
    };
    if (rolloverAt !== null) {
      const remaining = Math.max(0, rolloverAt - getNavigationElapsedTime());
      timer = window.setTimeout(refresh, remaining);
      window.addEventListener("focus", refresh);
      document.addEventListener("visibilitychange", refreshOnVisible);
    }
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [rolloverAt, router]);
};
