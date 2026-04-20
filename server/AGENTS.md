## Server Test Quality Quick Rules

Scope: `server/**`

- Match test name and assertion 1:1; avoid vague existence-only assertions.
- Mock DB/Redis/external APIs in unit tests; never call real network or infra in `it` blocks.
- Verify behavior, status, and response shape explicitly in API/E2E tests.
- Spy/mock the actual runtime call path used by the code under test.
- Keep mock data type-complete and restore all spies/mocks after each test.
