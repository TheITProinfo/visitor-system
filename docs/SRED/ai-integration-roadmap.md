# AI Integration and Product Expansion Roadmap

**Status:** Proposed next-stage roadmap  
**Prepared:** October 8, 2026  
**Purpose:** Explore practical AI extensions for the Visitor Management System. This document describes future options; it does not claim that these features have been implemented or that they qualify for SR&ED.

## 1. Current platform foundation

The system already supports visitor check-in and check-out, visitor records, returning-visitor profile lookup and autofill, photo and signature capture, staff accounts and invitations, host selection, email notifications, and administrator configuration. These workflows provide a structured data and permissions foundation for future integrations.

## 2. Product direction

The proposed direction is an **intelligent visitor operations platform**: help authorized staff find information, understand activity, prepare for arrivals, and complete routine work while keeping people responsible for decisions that affect visitors.

## 3. Integration paths

| Path | Best fit | Considerations |
|---|---|---|
| **AI in the application** through a server-side model API (for example, Azure OpenAI, OpenAI, or another customer-approved provider) | An assistant and reports embedded in this system | The application controls which data and tools the model can access. Keep provider credentials on the server and make the provider replaceable. |
| **Microsoft Copilot Studio** with a custom connector or REST API | A purpose-built agent that staff use through a Microsoft environment | Connect the agent to narrow, permission-checked application actions; verify the customer's Microsoft licensing and tenant policies. |
| **Microsoft 365 Copilot connector** | Searching visitor-system information from Microsoft 365 Copilot | Synced connectors index external content; federated connectors retrieve it at query time. For sensitive, frequently changing visitor records, assess live, permission-aware retrieval before indexing data. |

These paths are alternatives that can also be combined later. “Copilot integration” should name the exact Microsoft product and interaction path chosen. See [Microsoft 365 Copilot connectors](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/overview-copilot-connector), [Copilot Studio connectors](https://learn.microsoft.com/en-us/microsoft-copilot-studio/advanced-connectors), and the [OpenAI API quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request).

## 4. Recommended roadmap

1. **Staff reporting assistant — first priority.** Let authorized administrators and front-desk staff ask questions such as “Who has not checked out today?” or “How many visitors came last week?” Answer from approved, read-only reporting tools, show the date range and source records, and ask for clarification when a request is ambiguous.
2. **Scheduled summaries.** Calculate counts and status totals with normal application queries; use AI only to turn verified results into a readable daily or weekly summary. Let an administrator configure recipients and review or approve delivery.
3. **Staff operations agent.** Add guided workflows such as finding a record, drafting a host notification, or preparing an end-of-day checklist. Start read-only. Require staff confirmation before sending messages or making any change.
4. **Kiosk concierge.** Offer multilingual text or voice guidance for the check-in steps, accessibility help, and common questions. Keep identity, host authorization, consent, and record submission in the existing explicit visitor workflow.
5. **Calendar and workplace integrations.** Explore Outlook/Teams pre-registration, appointment details, QR check-in links, host confirmation, and arrival notifications. Use AI for optional summaries or drafts; use deterministic workflow logic for invitations and status changes.
6. **Operational insights.** Start with transparent indicators such as after-hours arrivals, frequent visits, peak periods, or visits without checkout. Present these as review prompts with the underlying reason, not as a judgment that a person is suspicious. Consider statistical prediction only after data quality, volume, and usefulness are demonstrated.

## 5. Architecture and safeguards

- Route every AI request through authenticated application APIs; do not give a model direct database credentials or unrestricted SQL access.
- Enforce the signed-in user's role and customer/workspace boundary on every query. Return only fields needed for the question, with source links or record identifiers for verification.
- Treat visitor-entered text as untrusted input. Restrict the assistant to an allow-list of read-only tools and validated parameters.
- Keep exact numbers and operational statuses database-derived. Use the model for explanation and summarization, not as the source of record.
- Log the requesting user, approved tool, time range, and outcome without unnecessarily duplicating visitor personal information.
- Minimize or redact personal information before external model processing. Do not send visitor photos or signatures for general reporting, and do not use face recognition or automatic risk scoring.
- Make AI assistance visible to users, provide a way to correct or report answers, and require human approval for external communications or record changes.
- Before selecting a provider, review the customer's data residency, retention, access, contract, and licensing requirements. Canada's privacy commissioners provide [privacy principles for generative AI](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai/).

## 6. Evaluation and future technical investigation

Before implementation, define representative questions and expected results. Compare AI answers with known database results across date boundaries, time zones, spelling variations, ambiguous names, role restrictions, and empty-result cases. Track answer correctness, unauthorized-data exposure (target: none), clarification rate, response time, cost, and staff usefulness.

Potential technical questions for a future investigation include whether natural-language requests can be translated into reliable, permission-scoped reports; how to preserve authorization through an agent or Copilot connector; and how to minimize personal data while retaining useful summaries. These are research questions to evaluate before work begins, not claims that uncertainty, experiments, or results already exist.

## 7. SR&ED documentation boundary

This roadmap is a product and research proposal, not an eligibility determination. Adding AI, using an agent, or integrating a known model does not by itself establish SR&ED eligibility. If future work is assessed for SR&ED, document the actual technological uncertainty, hypotheses, experiments or analyses, results, and technical knowledge as the work occurs, and have a qualified SR&ED advisor assess the facts. CRA's [eligibility guidance](https://www.canada.ca/en/revenue-agency/services/scientific-research-experimental-development-tax-incentive-program/sred-eligibility.html) says qualifying work must be performed in Canada and seek technological advancement through systematic investigation by experiment or analysis.
