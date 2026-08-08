# Filestack Resource Upload TDD Evidence

## Source and journey

The user requested Filestack file upload and Mailboxlayer email validation. No external plan file was used.

As a cloud-authenticated teacher reviewing a draft, I can explicitly upload one already-shareable PDF/text resource and add it to the editable resource list without exposing Filestack's app secret or sending private classroom records.

Mailboxlayer was rejected from the free build after official provider verification showed that its free plan does not include HTTPS. Existing local syntax validation and Supabase inbox confirmation remain the email gates.

## RED and GREEN

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| Signed upload API | `node tests/file-uploads.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `server/backend/api/file-uploads.js`. | `npm run test:file-uploads` passed. | Upload policies are short-lived and scoped; receipts are teacher-bound and expire; provider metadata, ownership prefix, MIME, extension, size, and handle are validated; secrets are absent from responses. Long read links are now issued only after the separate ClamAV gate documented in `clamav-upload-gate.tdd.md`. |
| Teacher upload flow | Targeted Playwright reached the draft but the privacy/upload control did not exist. | `node scripts/run-playwright.cjs tests/browser/file-uploads.spec.ts --project=chromium --workers=1` passed `1/1`. | The button is locked until explicit approval, cloud requests carry the Supabase bearer token, only the selected file goes to Filestack, and the finalized resource enters the editable draft. |

## Verification targets

- API/security contract: `tests/file-uploads.test.mjs`
- Teacher browser journey: `tests/browser/file-uploads.spec.ts`
- Full repository gate: `npm run verify:ci`
- Full browser matrix: `npm run test:browser` passed `80` with `48` intentional mobile duplicate skips; the Filestack journey passed on desktop and phone.

## Known external gates

Tests mock Filestack and Supabase. Production use still requires registered server credentials, Filestack Security enabled in the provider portal, domain allowlists, quota monitoring, a deployed private ClamAV gateway, and live clean-file/EICAR/outage/read probes. No live provider upload was attempted in this test record.

The product control is therefore hidden by default behind `VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false`. Enable it only after the live proof succeeds in the exact deployment.
