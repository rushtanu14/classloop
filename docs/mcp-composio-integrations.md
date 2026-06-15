# ClassLoop MCP and Composio Integrations

ClassLoop now has a preview-first local MCP scaffold for teacher-controlled review workflows. It does not publish to Google Classroom, send Gmail messages, or import Zoom recordings automatically.

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

## Composio MCP Scaffold

Plan the connector config:

```sh
npm run mcp:setup:composio
```

Create the Composio MCP config after adding the server-only env vars:

```sh
COMPOSIO_API_KEY=... \
COMPOSIO_GOOGLE_CLASSROOM_AUTH_CONFIG_ID=... \
COMPOSIO_ZOOM_AUTH_CONFIG_ID=... \
COMPOSIO_GMAIL_AUTH_CONFIG_ID=... \
COMPOSIO_GOOGLE_CALENDAR_AUTH_CONFIG_ID=... \
npm run mcp:setup:composio -- --apply
```

Generate a URL later from an existing config:

```sh
COMPOSIO_API_KEY=... \
COMPOSIO_CLASSLOOP_MCP_CONFIG_ID=... \
npm run mcp:setup:composio -- --generate
```

The setup script includes only toolkits whose `COMPOSIO_*_AUTH_CONFIG_ID` variables are present. Core ClassLoop connectors are:

- Google Classroom: course rosters, announcements, coursework, and materials.
- Zoom: meeting metadata, participant lists, recordings, summaries, and transcript availability.
- Gmail: teacher-reviewed draft recap emails and mailbox search.
- Google Calendar: follow-up events, office-hours holds, and reminder drafts.

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

Keep Composio tools narrow. These connectors should remain preview/review inputs until ClassLoop has a teacher confirmation screen for every external publish, send, import, delete, or share action. Prefer the specific Google Workspace toolkits above over broad `googlesuper` access.

If Composio changes an action name, override a connector's exact allowed-tool list with a comma-separated env var such as:

```sh
COMPOSIO_GMAIL_ALLOWED_TOOLS=GMAIL_CREATE_EMAIL_DRAFT,GMAIL_FETCH_EMAILS,GMAIL_SEARCH_EMAILS
```
