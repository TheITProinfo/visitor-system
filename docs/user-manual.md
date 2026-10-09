# Visitor System User Manual

**Audience:** Visitors, employees, reception staff, and administrators  
**Last updated:** October 7, 2026

This guide explains how to use the Visitor System website. For server setup, deployment, backups, and PM2, see the [Operations Manual](operations-manual.md).

## Menus and access by role

- **Administrator:** Overview, Visitor records, People, and Configuration. Administrators can review all visits, manage workspace settings, invite staff, manage staff access, and promote active Employee or Receptionist accounts to Administrator.
- **Front desk (Receptionist):** Overview and Visitor records. Receptionists can review all visits and assist visitors at the kiosk. Badge printer preferences can be configured by an administrator, but automatic badge printing is not a complete workflow yet.
- **Staff (Employee):** Overview and Visitor records for visits hosted by that employee. When SMTP is configured, the system attempts to email the host when a visitor checks in; there is no separate notification page.

## Visitor self check-in flow

### Check in

1. On the welcome page, select **Check in**.
2. Enter your full name. If a returning profile is found, confirm that it is yours. Search results show a masked email; enter the email saved on your profile to load your contact details. If more than one person matches, choose your profile first.
3. Review the loaded name, visit type, company, email, phone, and vehicle plate. You can change details for this visit. Select **Clear profile** if the profile is not yours or you want to start as a new visitor.
4. If you change a returning profile’s details, leave **Save these changes to my profile for next time** unchecked to keep the change on this visit only. Check it only if you want the reusable profile updated.
5. Choose **Company visit** or **Personal visit**, enter the required contact details, and indicate whether you are driving. Provide a vehicle registration number when asked.
6. Search for and select the staff member you are visiting, then choose a visit purpose.
7. Read the visitor agreement, check the agreement box, sign in the signature area, and take or upload a visitor photo.
8. Select **Complete check-in**. Collect your visitor badge at reception. When email delivery is configured, the system attempts to send a check-in confirmation to you and an arrival notice to the staff member you selected. Check your Spam/Junk folder if you do not see a message.

Your profile is reused for future visits, but every check-in creates a separate visit record. Visit details, signatures, photos, and agreement snapshots are retained with that individual visit.

If no profile is found, enter your details as a new visitor. If the kiosk cannot find your host, cannot take a photo, or cannot capture your signature, ask reception for help.

### Check out

1. On the welcome page, select **Check out**.
2. Enter the same email address used when checking in and select **Check out**.
3. Read the result message. If the address is not recognized or the visit is already checked out, ask reception to help verify the record.

Check-out is optional. A missing check-out time means no departure was recorded; it does not confirm whether someone is still on site.

## For staff

### Sign in and navigate

1. Select **Staff sign in** on the welcome page, or open `/back-office` on your organization’s site.
2. Sign in with your work email and staff password.
3. Use **Overview** for arrival counts and recent visits. Open **Visitor records** to search and filter visits.
4. Select a visitor’s name to view the visit details, including contact information, host, purpose, arrival/departure times, agreement snapshot, signature, and photo when available.
5. Use **Change password** under your account name to change your password. Enter your current password and choose a new password of at least 12 characters.
6. Select the arrow beside your account to sign out.

Employees can see visits where they were the host. Receptionists and administrators can review all visitor records. Only administrators see **People** and **Configuration**.

### Review visitor records

In **Visitor records**, you can search by visitor, email, company, host, or purpose; filter by visit status and date range; and clear filters to return to the full list. Up to 100 matching records are shown. A visit without a departure time appears as **Not checked out**.

## For administrators

### Invite or manage staff

1. Open **People** and enter the staff member’s work email.
2. Choose **Employee** or **Receptionist**, then select **Create invitation**.
3. When email delivery is configured, the invitation is sent to that address. If delivery fails, use the one-time link displayed on the page and share it securely with the intended person. The link expires after seven days.
4. After the invitee sets a password and completes their staff profile, their account becomes active.
5. Use the staff list to activate or deactivate access. Deactivated staff cannot sign in or appear in host search, while their historical visit records remain available.
6. To grant full administrator permissions, open the **Action** control for an active Employee or Receptionist, choose **Make administrator**, review the confirmation, and select **Confirm promotion**. Administrator access includes staff management and workspace settings.

Administrators cannot invite another administrator from the People page. Promote an active staff account when another administrator is needed. Keep at least one active administrator account.

### Configure the visitor experience

Open **Configuration** to:

- Set the organization name, optional address, and time zone.
- Add or deactivate departments used in staff profiles.
- Add or deactivate visit purposes shown during check-in.
- Edit and save the visitor agreement displayed at check-in.
- Set SMTP details, save them, and send a test email. For Gmail, use port 587 with implicit TLS off, or port 465 with implicit TLS on. A provider-approved app password may be required.
- Save badge printer preferences.

Printer preferences can be saved, but automatic printing requires a configured local print bridge and is not currently available as a complete workflow. Do not promise a printed badge from this setting alone.

Invitation links use the application’s public URL. If a link points to `localhost`, contact the system operator to correct the production `APP_URL` before sending another invitation.

Configured email delivery is also used for visitor check-in confirmations and host arrival notices. Sending a test email verifies SMTP delivery to the test address; it does not verify that every visitor or host mailbox accepts or displays its notification.

## Help and privacy

- Ask reception for help with a kiosk, host search, visitor photo, signature, or check-in/out issue.
- Ask your system administrator for account access, invitations, password assistance, or workspace settings.
- Only enter your own contact details when confirming a returning visitor profile. Do not share an invitation link with anyone other than the named invitee.
- Visitor profiles contain contact information. Visit records may also contain a signature and photo; treat these records as private.

## Availability note

Returning visitor profile matching is available after the application release and its database migration have both been deployed. If the kiosk does not offer profile search, ask the system operator to finish that release before using this feature.
