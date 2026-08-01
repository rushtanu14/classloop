# ClassLoop MCP and Composio Integrations

ClassLoop has a preview-first local MCP scaffold plus authenticated hosted routes for each teacher to connect a private provider account and prepare a bounded, structured import. It does not publish to Google Classroom, send email through Composio, or import provider data without the teacher reviewing and applying it.

## Local MCP Server

Build the server:

```sh
npm run build:mcp
```

Run it over stdio:

```sh
node dist-mcp/mcp/classloop-server.js
```

Optional environment variables:

```sh
CLASSLOOP_MCP_STATE_PATH=/absolute/path/to/workspace.json
CLASSLOOP_MCP_REDACTION=strict
```

`CLASSLOOP_MCP_REDACTION` supports `strict`, `balanced`, and `local`. Strict is the default and redacts student emails, speaker names, and raw transcripts. The server will not decrypt the desktop `.classloop-data.json` file; point `CLASSLOOP_MCP_STATE_PATH` at a safe exported workspace snapshot when you want an MCP client to inspect real local context.

Resources:

- `classloop://workspace/summary`
- `classloop://sessions`
- `classloop://sessions/{sessionId}`
- `classloop://sessions/{sessionId}/report`
- `classloop://students/{studentId}/followups`
- `classloop://launch/status`

Tools:

- `classloop_create_import_draft`
- `classloop_parse_transcript_preview`
- `classloop_prepare_classroom_post`
- `classloop_export_session_report`
- `classloop_add_teacher_note`

## Composio MCP Setup

The npm command loads ignored `.env.local` automatically. Inspect the current plan without creating remote resources:

```sh
npm run mcp:setup:composio
```

Create or reuse every toolkit that currently supports Composio-managed OAuth:

```sh
npm run mcp:setup:composio -- --provision-managed --show-ids
```

Run `--show-ids` only in a private terminal. Without it, operational IDs are redacted from logs. Save each returned auth config ID under the matching server-only `COMPOSIO_*_AUTH_CONFIG_ID` variable, then create the narrow ClassLoop MCP config:

```sh
npm run mcp:setup:composio -- --apply
```

When `COMPOSIO_CLASSLOOP_MCP_CONFIG_ID` is already present, `--apply` updates that server in place instead of creating a duplicate.
The command reads the remote config back after applying it and verifies the expected toolkit, auth-config, and allowed-tool counts.

For private administrator/bootstrap testing only, create provider-consent links for the configured bootstrap user:

```sh
npm run mcp:setup:composio -- --connect --show-url
```

After the bootstrap user completes OAuth, inspect those bootstrap connections:

```sh
npm run mcp:setup:composio -- --connections
```

Generate a URL later from an existing config:

```sh
npm run mcp:setup:composio -- --generate
```

`--connect` does not treat an auth config as a connected teacher account. It skips active connections, reports pending connections, and creates a new link only when needed. Use `--force-links --show-url` only when an earlier link was lost or expired. Do not distribute these bootstrap URLs to teachers.

Hosted teachers connect from ClassLoop's Integrations page instead. The server:

- Authenticates the Supabase session and verifies the server-owned profile is a teacher.
- Derives a stable, opaque Composio user id from the Supabase user id.
- Creates a private provider connection for that exact teacher.
- Accepts only exact manifest integration ids and server-owned read-only preview plans.
- Pins the current Composio tool version and redacts credential-like response fields.
- Accepts redirects only from the exact HTTPS `connect.composio.dev` host.
- Returns only minimal source cards; provider ids and raw provider JSON stay server-side.
- Encrypts each short-lived source selection with `CLASSLOOP_INTEGRATION_SELECTION_SECRET` and binds it to the teacher, active account, connector, query, tool version, and record fingerprint.
- Re-reads the selected source before preparing a typed ClassLoop patch.

## Teacher connection and import flow

1. Sign in to a confirmed ClassLoop teacher cloud account and open **Integrations**.
2. Choose a connector. If administrator setup is complete, select **Connect** and finish consent on the trusted Composio page. Return to ClassLoop and select **Check connection**.
3. Select **Browse**, enter the requested document or spreadsheet reference when required, and select **Load sources**.
4. Choose one source and select **Review selected source**. Review each proposed ClassLoop field, disable anything that should not be imported, and choose fill, append, or replace behavior for existing content.
5. Select **Continue to New Session**. ClassLoop still does not change the form. On the New Session page, select **Apply selected fields**, review the completed form, then generate the draft.

