# Handoff: Returning Visitor Profiles

**Status:** Implemented locally; verified with Prisma validation/client generation, ESLint, and a production build. The change has not been pushed and the database migration has not been run on Azure.

## What changed

The kiosk now looks for returning visitor profiles while the visitor enters their name. Search requests are debounced by 500 ms, require at least two characters, and use a case-insensitive partial-name match. Up to five results are shown; the UI indicates when more matches exist so the visitor can enter more of their name.

If the search returns one profile, the kiosk selects it as the candidate. If several profiles match, the visitor chooses one. To avoid disclosing someone’s contact details to another person using the public kiosk, search results show a masked email address. The visitor must confirm the email saved on the profile before the kiosk loads the saved email, phone, company, and vehicle plate. A visitor can clear the match and continue as a new visitor.

The visitor can edit the loaded values for this visit. A separate, unchecked consent option controls whether those edits update the reusable profile. Each successful check-in creates a new `VisitRecord`; its visitor details, host, purpose, company, agreement, signature, photo, and timestamps remain visit-specific snapshots.

## Data model and migration

- `VisitorProfile` stores reusable contact details: full name, email, phone, company, vehicle plate, and timestamps.
- `VisitRecord.visitorProfileId` optionally relates a visit to a profile. The field is nullable for compatibility with old records and uses `ON DELETE SET NULL`.
- Existing visit rows are not rewritten as historical snapshots. The migration creates one profile for each normalized name + email pair, chooses the latest visit’s values for that profile, then links the matching visits.
- A different name or email is treated as a new profile. A visitor can explicitly save profile edits during a later check-in.

Migration file: `prisma/migrations/20261005120000_returning_visitors/migration.sql`.

## Code map

- `prisma/schema.prisma` — profile model and optional visit relation.
- `src/server/visitor-service.ts` — name search, masked result email, email confirmation, profile creation/update, and visit creation transaction.
- `src/app/api/visitor-profile/search/route.ts` — no-store profile search API.
- `src/app/api/visitor-profile/confirm/route.ts` — verifies profile ID + email before returning saved contact fields.
- `src/features/visitor-check-in/check-in-form.tsx` — debounced search, candidate selection, email confirmation, autofill, clear-profile action, and opt-in profile update.
- `src/features/visitor-check-in/actions.ts` — validates and submits the selected profile ID and update choice.

## Verification performed

- `npx prisma validate` — passed.
- `npx prisma generate` — passed.
- ESLint on the changed check-in and API/service files — passed.
- `npm run build` — passed. Next.js reported existing filesystem tracing warnings from `src/server/visitor-files.ts`; they did not fail the build.
- No live kiosk check-in was performed after applying the migration because the migration has not yet been deployed to the database.

## Release handoff

1. Review `git status` and commit/push the intended files. This work is still local until that is done.
2. Back up PostgreSQL before applying schema changes.
3. On the Azure VM, update the checkout and install dependencies.
4. Generate Prisma Client, build the app, then run `npx prisma migrate deploy` against the intended Azure `DATABASE_URL`.
5. Restart the PM2 process and verify `/check-in`, profile search/confirmation, and a complete test check-in.
6. Back up the private visitor image directory (`VISITOR_FILES_DIR`, or `.visitor-files` by default) along with PostgreSQL. These files are outside the database.

See [Operations Manual](operations-manual.md) for commands and checks. Never put `.env`, database passwords, SMTP passwords, session secrets, encryption keys, profile contact data, or invitation tokens in Git, screenshots, logs, or this handoff note.
