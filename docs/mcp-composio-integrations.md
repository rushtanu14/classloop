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
npm run mcp:setup:composio -- --apply
```

Generate a URL later from an existing config:

```sh
COMPOSIO_API_KEY=... \
COMPOSIO_CLASSLOOP_MCP_CONFIG_ID=... \
npm run mcp:setup:composio -- --generate
```

Keep Composio tools narrow. Google Classroom, Zoom, and Gmail should remain preview/review inputs until ClassLoop has a teacher confirmation screen for every external publish, send, or import action.

