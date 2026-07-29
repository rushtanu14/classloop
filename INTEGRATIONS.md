# ClassLoop Email Setup

ClassLoop now keeps the working prototype free-first. It does not include paid API-key features, Google Classroom OAuth posting, LMS posting, OpenAI transcription, or custom transcription-service hooks.

The only external delivery path kept in the app is email through an account the user owns. The current free path is Gmail SMTP with a Gmail app password.

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Configure Gmail or another SMTP account you own.
3. Start ClassLoop with `./run.sh`.

`.env.local` is ignored by git. Do not commit real credentials.

## Gmail Sender

ClassLoop cannot generate a Gmail account or send from an address you do not own. For a no-reply-like sender, create and own a Gmail account such as `classloop.donotreply@gmail.com`, turn on 2-Step Verification, generate an app password, and use that account as the sender.

```bash
CLASSLOOP_GMAIL_USER=classloop.donotreply@gmail.com
CLASSLOOP_GMAIL_APP_PASSWORD=your-16-character-app-password
CLASSLOOP_GMAIL_FROM=classloop.donotreply@gmail.com
CLASSLOOP_NO_REPLY_EMAIL=classloop.donotreply@gmail.com
CLASSLOOP_NO_REPLY_NAME=ClassLoop
CLASSLOOP_REPLY_TO=teacher@example.com
```

`CLASSLOOP_REPLY_TO` lets student replies go to a real teacher/support inbox while ClassLoop sends from the no-reply-like Gmail account.

## Generic SMTP

If a school already provides free SMTP access, configure:

```bash
CLASSLOOP_SMTP_HOST=smtp.example.com
CLASSLOOP_SMTP_PORT=587
CLASSLOOP_SMTP_SECURE=false
CLASSLOOP_SMTP_USER=teacher@example.com
CLASSLOOP_SMTP_PASS=replace-me
CLASSLOOP_SMTP_FROM=teacher@example.com
CLASSLOOP_SMTP_PROVIDER=SMTP
```

## Removed/Deferred Paid Or Integration-Heavy Features

These features were removed from the current app because they require paid API keys, school platform credentials, or external integration setup that the user does not want to depend on:

- OpenAI speech-to-text.
- Custom transcription-provider API.
- Google Classroom OAuth posting.
- Canvas/LMS posting.
- Background online-call capture that depends on paid/external transcription.

ClassLoop still works through transcript paste/upload, best-effort browser tab/window audio capture for online meetings, teacher review, publish preview, student dashboards, local analytics, roster templates, and Gmail recap delivery. In-person class capture is not part of the app.

## Privacy and Security Controls

- Real secrets live in `.env.local`, which is ignored by git.
- Desktop account/session state is encrypted with ClassLoop's prompt-free local AES-GCM storage key.
- Browser fallback storage is AES-GCM encrypted locally. True multi-device sync still requires a backend database and server-side authentication.
- Local API routes reject requests from untrusted origins.
- Static and API responses include restrictive security headers.
- The browser window uses context isolation and does not expose Node integration to the UI.
- External links are restricted to `http`, `https`, and `mailto`.
- Camera and geolocation permissions are denied. Display/audio capture is requested only when a teacher explicitly starts online meeting capture; transcript paste/upload remains the reliable path.
