# Whisper Transcription and Individual Follow-Through

## What ships in this build

- Class transcription mode can upload text transcripts, audio files, or screen recordings.
- Individual meeting mode can upload text transcripts, audio files, or screen recordings.
- Hosted audio/video uploads call `/api/transcribe`, which sends the recording to OpenAI transcription with `OPENAI_TRANSCRIPTION_MODEL=whisper-1` by default.
- Generated class sessions and individual meetings save a structured transcript with source, model, duration, text, and speaker-labeled segments.
- Individual meeting review creates a follow-through panel with:
  - a generated next-meeting Google Calendar draft,
  - a Google Docs-ready summary for Drive,
  - an email follow-up draft that stays locked until the user explicitly approves opening it.

Whisper transcription does not identify real speakers by voiceprint. ClassLoop keeps unknown recording segments labeled as unknown unless the pasted transcript already contains speaker labels or the user reviews them.

## Required hosted setup

1. In Vercel, open the ClassLoop project.
2. Go to Settings -> Environment Variables.
3. Add `OPENAI_API_KEY` as a server-only variable.
4. Add `OPENAI_TRANSCRIPTION_MODEL=whisper-1`.
5. Redeploy `main`.
6. Sign into an individual account and upload a small `.webm`, `.m4a`, `.mp3`, `.wav`, `.mp4`, or `.mov` file.
7. Confirm the meeting review shows the Transcript panel and Follow-through automations panel.

## Google behavior in this build

The app does not silently create Google data without OAuth. Instead:

- Calendar: opens a prefilled Google Calendar event draft from the generated next-meeting suggestion.
- Docs: copies the generated summary and opens `docs.new`; the user pastes it into the new Google Doc in Drive.
- Email: opens a mail draft only after the user checks the permission box.

## To make Google actions fully automatic later

1. Create a Google Cloud project for ClassLoop.
2. Enable Google Calendar API and Google Drive API.
3. Configure OAuth consent for the app.
4. Add these scopes only when needed:
   - `https://www.googleapis.com/auth/calendar.events`
   - `https://www.googleapis.com/auth/drive.file`
5. Add hosted redirect URI: `https://YOUR_CLASSLOOP_DOMAIN/api/google/oauth/callback`.
6. Add desktop redirect URI for the packaged app if native OAuth is needed.
7. Store refresh tokens server-side per user, encrypted.
8. Add backend endpoints that create Calendar events and Google Docs files.
9. Keep email delivery on ClassLoop's server-only Gmail app-password or SMTP environment path.
