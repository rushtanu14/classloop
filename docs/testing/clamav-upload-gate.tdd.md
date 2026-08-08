# ClamAV Upload Gate TDD Evidence

## Journey

As an authenticated teacher, I can upload an explicitly class-shareable PDF or text resource, but ClassLoop issues a share URL only after its private ClamAV service returns a fresh clean receipt. Malware, stale definitions, malformed receipts, download failures, and scanner outages fail closed and trigger best-effort deletion of the Filestack object.

## RED and GREEN

| Behavior | RED evidence | GREEN evidence | Guarantee |
|---|---|---|---|
| ClamAV protocol and gateway | `node tests/clamav-scanner.test.mjs` failed with `ERR_MODULE_NOT_FOUND` for `services/clamav-scanner/server.mjs`. | `node tests/clamav-scanner.test.mjs` passed with `ClamAV scanner gateway tests passed.` | Exact bounded INSTREAM framing, clean/malicious/error parsing, fresh-signature validation, bearer auth, request limits, rate limiting, and generic server failures. |
| Filestack scan gate | `node tests/file-uploads.test.mjs` failed at the new missing-scanner assertion because sessions still opened without a scanner. | `node tests/file-uploads.test.mjs` passed with `Filestack resource upload tests passed.` | Metadata verification precedes a 60-second private download; a clean receipt precedes long read-link creation; malware, stale receipts, and outages return no URL and attempt deletion. |
| Teacher receipt UX | The focused Playwright test failed because the UI still said only that the file uploaded and did not show the ClamAV result. | `node scripts/run-playwright.cjs tests/browser/file-uploads.spec.ts --project=chromium` passed `1/1`. | The finalized response must contain a clean ClamAV receipt, and the teacher sees point-in-time “No malware was detected” copy. |
| Container portability | The first Compose start failed on Apple silicon with `no matching manifest for linux/arm64/v8` for the official ClamAV image. | Compose now pins the ClamAV service to `linux/amd64`, which Docker Desktop can emulate on Apple silicon. | The topology starts consistently on the development Mac and native AMD64 deployment hosts without exposing port 3310. |
| Local port isolation | The first host health request on 8787 reached an unrelated existing local service. | Compose now supports `SCANNER_HOST_PORT`; verification uses isolated port 18787 while the container still listens on 8787. | Deployment and local proofs do not need to replace or disrupt another service bound to the default port. |
| Fresh first start | The full image started `clamd` on bundled signatures from August 2 while `freshclam` updated asynchronously, so the gateway correctly returned 503 for definitions older than 48 hours. | Compose now uses the official `1.5.3_base` image, which blocks for the initial database download on a new persistent volume before starting `clamd`. | A new deployment cannot become ready on stale bundled signatures; the gateway independently enforces the 48-hour ceiling afterward. |

## Verification targets

- Scanner protocol/gateway: `npm run test:malware-scanner`
- Upload integration: `npm run test:file-uploads`
- Teacher browser journey: `node scripts/run-playwright.cjs tests/browser/file-uploads.spec.ts --project=chromium`
- Desktop and mobile browser journey: `node scripts/run-playwright.cjs tests/browser/file-uploads.spec.ts --workers=1` passed `2/2`.
- Repository security and build: `npm run test:security`, `npm run build`, `npm run audit:prod`, `git diff --check`

## Real local container proof

Docker Compose started a fresh named definitions volume with `clamav/clamav:1.5.3_base` under AMD64 emulation on Apple silicon. The base image downloaded daily version `28086` before `clamd` became healthy. On isolated host port 18787, health returned `200 ready ClamAV`, a harmless text payload returned `200 clean`, and the standard EICAR string returned `200 malicious`. Stopping the ClamAV container made the gateway return generic `503`; after restart it remained unready while signatures loaded, then recovered to `200 ready`. The verification containers, network, and definition volume were removed afterward.

## External proof gate

Unit and browser tests use fake ClamAV, Filestack, and Supabase boundaries. The public flag remains `VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false` until the exact hosted ClamAV gateway, Filestack account, and ClassLoop deployment pass clean-file, EICAR, scanner-outage, recovery, and final-read probes. A local or mocked pass is not production proof.
