# AI Integration Handoff

**Project:** Visitor Management, Kiosk and Digital Check-In Platform  
**Branch:** `feature/ai-integration-roadmap`  
**Handoff date:** 2026-10-08  
**Audience:** Project owner, next developer, deployment operator

## Handoff status

The AI integration implementation is present in the working tree and has passed local code and build checks. It is ready for review and deployment preparation.

At handoff time, the implementation changes are **not committed, pushed, or deployed**. The Prisma migration has **not** been applied to either production database. Provider credentials, Microsoft Entra/Copilot configuration, OAuth sign-in, and SMTP report delivery still need deployment-specific setup and end-to-end testing.

This handoff records the current state; it does not claim that external AI services are already connected or that the remaining integration work is complete.

## What is implemented

### Configurable AI provider

- An administrator can configure either OpenAI or Azure OpenAI from the back-office AI configuration page.
- Provider endpoint, model/deployment, and key are selected in configuration rather than hard-coded in the feature.
- Keys are encrypted using the application's AES-256-GCM settings encryption.
- The administrator must test the current provider configuration before enabling it.
- The system enforces per-user request limits and a monthly token cap.
- One provider is active at a time. There is no automatic provider failover.

### Back-office assistant

- The read-only assistant is available to administrators and receptionists.
- Supported questions are translated into an allowlisted query intent; the server executes the database query.
- It supports date-range summaries, today's arrivals, visits without checkout, and filters by host or configured visit purpose.
- It can display up to 50 matching visitor rows in the portal. Portal links and details remain subject to the signed-in user's existing permissions.
- Visitor records, contact details, photos, signatures, and agreement text are not sent to the language model.
- Questions containing detected sensitive visitor identifiers are rejected.
- Small groups are excluded from AI summary inputs. The assistant does not make security, employment, access, or other consequential decisions.
- Raw user prompts and model responses are not stored in the application audit log.

### Microsoft Copilot Studio API and identity linking

- A server-side read-only API is implemented at `POST /api/copilot/query`.
- Supported query types are bounded date-range `summary` and `not_checked_out`, optionally filtered by host or purpose IDs.
- The endpoint returns aggregate information only; it does not return visitor rows.
- Entra access tokens are checked for signature, issuer, audience, tenant, delegated scope, connector identity, linked object identity, account status, and local role.
- Existing staff can link a Microsoft identity through a sign-in/PKCE flow. A matching local account is required, and an administrator must approve the link.
- Identity linking does not create local accounts or elevate roles.
- Copilot Studio agent creation, connector registration, Entra app registrations, and tenant configuration are **customer-operated setup**. The application does not create these automatically.

### Scheduled administrator reports

- Daily or weekly reports cover the previous completed period in the configured company time zone.
- Reports contain deterministic database counts even when AI is disabled, capped, unavailable, or returns an error.
- A test preview goes only to the current administrator and does not enable scheduled delivery.
- The worker starts through Next.js instrumentation and requires a persistent Node.js process, such as the existing PM2 service.
- After downtime, the worker sends the most recent completed period once; it does not backfill every missed period.
- SMTP delivery failures are recorded and are not automatically retried for the same period.

### Audit and privacy controls

- AI audit entries are metadata-only, with a 90-day cleanup policy.
- Copilot requests do not persist prompt or response text.
- Aggregate groups below five are suppressed.
- AI is advisory and read-only. Suspicious-activity scoring or automated action is not part of this release.

## Important feature boundary

The following remains a **future research objective**, not an implemented capability:

- Automated suspicious or unusual visitor activity detection, risk scoring, or security alerts.

The current AI assistant reports and filters records using approved query types. It does not classify visitors as suspicious, recommend denial of entry, or trigger a response. Any later anomaly-detection work should begin with synthetic or de-identified data and receive privacy/security and human-review safeguards before production use.

## Key files

