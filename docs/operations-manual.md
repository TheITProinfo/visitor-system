# Visitor System Operations Manual

This manual covers local development and the current single-VM Azure deployment. The app is a Next.js 16.3.8 server using PostgreSQL and Prisma 7. Keep the Azure database and application secrets private.

## Service layout

- Repository/deployment directory on the VM: `/opt/visitor-system`.
- Next.js listens on port `3000`; bind to all VM interfaces so the configured Cloudflare/origin routing can reach it.
- Run the app as the unprivileged `azureuser` account under PM2.
- PostgreSQL is configured via `DATABASE_URL`. Do not expose database port 5432 publicly; local development uses the `azure-visitor` SSH tunnel.
- Visitor photos and signatures are stored outside PostgreSQL in `VISITOR_FILES_DIR`, or `.visitor-files` under the app directory when that variable is unset. Back this directory up with the database.
- Do not commit or display `.env`.

## Required environment

On the VM, keep the application `.env` owned by the service user and restrict its permissions (`chmod 600 .env`). Required values include:

- `DATABASE_URL` — PostgreSQL connection for the intended environment.
- `SESSION_SECRET` — stable secret for signed staff sessions.
- `SETTINGS_ENCRYPTION_KEY` — stable key for encrypted SMTP settings.
- `APP_URL` — public HTTPS URL used in invitation links; never leave this at localhost in production.
- `VISITOR_FILES_DIR` — optional durable private directory for signature/photo files.

Other settings are documented in `.env.example`. Do not copy a local `.env` over the VM’s production `.env`.

## First deployment or schema update

Run the commands from an SSH session as `azureuser`. Confirm the Git branch and `DATABASE_URL` before changing the database.

```bash
cd /opt/visitor-system
git status --short
git pull --ff-only origin main
npm ci
npm run db:generate
npm run build
npx prisma migrate status
npx prisma migrate deploy
```

After the migration succeeds, start the app under PM2 (first deployment):

```bash
pm2 start npm --name visitor-system -- run start -- --hostname 0.0.0.0 --port 3000
pm2 save
```

For an existing PM2 process, restart only after the new build and database migration succeed:

```bash
pm2 restart visitor-system --update-env
pm2 save
```

The `returning_visitors` migration adds `VisitorProfile`, backfills profiles from existing visits, and adds a nullable relation from `VisitRecord`. The migration is additive, but still take a database backup first. If `migrate deploy` fails, stop the rollout, retain the existing process, and inspect the migration error before retrying. Do not manually delete migration rows or drop profile tables as a rollback shortcut.

The project needs development dependencies for build and Prisma CLI commands. Do not use `npm ci --omit=dev` before generating the Prisma Client, building, and running migrations.

## Keep PM2 alive across VM reboots

Check whether PM2 has a startup service configured:

```bash
pm2 status
pm2 save
pm2 startup
```

`pm2 startup` prints a system startup command for the current user and Node installation. Run the exact command it prints with the required administrator privileges, then run `pm2 save` again as `azureuser`. PM2 should then restore the saved process list after a reboot.

## Routine operations

```bash
pm2 status
pm2 describe visitor-system
pm2 logs visitor-system --lines 100
pm2 restart visitor-system --update-env
pm2 stop visitor-system
pm2 start visitor-system
```

Use `pm2 flush` only when intentionally clearing PM2 logs. Do not paste logs into public issues without checking for visitor information, email addresses, tokens, or secrets.

Check the local service from the VM:

```bash
curl -I http://127.0.0.1:3000/
```

Then check the public HTTPS URL in a browser. The VM process must remain bound to `0.0.0.0:3000` for the current origin configuration. Keep the firewall/network rules limited to the intended web ingress; never open PostgreSQL to the Internet.

## Database checks and backups

```bash
cd /opt/visitor-system
npx prisma migrate status
```

Before a release that changes the schema, create a PostgreSQL backup using the organization’s approved backup method and confirm it is recoverable. Back up the private visitor files directory too. PostgreSQL backups alone do not contain the binary signature/photo files.

Visitor profile deletion/retention is not currently implemented as an admin workflow. Treat profile contact details, photos, signatures, and visit records as sensitive personal data, and restrict filesystem and database access accordingly.

## Returning visitor smoke test

After deploying the profile migration and app:

1. Open `/check-in`; type at least two characters of a previously checked-in visitor’s name and wait about half a second.
2. Confirm that a unique result becomes a candidate. Verify the saved email to load profile fields.
3. Confirm full name, email, phone, company, and vehicle plate are populated when present. Check that fields remain editable.
4. For a common/ambiguous name, confirm multiple choices are shown and each email hint is masked.
5. Change a field and leave profile-update consent unchecked; complete a test check-in and verify the new visit has the changed snapshot while the profile remains unchanged.
6. Repeat with the profile-update option checked; verify only the reusable profile changes and both visit records remain intact.
7. Use “Clear profile” and verify the kiosk can continue as a new visitor.

Use a designated test profile and test visit. Avoid using real visitor photos or contact details for smoke testing when synthetic test data is sufficient.

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| App is not reachable | `pm2 status`, `pm2 logs visitor-system --lines 100`, and `curl -I http://127.0.0.1:3000/`; verify port 3000 and origin routing. |
| PM2 shows stopped/errored | Inspect PM2 logs, confirm `.env` is readable by `azureuser`, then restart with `--update-env`. |
| Database connection fails | Check the VM’s `DATABASE_URL`, PostgreSQL service/network access, and credentials. Do not expose port 5432 publicly. |
| Migration reports pending | Run `npx prisma migrate status`; make a backup, then `npx prisma migrate deploy` from the release checkout. |
| Returning visitor search is empty | Confirm `returning_visitors` migration was applied, name has at least two characters, and that the previous check-in created a profile. |
| Profile is found but cannot load | Confirm the saved email exactly (case-insensitive); if unavailable, clear the candidate and continue with manual entry. |
| Profile search API errors after release | Inspect PM2 logs, check migration status, then verify the app was built/generated with the updated Prisma schema. |
| Photos/signatures missing | Check `VISITOR_FILES_DIR` and file backups. Those files are stored on disk, not in PostgreSQL. |

## Local development on Windows

1. Keep an SSH tunnel open in a separate PowerShell window:

   ```powershell
   ssh -L 5432:127.0.0.1:5432 azure-visitor
   ```

2. In the repository, configure a private `.env` from `.env.example`, then run:

   ```powershell
   npm ci
   npm run db:generate
   npx prisma migrate deploy
   npm run dev
   ```

3. Open `http://localhost:3000`. The tunnel must remain open while the app accesses the VM database.

For a new migration during development, use the repository script `npm run db:migrate -- --name <migration-name>` only against the intended development database. Review generated SQL before applying it to production.
