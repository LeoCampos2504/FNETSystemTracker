# Backend + Prisma integration

How Leo's backend (`src/server/services/**`, `src/app/api/**`) is wired to
Gino's Prisma repositories (`src/server/repositories/prisma/**`), and how to
run it either way. Written after the `integration/leo-gino-prisma` merge —
see `docs/PRISMA_INTEGRATION_CHECKLIST.md` (Leo's pre-merge prep) and
`docs/PRISMA_PORT_MATRIX.md` (Gino's pre-merge self-assessment) for the
history; this document reflects the actual, verified post-merge state.

## 1. Provider selection

`src/server/container.ts` is the single composition root: it builds the one
`BackendRepositories` every service's default export binds to. Which
concrete implementation backs it is decided by `FNET_REPOSITORY_PROVIDER`
(`src/server/repository-provider.ts`):

| Value | Behavior |
|---|---|
| unset | `memory` (default) |
| `memory` | `createMemoryRepositories()` — in-memory, backed by `src/mocks/**`, no DB needed |
| `prisma` | `createPrismaRepositories()` — real PostgreSQL via `@prisma/adapter-pg` |
| anything else | throws immediately at import time (fail-fast, no silent fallback) — see `src/server/repository-provider.test.ts` |

No DI framework, no reflection — this is a plain `switch` in
`createRepositoriesForProvider()`. There is deliberately no implicit
"`DATABASE_URL` is set, so use Prisma" inference: the provider is always
explicit.

**Why `npm test` doesn't need a database:** unset defaults to `memory`, so
the whole unit suite runs unchanged with no DB. `src/server/repositories/prisma/client.ts`'s
`prisma` export is a lazy `Proxy` — constructing the real `PrismaClient`
(and its `DATABASE_URL` check) only happens on first actual use, not on
import. This means `createPrismaRepositories()` can be imported unconditionally
by the provider selector without requiring `DATABASE_URL` to be resolvable
under the memory provider.

## 2. Environment variables

See `.env.example`. Summary:

- `FNET_REPOSITORY_PROVIDER` — `memory` (default) or `prisma`.
- `DATABASE_URL` / `SHADOW_DATABASE_URL` — only read when the provider is
  `prisma` (or when running Prisma CLI commands directly, which always need
  them regardless of this app-level switch). Local dev: `npx prisma dev -n <name> -d`,
  then `npx prisma dev ls` to get the real connection strings. See
  `docs/DATABASE.md` for the full local setup flow.
- `AUTH_SECRET` — unrelated to the provider, needed either way for session
  cookies.

## 3. Architecture

```
HTTP Routes (src/app/api/**)
        |
        v
Leo's Services (src/server/services/**)
        |
        v
BackendRepositories (src/server/ports/**, 10 ports)
        |
        +---- memory  -> src/server/repositories/memory/**  -> src/mocks/**
        |
        +---- prisma  -> src/server/repositories/prisma/**  -> PrismaClient (@prisma/adapter-pg) -> PostgreSQL
```

Services and routes never import a concrete repository implementation —
only the port types from `@/server/ports`. Swapping providers changes
`src/server/container.ts`'s composition only.

## 4. Running the backend against Prisma locally

1. `npx prisma dev -n fnet -d` (or reuse an existing named instance —
   `npx prisma dev ls` lists running ones).
2. `npx prisma dev ls` prints the real `DATABASE_URL`/`SHADOW_DATABASE_URL`
   TCP connection strings (decode the `prisma+postgres://` API key, or copy
   the `TCP:` line directly) — put them in `.env`.
3. `npx prisma migrate deploy` (applies existing migrations; do not create
   a new one unless the schema genuinely changed).
4. `npm run db:seed`.
5. Set `FNET_REPOSITORY_PROVIDER=prisma` in `.env`.
6. `npm run dev` — the backend now reads/writes real PostgreSQL.

## 5. Tests

- `npm test` (`vitest.config.mts`) — memory provider, no DB. **364 tests
  passing** as of this integration (Leo's pre-merge baseline was 313; the
  rest are Gino's own default-suite tests plus the 7 new
  `repository-provider.test.ts` cases added in this block — the two
  branches' suites were not simply summed, this is the real measured
  total after the merge).
- `npm run test:db` (`vitest.integration.config.mts`, `prisma/tests/**`) —
  real PostgreSQL, run via `npm run db:dev` / `prisma dev`. **91 tests
  passing** (Gino's pre-merge baseline was 84; +7 new tests added in this
  block for the adapter methods Leo's ports needed that Gino's original
  adapters didn't have yet — 3 for `guard.create`/`update`, 1 for
  `notification.create`, 3 for `quote.findById`/`from`-`to` filtering).
- `src/server/repository-provider.test.ts` — provider selection (memory /
  prisma / invalid), plus the typed `BackendRepositories` compatibility
  proof (see §7). Runs under `npm test`, no real DB touched — building the
  Prisma repository object doesn't call any method on it.

`docs/DATABASE.md` documents older counts ("56 tests puros" / "~76 de
integración") from before this merge; the numbers above are the current,
post-merge, actually-measured totals.

## 6. Port ↔ Prisma adapter matrix (post-merge, verified)

All 10 ports in `src/server/ports/**` (aggregated as `BackendRepositories`,
`src/server/ports/backend-repositories.ts`), checked against the adapters in
`src/server/repositories/prisma/**` as they exist **after** the merge — not
against Gino's pre-merge self-assessment in `docs/PRISMA_PORT_MATRIX.md`,
which predates several methods Leo added to the ports after Gino branched.

| # | Port | Methods (current) | Prisma adapter | Status |
|---|---|---|---|---|
| 1 | `UserRepository` | `findById`, `findByEmail` | `userPrismaRepository` | PASS (unchanged) |
| 2 | `TechnicianRepository` | `findById`, `listByZone` | `technicianPrismaRepository` | PASS (unchanged) |
| 3 | `TaskRepository` | `findById`, `listByDate`, `listPending`, `updateAssignments`, `updateSchedule`, `updateStatus` | `taskPrismaRepository` | PASS (unchanged) |
| 4 | `GuardRepository` | `findById`, `list`, `getPerformance`, `updateTechnicians`, **`create`**, **`update`** | `guardPrismaRepository` | **FIXED** — `create`/`update` were missing (TS2739 at `npm run build`), added |
| 5 | `VehicleRepository` | `findById`, `findByTechnician` | `vehiclePrismaRepository` | PASS (unchanged) |
| 6 | `ZoneRepository` | `findById`, `listByCoordinator`, `listSites` | `zonePrismaRepository` | PASS (unchanged) |
| 7 | `QuoteRepository` | `list`, **`findById`** | `quotePrismaRepository` | **FIXED** — `findById` was missing (TS2741), added (`T \| null`, never throws); `list`'s filter also extended to cover `projectId`/`from`/`to` (previously only `zoneId`/`status`/`coordinatorId`), matching the full `QuoteListFilter` shape the memory adapter and `GET /api/quotes` already supported |
| 8 | `NotificationRepository` | `listByUser`, **`create`** | `notificationPrismaRepository` | **FIXED** — `create` was missing (TS2741), added |
| 9 | `AuditRepository` | `append`, `listByEntity` | `auditPrismaRepository` | PASS (unchanged) |
| 10 | `AuthCredentialsRepository` | `getPasswordHash` | `authCredentialsPrismaRepository` | PASS (unchanged) |

### Fixes in detail

- **`guardPrismaRepository.create(input)`** — `prisma.guard.create` with a
  nested `technicians: { create: [...] }` write (one round trip, atomic by
  virtue of being a single nested Prisma write). No overlap/business-rule
  validation here — that's `GuardService`'s job before it ever calls the
  repository.
- **`guardPrismaRepository.update(guardId, patch)`** — plain field patch via
  `prisma.guard.update`; when `patch.technicianIds` is present, the crew is
  replaced via the same delete-then-create `$transaction` pattern already
  used by `updateTechnicians`. No business logic duplicated.
- **`notificationPrismaRepository.create(entry)`** — persists exactly the
  fields it's given (`userId`, `type`, `title`, `message`, `entityType`,
  `entityId`, `readAt`) via `prisma.notification.create`. Does not decide
  recipients or apply any deduplication — that decision already happened in
  `NotificationService` before the repository is called.
- **`quotePrismaRepository.findById(id)`** — `prisma.quote.findUnique`,
  returns `null` if not found (never `findUniqueOrThrow`).

None of the fixes touch `src/server/services/**` or `src/app/api/**` — only
the Prisma adapter files themselves changed, per the rule that an adapter
gap gets fixed on the Prisma side, never by weakening a port or a service.

## 7. `BackendRepositories` compatibility

`createPrismaRepositories()` (`src/server/repositories/prisma/factory.ts`)
returns its own `PrismaRepositories` type (kept separate so that file has no
dependency on `src/server/ports/backend-repositories.ts`). The two shapes
are proven identical with a plain typed assignment, no cast:

```ts
// src/server/repository-provider.ts
case "prisma": {
  const prismaRepositories: BackendRepositories = createPrismaRepositories();
  return prismaRepositories;
}
```

If any `*.prisma-repository.ts` ever stops structurally satisfying its port,
this assignment fails to compile — `npm run build` and
`src/server/repository-provider.test.ts` both exercise it. No
`as unknown as BackendRepositories`, no `any`, anywhere in this path.

## 8. Real HTTP smoke evidence

Recorded in `../FNET_REPORT_LEO_GINO_PRISMA_INTEGRATION.md` (outside the
repo — human-reviewed artifact for this integration block, not committed).
Summary: real login (valid/wrong password/nonexistent/inactive), `/me`,
logout, all task/guard/technician/vehicle/zone/quote/notification reads,
task assignment/schedule/status mutations, guard create/update/assignments
mutations, and KPI endpoints were all exercised against a real local
PostgreSQL (`prisma dev`) with `FNET_REPOSITORY_PROVIDER=prisma` — including
verifying `AuditLog` and `Notification` rows actually landed in Postgres for
representative mutations, and that a same-date reschedule (no-op) does not
create a duplicate notification while still recording an audit entry.

## 9. Known `prisma dev` limitation

The local embedded `prisma dev` server occasionally drops a connection
("Connection terminated unexpectedly" / "Server has closed the connection")
under sustained use — observed during this integration both on a second
consecutive `npm run test:db` run and once during ad hoc HTTP smoke testing
against `/api/kpis/ranking`. In both cases a retry (respectively: restarting
the named `prisma dev` server, or simply re-issuing the HTTP request)
succeeded immediately, and the route's existing try/catch returned a
generic 500 without leaking any stack trace or connection string to the
client either time. This is the same limitation already documented in
`docs/DATABASE.md`; a real (non-`prisma dev`) PostgreSQL instance does not
exhibit it. Restart via `npx prisma dev stop <name>` then
`npx prisma dev -n <name> -d` if it recurs; data on a named instance
persists across a restart.

## 10. Transaction / cross-repository consistency debt (evaluated, not resolved)

Unchanged from `docs/PRISMA_INTEGRATION_CHECKLIST.md` §6 and
`docs/PRISMA_PORT_MATRIX.md`'s transaction section — still accurate after
integration and real Prisma testing:

- Within one repository, related writes are atomic (`prisma.$transaction`
  in `TaskRepository.updateAssignments`/`updateStatus`,
  `GuardRepository.updateTechnicians`/`update`, and the new
  `GuardRepository.create`'s nested write).
- **Across** repositories, a business mutation + its `AuditLog.append` +
  its `Notification.create` remain 3 independent sequential calls with no
  shared transaction — confirmed by reading the actual call sites in
  `task.service.ts`/`guard.service.ts` (unchanged by this integration) and
  by observing during the HTTP smoke that each of those 3 writes really is
  a separate round trip to Postgres.
- **Reproducible today?** Not demonstrated in this block — provoking it
  would require injecting a failure between two of the three calls (e.g. by
  killing the DB connection mid-request), which is a deliberate fault
  injection exercise, not something this integration's scope covers.
- **Resolved in this block?** No — out of scope by explicit instruction
  (no `UnitOfWork`, no transaction-context change to any port, no service
  restructuring here).
- **Remaining debt:** if `AuditLog.append` or `Notification.create` throws
  after the primary mutation already committed, the primary change persists
  without its audit trail or notification. All 3 calls happen inside the
  same `withErrorHandling` HTTP handler, so the request as a whole does
  report an error to the caller in that case — but the already-committed
  primary mutation is not rolled back. A real fix would need either a
  shared Prisma transaction spanning all 3 repositories (requires a
  transaction-context concept added to the ports, a real port/contract
  change) or an outbox-style pattern. Left as a documented P1 for a future
  block, consistent with the explicit instruction not to build it now.
