# KnowledgeStack

## Validate once at the boundary

Check a value where it enters the process. Never check the same value again downstream.

A repeated check adds clutter and hides the real contract. A reader who finds three copies of one guard cannot tell which copy holds the contract, so nobody removes any of them. Worse, the copies drift: one rejects an empty string, the next accepts it.

Before you write a guard, name the producer of the value and the guarantee that producer already gives. Write the guard only when no producer gives that guarantee. When you find the guarantee missing, add it at the boundary, not at the call site.

### The guarantees this repository already holds

| The value | Where it is fixed | What holds downstream |
|---|---|---|
| Every process variable | `apps/api/src/config/app-config.ts:5` | `AppConfig` reads and validates each variable once during startup. A missing or malformed value stops the boot. Inject `AppConfig` and read the field. Never read `process.env` in a service. |
| The `.env` file | `apps/api/src/main.ts:1` | The one entry point of the API loads dotenv before it loads any other module. Never import `dotenv/config` a second time. `apps/api/prisma.config.ts:7` is the exception, because the Prisma CLI starts it as its own process. |
| The session cookie | `apps/api/src/auth/auth.module.ts:24` and `apps/api/src/auth/session.guard.ts:28` | `SessionGuard` runs under `APP_GUARD` on every route of every module. A route without `@Public()` never runs for a signed-out browser, so `request.session` carries a live session. |
| The active workspace | `apps/api/src/auth/session.decorator.ts:17` | `ActiveWorkspaceId` answers 403 when the person opened no workspace. A route parameter that carries this decorator is always a workspace id. |
| The request body | The request schema of that route, such as `createTurnRequestSchema` in `packages/api-contract/src/chat.ts:98` | The controller reads the body as `unknown`, calls `safeParse`, and answers 400 with the first issue. A service receives typed values and never re-parses `unknown`. |
| A database row | The Prisma schema in `apps/api/prisma/schema/` | A column the schema types non-null is never null in a read. Never guard a field the generated type already narrows. |

### When a second check is correct

Check again only when a second boundary sits between the two points.

- The model wrote the value. A tool call arrives as text the model produced, so `apps/api/src/tools/tool.registry.ts` and each `@Tool` method parse it and answer the model with a correction.
- A third party wrote the value. An OAuth response and a connector payload both leave a system this repository does not control.
- The check tests a different fact. A path that a person supplied needs containment even after the type says it is a string.
