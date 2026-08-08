# Filestack Shareable Resource Uploads

## Product boundary

This optional integration is only for a teacher-selected file that is already intended for the whole class. It must never receive transcripts, rosters, private notes, student submissions, accommodation records, grades, or other personal classroom data.

ClassLoop accepts PDF, TXT, and Markdown files up to 10 MB. Transcript and roster file inputs remain local and do not use Filestack.

## Why Filestack is gated

Filestack's current free plan is useful for bounded prototypes, but its official security guidance says uploads and delivery are unauthenticated by default. The ClassLoop endpoint therefore fails closed unless all three server-only variables are present and the administrator has explicitly acknowledged that Filestack Security is enabled:

```bash
FILESTACK_API_KEY=
FILESTACK_APP_SECRET=
FILESTACK_SECURITY_ENABLED=true
CLASSLOOP_MALWARE_SCANNER_URL=https://scanner.example.com/scan
CLASSLOOP_MALWARE_SCANNER_TOKEN=replace-with-a-private-random-value-at-least-32-characters
VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false
```

Also configure Supabase, because the upload-session and finalization endpoints require a current server-verified teacher account. Never place `FILESTACK_APP_SECRET` in a `VITE_*` variable.

In the Filestack Developer Portal:

1. Enable Security for the application.
2. Add the production and approved development origins to the upload/delivery domain allowlists as defense in depth.
3. Set quota alerts and monitor the free allowance.
4. Keep the application secret only in the hosting provider's server environment or an ignored local secret file.

Deploy the free self-hosted gateway from [`services/clamav-scanner`](../services/clamav-scanner/README.md) behind HTTPS. Leave `VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false` until clean-file, standard EICAR, scanner-outage, and signed-link read probes succeed in that exact deployment. Set it to `true` and rebuild only after that release proof; this flag contains no credential and only controls product visibility.

## Implemented flow

1. The teacher confirms the file is already student-shareable.
2. `/api/file-uploads/session` verifies the Supabase user and teacher profile, applies IP and user rate limits, and creates a five-minute HMAC-SHA256 policy limited to `pick` and `store`, with a 10 MB maximum.
3. The browser uploads the one approved file directly to Filestack over HTTPS. The app secret never reaches the browser.
4. `/api/file-uploads/finalize` verifies a teacher-bound signed receipt and provider metadata, downloads the file through a 60-second handle-scoped read policy, and sends only those bounded bytes to the authenticated private ClamAV gateway.
5. ClassLoop accepts only a fresh, structurally valid `clean` receipt. Malware, stale signatures, invalid receipts, timeouts, and outages fail closed without a share URL and trigger a best-effort Filestack deletion.
6. Only after the clean receipt does ClassLoop return the five-year handle-scoped read URL. The UI records the scan time and says that no malware was detected at that time; it does not call the file “virus-free.”
7. The teacher still reviews the resulting resource title, URL, and topic in the normal draft before publishing.

The read URL is intentionally shareable and is valid for five years. It grants read access to that one handle only. Rotating the Filestack app secret invalidates existing signed links; replace affected draft/published resource URLs after rotation.

## Free scanner decision

ClassLoop now uses a self-hosted ClamAV daemon plus a small authenticated Node gateway. The official `_base` container downloads current definitions before its first `clamd` startup on a new persistent volume, then runs `freshclam`; the Compose configuration keeps port 3310 private, budgets 4 GB memory, and rejects signatures older than 48 hours. The gateway accepts only bounded `application/octet-stream` requests with a private bearer token.

VirusTotal remains excluded. As verified against official documentation on 2026-08-06:

- the free Public API is limited to 500 requests per day and 4 requests per minute, must not be used in commercial products or services, and must not substitute for antivirus;
- a standard VirusTotal scan provides partner antivirus verdicts, but the submitted file becomes part of VirusTotal's shared threat corpus;
- paid Private Scanning keeps a file within the organization and deletes it after a configured retention period, but explicitly omits the multi-antivirus partner verdicts requested for this gate; and
- no `VIRUSTOTAL_API_KEY` or private-scanning credential is registered in the CSB credential registry.

That combination cannot safely or lawfully satisfy “scan every classroom upload before sharing.” ClassLoop must also avoid claiming that any scanner can prove a file is virus-free: an acceptable release receipt should say that no configured engine detected malware at the recorded scan time.

The scanner path is implemented locally, but the public release flag must remain false until the exact hosted gateway and Filestack deployment pass the release probes. Local code and mocked tests are not live deployment proof.

Filestack's own Virus Detection Workflow is designed for upload gating and quarantine, but its current pricing lists it as a paid `$49/month` add-on. It was not silently substituted because ClassLoop is free-first and the user requested VirusTotal specifically.

## Mailboxlayer decision

Mailboxlayer is not enabled. As verified on 2026-08-06, its official pricing and FAQ state that the free plan provides 100 monthly requests but reserves 256-bit HTTPS for paid customers. Email addresses and API credentials must not be sent over plaintext HTTP. ClassLoop already rejects malformed addresses locally before provider calls and uses Supabase confirmation to prove inbox ownership, which is the stronger account gate.

Reconsider Mailboxlayer only if all of these are true:

- the selected plan supports HTTPS;
- a concrete deliverability workflow exists beyond syntax and ownership confirmation;
- requests are server-only, explicit, rate-limited, and never run across a roster automatically;
- school/privacy review approves sending the relevant email address to the provider.

## Official references checked 2026-08-06

- [Filestack security policies](https://www.filestack.com/docs/security/policies/)
- [Filestack security best practices](https://www.filestack.com/docs/tutorials/security-best-practices/)
- [Filestack File API](https://www.filestack.com/docs/api/file/)
- [Filestack pricing](https://www.filestack.com/pricing/)
- [Mailboxlayer pricing and FAQ](https://mailboxlayer.com/pricing)
- [VirusTotal Public vs Premium API](https://docs.virustotal.com/reference/public-vs-premium-api)
- [VirusTotal API overview](https://docs.virustotal.com/docs/api-overview)
- [VirusTotal Private Scanning](https://docs.virustotal.com/docs/private-scanning)
- [VirusTotal standard file corpus](https://docs.virustotal.com/docs/how-it-works)
- [ClamAV documentation](https://docs.clamav.net/)
- [ClamAV official Docker image guidance](https://docs.clamav.net/manual/Installing/Docker.html)
- [ClamAV signature management](https://docs.clamav.net/manual/Usage/SignatureManagement.html)

Reverify provider pricing, terms, endpoints, and security behavior before production enablement.
