# Visitor System

Single-company visitor registration app. The Next.js app and project documentation live together in this folder. Business rules and external services are kept outside the page components to preserve separation of concerns.

## Feature summary

- Public tablet and mobile visitor check-in, with visitor-profile reuse, host and purpose selection, agreement consent, digital signature, and photo capture.
- Separate visit records for each arrival, with optional check-out and searchable/filterable visit history.
- Role-based staff portal: Employees see visits hosted by them; Receptionists and Administrators can review all visitor records.
- Administrator tools for company settings, departments, visit purposes, agreement text, SMTP, and staff invitations, access management, and promotion to Administrator.
- When SMTP is configured, the system attempts to send visitor check-in confirmations and host arrival notifications.

See the [User Manual](docs/user-manual.md) for the separate visitor self check-in flow, role menus, and step-by-step instructions.

## Stack

- Next.js App Router and TypeScript
- PostgreSQL
- Prisma ORM 7 with `pg` and `@prisma/adapter-pg`

## Local development

1. Install Node.js 20.9 or later and npm.
2. Copy `.env.example` to `.env` and replace `REPLACE_ME` with the `visitor_app` database password. Keep `.env` private.
3. Open an SSH tunnel to the VM in a separate terminal:

   ```powershell
   ssh -L 5432:127.0.0.1:5432 azure-visitor
   ```

4. Generate Prisma Client and create the initial database migration:

   ```powershell
   npm run db:generate
   npm run db:migrate -- --name init
   ```

5. Start the app:

   ```powershell
npm run dev
```

6. Create the first Administrator from an interactive terminal. The password is entered without being echoed, and this command refuses to add a second initial Administrator:

   ```powershell
   npm run admin:create
   ```

   The first `npm run dev`, `npm run build`, or `npm run start` creates a private `SESSION_SECRET` in `.env` if one is not already present. Keep `.env` out of source control.

Open <http://localhost:3000>. Keep the SSH tunnel running while using the database. PostgreSQL should remain private on the Azure VM; the SSH tunnel forwards local port 5432.

## Project layout

- `src/app`: routes and page composition
- `src/components`: shared UI
- `src/features`: visitor-facing workflows
- `src/server`: database, permissions, business services, and integrations
- `prisma`: schema and migration history
- `docs`: requirements and implementation plan

For product and architecture terminology, see the [project glossary](GLOSSARY.md).

## Runbooks

- [User manual](docs/user-manual.md)
- [Project description corrections](docs/project-description-corrections.md)
- [Returning visitor handoff](docs/handoff-returning-visitors.md)
- [Operations manual](docs/operations-manual.md)

## Database setup status

The Prisma models cover users, one-time staff invitations, departments, visit purposes, company settings, and visit records. Company settings include an editable visitor agreement, encrypted SMTP credentials, and badge-printer preferences. Visit records also preserve the agreed text snapshot and private signature/photo file keys.

## Back office status

The Administrator/Receptionist/Employee sign-in uses a signed, 12-hour, HTTP-only cookie and re-checks the active account and role against PostgreSQL on each request. The dashboard and visit list use live database records; employee queries are limited to visits where they are the host. Administrator configuration includes company details, time zone, departments, visit purposes, the visitor agreement, SMTP email settings, and badge-printer preferences. SMTP passwords are encrypted using `SETTINGS_ENCRYPTION_KEY`, generated locally into `.env`; keep that key stable and private. Administrators can send a test email, and staff invitations are emailed when SMTP is configured, with a copyable one-time link available if delivery fails.

Visitor check-in now records visit details, the configured agreement snapshot, a drawn signature, a visitor photo, and a one-time submission token; check-out updates only the visitor's latest visit. Check-in sends confirmation and host-arrival email when SMTP delivery is available. Signature and photo files are stored privately in `.visitor-files` beside this local app; back up that folder with PostgreSQL, and keep it private. For a hosted or multi-instance deployment, move these files to durable private object storage before deployment. Actual Brother printer integration, password reset, exports, and record cleanup remain to be implemented. Printer preferences are stored, but printing needs the confirmed device and a verified local print bridge. Set `APP_URL` to the user-facing application URL before creating invitations outside local development.

The existing Azure PostgreSQL database has the additive admin-settings migration applied. If applying this specific migration to a fresh copy of that database before Prisma Migrate tracks it, use `node scripts/apply-settings-migration.mjs` only after the database tunnel is open and `DATABASE_URL` points to the intended database.
