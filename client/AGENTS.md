<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Test Quality Quick Rules

Scope: `client/**`

- Match test name and assertion 1:1 (no vague container-only checks).
- Prefer role/name/aria-label queries over index selectors like `[1]`.
- Mock/spy the real runtime path (especially for swapped `localStorage`).
- Do not verify React `key` via DOM attributes; verify remount/result state.
- Keep mock data type-complete (no missing required fields such as `topLevel`, `updatedAt`).