| Area | Files |
|---|---|
| Database schema and migration | `prisma/schema.prisma`; `prisma/migrations/20261008120000_ai_integration/migration.sql` |
| Provider configuration and calls | `src/server/ai-provider.ts` |
| Assistant query planning/execution | `src/server/ai-query.ts`; `src/app/api/ai/query/route.ts` |
| Assistant UI | `src/components/ai-assistant.tsx`; `src/app/back-office/(portal)/assistant/page.tsx` |
| AI settings UI/actions | `src/app/back-office/(portal)/settings/ai/page.tsx` and `actions.ts`; existing settings navigation and admin shell were updated |
| Copilot aggregate API | `src/app/api/copilot/query/route.ts` |
| Entra linking flow | `src/app/api/copilot/entra/callback/route.ts`; `src/app/back-office/(portal)/account/copilot-link/page.tsx` and `actions.ts` |
| Scheduled reports | `src/server/ai-reports.ts`; `src/instrumentation.ts` |
| Operations and setup guide | `docs/ai-integration-operations.md` |
| This handoff | `docs/handoff-ai-integration.md` |

## Local verification completed

The following checks passed on the implementation branch:

- `npx prisma validate`
- `npm run db:generate`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check` reported no whitespace errors.

The production build emitted five existing Turbopack filesystem-tracing warnings associated with `src/server/visitor-files.ts`; the build completed successfully. No new build error was observed.

These are local checks. They do not replace a deployed migration test or external provider, SMTP, Entra, and Copilot connector tests.

## Working tree and source control

At handoff, the branch is `feature/ai-integration-roadmap`. The AI work is uncommitted. Existing unrelated working-tree edits must be preserved, including edits to `GLOSSARY.md`, `README.md`, `docs/user-manual.md`, and the `docs/SRED/` directory. The new AI operations guide and AI implementation files are also untracked/modified as expected.

Before committing:

1. Review `git status --short` and inspect the complete diff.
2. Keep unrelated documentation/SR&ED edits in or out of the AI commit intentionally; do not discard them.
3. Run the verification checks above again if code changes during review.
4. Commit and push only after review and only when authorized by the project owner.

## Production rollout checklist

1. **Back up the target database.** Confirm the deployment is pointed at the correct client/environment database.
2. **Review environment configuration.** Use HTTPS and set `APP_URL` to the canonical public origin. Keep `SETTINGS_ENCRYPTION_KEY` stable and backed up; changing or losing it can make saved SMTP and AI credentials unreadable.
3. **Review and deploy the code** through the normal repository release process.
4. **Apply the Prisma migration before running the new code against the database.** On the server, follow the operations guide's sequence:
   ```bash
   npm ci
   npm run db:generate
   npx prisma migrate deploy
   npm run build
   pm2 restart visitor-system --update-env
   ```
5. **Confirm process health and logs.** Keep the Node/PM2 service running so the scheduled-report worker can operate.
6. **Configure the AI provider in the UI.** Enter credentials, test the current configuration, review limits, then enable it. Do not put provider keys in source control or this handoff.
7. **If using Copilot Studio**, configure the tenant's Entra API and client applications, the `visitor.read` delegated scope, exact callback URL `APP_URL + /api/copilot/entra/callback`, connector, staff identity links, and administrator approvals. Run a bounded aggregate-only smoke test.
8. **If using scheduled reports**, verify SMTP, configure cadence/time/active administrator recipients, send and review a test preview, then enable the schedule.
9. **Verify role boundaries and privacy behavior** with administrator, receptionist, and regular staff accounts before broad enablement.

See [AI integration operations guide](ai-integration-operations.md) for the full configuration procedure, request examples, limits, and failure behavior.

## Remaining end-to-end tests

These tests require the target deployment and its credentials, so they were not completed locally:

- OpenAI or Azure OpenAI connection test, enablement, request-limit behavior, and monthly cap handling.
- Copilot Studio custom connector authentication against the deployed API.
- Entra staff identity verification and administrator approval using the real tenant.
- SMTP report preview, scheduled delivery, and failure visibility.
- Migration and process restart on the target server, followed by a kiosk/admin smoke test.

## Security and operations reminders

- Do not paste API keys, client secrets, access tokens, or database credentials into Git, issue reports, or handoff documents.
- Use a dedicated least-privilege Entra configuration and review connector access periodically.
- Keep provider and Copilot logs/retention settings under review in their respective services; their policies are separate from this application's audit controls.
- If a credential is exposed, disable the relevant integration, rotate the secret at its source, save and test the replacement, and review service logs.
- Confirm report recipients before enabling a schedule, and check recorded delivery status before manually resending a failed report to avoid duplicates.
