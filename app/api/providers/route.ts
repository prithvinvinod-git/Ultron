import { NextResponse } from "next/server";

import { getProviderCatalog } from "@/ai/providers";

/** The catalogue only changes when an env var changes, so cache it hard. */
export const revalidate = 3600;

/**
 * Provider + model catalogue for the Settings tab.
 *
 * Reads nothing from the database (see `getProviderCatalog`), so opening
 * Settings costs zero Firestore reads and still works while the store is
 * quota-blocked.
 */
export function GET() {
  return NextResponse.json(
    { providers: getProviderCatalog() },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}
