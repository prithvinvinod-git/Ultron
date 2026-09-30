"use client";

import * as React from "react";

/**
 * True once we are rendering in the browser, false during SSR.
 *
 * Backed by `useSyncExternalStore` rather than a `useState` + `useEffect` pair:
 * the snapshot differs between server and client, so React hydrates with `false`
 * and re-renders with `true` without a cascading render or a lint violation.
 */
export function useIsClient(): boolean {
  return React.useSyncExternalStore(
    // The value never changes after the first client render, so there is
    // nothing to subscribe to.
    () => () => {},
    () => true,
    () => false,
  );
}
