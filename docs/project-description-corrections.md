# Project Description Corrections

Use this review when updating the project overview, README, course submission, or email to the professor. It compares the supplied project description with the implementation and the last deployment status confirmed in this conversation.

> **Status note (October 5, 2026):** The existing app has been deployed and used at the public domain. The returning-visitor feature and its migration were added locally afterward; the last confirmed status was that they had not been pushed or applied to Azure. Recheck Git and Azure before reusing this note or claiming that feature is live.

## Recommended live-demo block

Place this near the top of the README, immediately below the title. Keep it only while these URLs are available and tested:

```markdown
## Live Demo
- Visitor kiosk: [https://visitor.supaai.cloud](https://visitor.supaai.cloud)
- Staff sign-in: [https://visitor.supaai.cloud/back-office](https://visitor.supaai.cloud/back-office)
```

## Claims to correct

| Supplied claim | More accurate wording |
| --- | --- |
| “Production-ready” and “directly used as a real company lobby solution.” | Call it an expanded visitor management project prepared for production deployment. State production readiness only after applying the pending profile migration, verifying security and backups, and completing production smoke tests. |
| “Returning visitor only types name; the system auto-fills all history data.” | Name search is debounced and case-insensitive. A unique match becomes a candidate; visitors confirm the email saved on the profile before contact details load. Several matches require selection. Updating a reusable profile is optional; every check-in creates its own visit record. |
| “Photo and signature are saved to cloud database.” | Photo and signature files are stored privately on the application server’s filesystem. PostgreSQL stores the visit data and file references. Back up the private files directory as well as PostgreSQL. |
| “Admin or staff completes check-out.” | Visitors record their own departure through the public check-out page using the email used at check-in. Staff can review visit status in the back office. |
| “Different permission roles (Administrator / Staff).” | The system roles are Administrator, Receptionist, and Employee. Administrators can configure the workspace and manage staff. Employees see visits where they are the host; Receptionists and Administrators can review all visitor records. |
| “Invited staff appear in host selection.” | Staff appear as hosts after they accept the invitation, complete their profile, and have an active account. Invitations can create Employee or Receptionist accounts. |
| “Badge printing settings” listed as an available printing function. | The system saves badge-printer preferences. Actual printing still requires a verified local print bridge and is not a complete workflow yet. |
| “Full LAN access support” because the server binds to `0.0.0.0`. | The app can listen on all VM interfaces. Actual LAN/public access also depends on firewall, routing, DNS, and reverse-proxy/origin configuration. |
| “Public IP + SSL secure connection” for Azure PostgreSQL. | Name the Azure PostgreSQL service, but claim SSL only after verifying the production connection enforces TLS and the firewall limits database access to trusted hosts. |
| “Full end-to-end tested system” including returning visitor search. | State which environment and workflows were actually tested. The production build and lint passed locally; the returning-visitor migration and workflow still need production verification after release. |

## Suggested project overview wording

> This MSIT course project began with a basic requirement to collect and store visitor information. I extended it into a full-stack visitor check-in and check-out application using Next.js, PostgreSQL, and Prisma. Visitors can provide contact and visit details, review an agreement, sign, and take a photo. Staff can review visitor records according to their role, and administrators can manage workspace settings and invite employees or receptionists. The app also supports visitor check-out and SMTP email delivery when configured.
>
> Returning-visitor profiles can reduce repeated data entry. The kiosk searches by name, masks saved email addresses in the results, and asks the visitor to confirm the profile email before loading saved contact details. Each arrival remains a separate visit record. The feature requires the corresponding database migration to be applied in the deployed environment.

## Suggested email paragraph

Replace broad claims such as “fully production-ready” or “full end-to-end tested” with a brief scope statement like this:

> The original assignment focused on collecting and storing visitor information. I completed that baseline and extended the project with a multi-step kiosk check-in, visitor check-out, staff sign-in and role-based record access, administrator settings, staff invitations, SMTP email, and signature and photo capture. I also implemented reusable returning-visitor profiles with email confirmation; that feature should be described as available in the live demo only after its database migration and application release have been deployed and tested.

Then provide the live URLs and source repository, and invite the professor to test the currently deployed features. Do not include credentials, SMTP passwords, database connection strings, invitation tokens, or personal visitor data.

## Verify before submission

- Confirm the public kiosk and staff sign-in URLs load over HTTPS from outside the VM’s network.
- Confirm `APP_URL` uses the public HTTPS domain so staff invitations do not contain `localhost`.
- Confirm Azure PostgreSQL TLS and firewall rules before describing its connection as SSL-secured or public-IP accessible.
- Confirm whether the returning-visitor migration has been deployed; update the status note and feature description accordingly.
- Confirm that the private photo/signature directory has a backup and is not being described as database storage.
- Use the exact deployed role names and clearly distinguish saved printer preferences from working printer integration.