The import is read-only on the provider side. ClassLoop does not send, post, edit, share, or delete provider data. Closing the flow, signing out, or changing accounts clears pending selections. Manual transcript, roster, notes, and resource entry remains available at every step.

If a connector shows **Administrator setup required**, finish the setup listed in the card before asking a teacher to connect:

- Google Classroom and Google Forms require a custom Google OAuth client, exact read scopes, registered callback, and any Workspace administrator approval.
- Canvas requires the school Canvas base URL and institution-approved OAuth or API credentials.
- Blackboard requires an institution-approved Blackboard OAuth application.
- Managed connectors require the matching `COMPOSIO_*_AUTH_CONFIG_ID` in the hosted server environment.

The setup script includes only toolkits whose `COMPOSIO_*_AUTH_CONFIG_ID` variables are present. Composio-managed OAuth is currently available for:

- Zoom
- Google Calendar, Meet, Drive, Docs, Sheets, and Tasks
- Outlook and Microsoft Teams
- Slack
- Notion

The following connectors need credentials or approval outside the Composio API key:

| Connector | Additional setup |
| --- | --- |
| Google Classroom | Custom Google OAuth client, Classroom scopes, callback registration, and often Google Workspace admin approval |
| Google Forms | Custom Google OAuth client with Forms read scopes and callback registration |
| Canvas | School Canvas base URL plus institution-approved OAuth client or API token |
| Blackboard | Institution Blackboard OAuth app/client credentials and administrator approval |

Core ClassLoop connectors are:

- Google Classroom: course rosters, announcements, coursework, and materials.
- Zoom: meeting metadata, participant lists, recordings, summaries, and transcript availability.
- Google Calendar: existing calendar and event context for teacher-reviewed follow-up.

High-value optional connectors:

- Google Meet: Meet recordings, transcript entries, and participant details.
- Google Drive: class material search, export folders, and reviewed resource sharing.
- Google Docs: recap documents, support-safe reports, and meeting notes.
- Google Sheets: roster spreadsheets, completion exports, and analytics handoff.

Additional ClassLoop-relevant optional connectors:

- Google Tasks: teacher follow-up task reminders.
- Google Forms: exit tickets, check-ins, and feedback forms.
- Canvas and Blackboard: LMS courses, assignments, announcements, and school-specific context.
- Outlook and Microsoft Teams: Microsoft-school email, calendar, meeting, and team-context workflows.
- Slack and Notion: school-team operations, pilot feedback, and support/research notes.

Keep Composio tools narrow. These connectors remain read-only reviewed-import inputs. External publish, send, edit, delete, and share tools are not in the ClassLoop allowlist. Prefer the specific Google Workspace toolkits above over broad `googlesuper` access.

Email delivery is intentionally separate from Composio. Configure the server-only `CLASSLOOP_GMAIL_USER`, `CLASSLOOP_GMAIL_APP_PASSWORD`, and `CLASSLOOP_GMAIL_FROM` variables, or the generic `CLASSLOOP_SMTP_*` variables documented in `INTEGRATIONS.md`. Never expose an app password through a `VITE_*` variable.

If Composio changes an action name, override that connector's exact allowed-tool list with its comma-separated `COMPOSIO_<CONNECTOR>_ALLOWED_TOOLS` environment variable. Gmail tool overrides are intentionally unsupported.

For hosted ClassLoop, set `COMPOSIO_API_KEY`, `COMPOSIO_CLASSLOOP_MCP_CONFIG_ID`, `CLASSLOOP_INTEGRATION_SELECTION_SECRET`, `CLASSLOOP_PUBLIC_URL`, and the selected auth config IDs as server-only hosting variables, then redeploy. The selection secret must be independent random key material of at least 32 characters; it encrypts short-lived, teacher-bound record selections and must never reuse the Composio key. Never use `VITE_*` for these values. `COMPOSIO_CLASSLOOP_USER_ID` and `COMPOSIO_CLASSLOOP_CALLBACK_URL` are only for the administrator/bootstrap setup command; the hosted runtime never trusts a browser-supplied or shared Composio user id.

The authenticated per-teacher connection lifecycle, opaque source selection, connector-specific normalization, field-by-field review, and explicit New Session apply step are implemented. A real provider OAuth connection is still required before live sources can be read. Provider APIs may omit content that was never created or that the connected school account cannot read; ClassLoop reports those omissions instead of inventing transcripts, rosters, or assignments.
