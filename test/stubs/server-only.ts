/**
 * Stand-in for the real `server-only` package inside tests.
 *
 * The real module throws on import unless it lands in a React Server Component
 * graph. Vitest has no RSC graph, so tests alias `server-only` here instead.
 * Having a file (rather than an empty string) keeps the alias debuggable.
 */
export {};
