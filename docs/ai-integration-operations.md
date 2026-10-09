# AI integration: setup and operating guide

This guide describes the AI functions implemented in Visitor System, the configuration required for each deployment, and the features that remain research objectives.

## Implemented

- An administrator-configured OpenAI or Azure OpenAI provider for the back-office assistant and generated report summaries. One provider is active at a time; the application does not fail over to another provider.
- A read-only assistant for administrators and receptionists. It can report today's arrivals, date-range totals, visits without checkout, and visit filters by host or configured purpose. It can display up to 50 matching visitor rows in the portal, with application links governed by the signed-in user's existing permissions.
- A separate Copilot Studio API for read-only aggregates. It accepts a bounded date-range summary or count of visits without checkout, optionally filtered by host/purpose IDs. It never returns visitor rows.
- A daily or weekly administrator email report for the previous complete local day/week. It includes deterministic database counts even when the AI summary is unavailable.
- Microsoft Entra identity verification and administrator approval for mapping an existing local account to an Entra object. The flow does not create accounts or elevate roles.
- Metadata-only audit events with a 90-day cleanup policy, per-user assistant request limits, and a monthly AI-token cap.

The assistant uses an allowlisted intent format and executes database queries on the server. It does not send visitor records, contact information, photos, signatures, or agreement text to the model. Sensitive visitor identifiers detected in the typed question are rejected. Groups under five are suppressed from AI summary inputs. The AI output is not used to make access, safety, employment, or other consequential decisions.

## Deployment prerequisites

1. Use HTTPS for the public application URL. Set `APP_URL` to the canonical origin (for example, `https://visitor.example.com`) on the server.
2. Keep `SETTINGS_ENCRYPTION_KEY` stable and backed up. Existing encrypted SMTP and AI credentials cannot be decrypted if this key is lost or changed.
3. Deploy the application code and apply Prisma migrations using the project's normal production procedure:
   ```bash
   npm ci
   npm run db:generate
   npx prisma migrate deploy
   npm run build
   pm2 restart visitor-system --update-env
   ```
4. Keep one persistent production Node process or PM2 service running. The scheduled-report worker starts through Next.js instrumentation in the Node runtime; it needs the app process and database to remain available. Database claims and unique period keys prevent duplicate processing when more than one process is running, but a single PM2 instance is the simplest deployment.
5. Ensure the server can make outbound HTTPS connections to the selected model provider, Microsoft Entra endpoints, and the configured SMTP service.

The migration adds AI settings, audit events, report schedules/deliveries, and Entra identity-link records. It does not change existing visitor or staff records. Back up the production database before any migration, as normal operational practice.

## Configure an AI provider

1. Sign in as an administrator and open **Configuration → Assistant, Copilot & scheduled reports**.
2. Select **OpenAI API** or **Azure OpenAI**. For Azure, enter the HTTPS resource endpoint without credentials; enter the model/deployment name expected by the resource.
3. Enter the API key. On later edits, leave the key field blank to retain the encrypted saved key.
4. Choose a per-user daily request limit and monthly token cap. Save settings.
5. Select **Test connection**. A synthetic prompt is used; no visitor data is included. Only a successful test for the current provider/endpoint/model/key configuration unlocks the **Enable AI** action.
6. Enable the assistant when ready. A changed credential or model disables the feature until it is tested again.

Secrets use the application's AES-256-GCM settings encryption and are never sent to the browser after saving. AI requests use the provider's Responses API with response storage disabled. See the [OpenAI Responses API](https://developers.openai.com/api/reference/responses/overview) and [Azure OpenAI Responses API](https://learn.microsoft.com/en-us/rest/api/aifoundry/azureopenai/responses) references for provider behavior.

When the monthly token cap is reached, assistant calls pause until the next UTC month. No provider fallback is attempted. Review provider usage and the configured cap before enabling it for a broad group.

## Configure Microsoft Copilot Studio

Copilot Studio itself remains customer-configured. The Visitor System exposes the server-side API and verifies incoming Entra access tokens; it does not create a Copilot Studio agent or connector automatically.

1. In the deployment's Microsoft Entra tenant, register the API and expose the delegated `visitor.read` scope. Use the API's Application ID URI as the audience.
2. Register the Copilot connector client identity and the confidential web identity used for staff verification. Configure the web identity's redirect URI exactly as:
   `APP_URL + /api/copilot/entra/callback`
3. In **Configuration → Assistant, Copilot & scheduled reports**, enter the tenant ID, audience, connector client ID, identity-verification client ID, and its client secret. The secret is encrypted. Save and enable the Copilot API.
4. Configure the Copilot Studio custom connector to use Microsoft Entra delegated authentication and request `visitor.read`. The connector application ID must match the configured connector ID.
5. Each existing staff member signs in to Visitor System, opens **Microsoft identity** in the account menu, and verifies the same work email as their existing local account. The request remains pending until an administrator approves it in AI configuration.
6. Test the connector with a date range of no more than 90 days. Supported request bodies:
   ```json
   { "queryType": "summary", "from": "2026-10-01", "to": "2026-10-07", "hostId": "optional-local-user-id", "purposeId": "optional-purpose-id" }
   ```
   or:
   ```json
   { "queryType": "not_checked_out", "hostId": "optional-local-user-id", "purposeId": "optional-purpose-id" }
   ```
   Endpoint: `POST /api/copilot/query`; send the delegated Entra token in the Bearer authorization header.

The API validates token signature, issuer, audience, tenant, delegated scope, connector actor, linked object ID, account status, and local role. It returns aggregates only. Counts and daily groups below five are suppressed, and the response includes the portal URL for role-checked follow-up. Do not configure Copilot to request or store individual visitor details.

Microsoft documents the Entra token claims and audience validation in [Validate claims](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation). Copilot Studio's connector identity setup is described in [Configure OBO authentication for custom connectors](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-custom-connector-on-behalf-of).

## Configure scheduled email reports

1. Confirm SMTP is configured and a test email succeeds.
2. In AI configuration, select daily or weekly cadence, local send time, and active administrator recipients.
3. Save the schedule.
4. Select **Send test preview to me**. This sends only to the current administrator and leaves automatic delivery disabled.
5. Review the preview, then select **Enable schedule**.

The report covers the previous complete local day or Monday-through-Sunday week. If AI is disabled, reaches its cap, has a small sample, or fails, the exact counts calculated by Visitor System are still sent and the summary is marked unavailable. If the server was down, the worker sends the most recent completed period once after it resumes; it does not backfill every missed day. SMTP delivery failures are recorded as failed deliveries and are not automatically retried for the same period. Check server logs and the database delivery record before manually resending, to avoid duplicate mail.

## Audit and privacy operations

- Audit records contain user ID, time, operation, query category/filter metadata, result count, token counts, success, and safe error code. They do not contain the user's raw question or model response.
- Old AI audit rows are deleted after 90 days by the running worker.
- The Copilot API stores no prompt or response text. It records bounded date/filter metadata and aggregate result count.
- Treat provider account logs and Copilot Studio configuration as separate systems with their own access and retention settings.
- Disable the provider/API or report schedule from AI configuration if a credential is exposed, access needs to be suspended, or recipients change. Rotate credentials at the provider and then save/test the replacement.

## Not implemented in this release

Automated suspicious-activity/anomaly detection remains a future research objective. This implementation does not score visitors, classify individuals as risky, trigger security responses, or make decisions based on AI. Any later research should start with synthetic or de-identified records, be human reviewed, document false-positive rates, and undergo a privacy/security review before production use.
