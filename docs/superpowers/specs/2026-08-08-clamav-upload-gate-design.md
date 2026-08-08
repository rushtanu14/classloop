# ClamAV Upload Gate Design

## Goal

Prevent a teacher-uploaded Filestack resource from becoming shareable until ClassLoop receives a clean, current ClamAV verdict. Cover both the desktop app and hosted PWA through the same server-side finalization path without sending files to a public malware corpus or paying per scan.

## Approved Approach

Run ClamAV as private self-hosted infrastructure. A small HTTPS scanner gateway accepts an authenticated raw file body, streams it to a private `clamd` instance with the INSTREAM protocol, and returns a bounded JSON verdict. ClassLoop's existing `/api/file-uploads/finalize` endpoint downloads the just-uploaded Filestack object through a one-minute handle-scoped policy, sends those bytes to the gateway, and issues the long-lived read URL only after a clean verdict.

The scanner software has no per-scan fee. Deployment compute and egress can still consume hosting allowance, so the product must describe the scanner as free/open-source rather than promise free infrastructure forever.

Rejected alternatives:

- Cloudmersive free tier: evaluation-only and limited to 3.5 MB, so it is not a production gate for ClassLoop's 10 MB resources.
- MetaDefender free API: personal/demo use only, so it cannot back a commercial/freemium product.
- Browser-only scanning: there is no maintained official ClamAV WebAssembly distribution with the full current engine and signatures; it would also make a client-controlled verdict authoritative.
- Exposing `clamd` directly: its TCP protocol has no application authentication or HTTPS and must remain on a private container network.

## Trust Boundaries

1. The browser may select and upload a file but never decides whether it is clean.
2. Filestack stores the bounded object under a teacher-bound random filename prefix. Its browser-visible API key remains constrained by a short-lived signed policy.
3. The ClassLoop backend re-verifies owner prefix, filename, extension, MIME type, and size, then downloads at most 10 MB through a short-lived signed read policy.
4. The scanner gateway accepts only `POST /scan`, requires an exact bearer token, requires `application/octet-stream`, applies body and rate limits, and sends the bytes to private `clamd`.
5. `clamd` and its signature files are never exposed to browsers or the public internet. `freshclam` keeps signed definitions current.
6. Only the ClassLoop backend can turn a clean verdict into a student-shareable URL.

## Scanner Contract

`POST /scan` request:

- `Authorization: Bearer <SCANNER_AUTH_TOKEN>`
- `Content-Type: application/octet-stream`
- `Content-Length: 1..10485760`
- raw file bytes

Clean response (`200`):

```json
{
  "verdict": "clean",
  "engine": "ClamAV",
  "engineVersion": "ClamAV 1.x/...",
  "scannedAt": "2026-08-08T12:00:00.000Z",
  "threats": []
}
```

Detected response (`200`):

```json
{
  "verdict": "malicious",
  "engine": "ClamAV",
  "engineVersion": "ClamAV 1.x/...",
  "scannedAt": "2026-08-08T12:00:00.000Z",
  "threats": ["Win.Test.EICAR_HDB-1"]
}
```

Gateway/configuration/ClamAV failure responses use a non-2xx status and a generic JSON error. They never return file bytes, filenames, tokens, stack traces, or raw `clamd` output.

## ClassLoop Finalization Flow

1. Require a current Supabase teacher and apply existing IP/user limits.
2. Verify the signed upload receipt and Filestack metadata.
3. Create a 60-second handle-scoped read policy and download the object with redirects disabled, an 8-second timeout, a bounded content length, and a hard 10 MB read cap.
4. POST the bytes to `CLASSLOOP_MALWARE_SCANNER_URL` with `CLASSLOOP_MALWARE_SCANNER_TOKEN`, redirects disabled, and a 20-second timeout.
5. Validate the complete scanner response schema. Reject unknown verdicts, missing timestamps, non-ClamAV engines, stale/future timestamps, oversized responses, timeouts, or non-2xx responses.
6. On `malicious`, attempt a signed Filestack delete, return a neutral detection message, and never issue a read URL.
7. On scanner failure, fail closed and attempt the same cleanup. A cleanup failure does not weaken the block; it remains an operational orphan to remove from Filestack.
8. On `clean`, create the five-year handle-scoped read URL and return a time-bounded scan receipt alongside the resource.

## Release And Configuration

Required server-only variables:

- `CLASSLOOP_MALWARE_SCANNER_URL` — exact HTTPS `/scan` endpoint; loopback HTTP is accepted only outside production for local Docker verification.
- `CLASSLOOP_MALWARE_SCANNER_TOKEN` — random bearer token shared only between ClassLoop and the gateway.
- existing `FILESTACK_API_KEY`, `FILESTACK_APP_SECRET`, and `FILESTACK_SECURITY_ENABLED=true`.

Gateway variables:

- `SCANNER_AUTH_TOKEN`
- `CLAMD_HOST=clamav`
- `CLAMD_PORT=3310`
- `PORT=8787`

`VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED` stays `false` until an authenticated clean EICAR-control workflow passes in the exact deployment: a harmless clean PDF is shared, the EICAR test file is blocked, scanner downtime is blocked, and no rejected file produces a readable URL.

## User Experience

The upload control says files are scanned with ClamAV before sharing. During finalization it shows “Scanning with ClamAV…”. Success copy says “No malware was detected by ClamAV at `<time>`; resource added.” Detection copy says the file was blocked and not shared. Errors say scanning could not be completed and the file was not shared.

No copy claims that a scanner proves a file is virus-free. A clean verdict means only that the configured ClamAV engine did not detect malware at the recorded scan time.

## Verification

- Unit-test INSTREAM framing and clean/malicious/error parsing against a fake TCP server.
- Integration-test ClassLoop finalization ordering, clean receipt validation, malicious blocking, stale/invalid verdict blocking, scanner timeout/failure blocking, download size enforcement, and best-effort Filestack deletion.
- Browser-test the scan-in-progress and clean receipt UI with mocked providers.
- Run the project security suite, upload/scanner tests, production build, scoped coverage gate, dependency audit, and `git diff --check`.
- Run Docker/EICAR only when Docker and fresh ClamAV definitions are locally available. Do not call a mocked result live proof.

