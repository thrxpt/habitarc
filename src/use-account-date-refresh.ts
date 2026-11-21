import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

// Server-rendered data starts from the browser's navigation time origin.
export const getNavigationElapsedTime = () =>
  typeof window === "undefined" ? 0 : window.performance.now();

export const useAccountDateRefresh = (rolloverAt: number | null) => {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    if (rolloverAt !== null) {
      const remaining = Math.max(0, rolloverAt - getNavigationElapsedTime());
      timer = window.setTimeout(() => {
        void router.invalidate();
      }, remaining);
    }
    return () => {
      window.clearTimeout(timer);
    };
  }, [rolloverAt, router]);
};
