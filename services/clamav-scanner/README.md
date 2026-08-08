# ClassLoop ClamAV scanner gateway

This service scans a file with a private ClamAV daemon before ClassLoop returns a shareable Filestack URL. It is free and self-hosted. Files are streamed only between ClassLoop, this gateway, and ClamAV; they are not submitted to a public malware corpus.

## Security boundary

- Publish the gateway only through an HTTPS reverse proxy or private service network.
- Never expose ClamAV port `3310` to the internet. The Compose file keeps it on the private container network.
- Use a unique random `SCANNER_AUTH_TOKEN` of at least 32 characters. Configure the same value as `CLASSLOOP_MALWARE_SCANNER_TOKEN` in the ClassLoop backend.
- Keep `VITE_CLASSLOOP_FILESTACK_UPLOAD_ENABLED=false` until clean-file, EICAR, and scanner-outage probes pass against the exact deployment.
- Persist `/var/lib/clamav` so `freshclam` definitions survive restarts. The official `_base` image performs a blocking initial database download on a new volume before starting `clamd`; the gateway still rejects definitions older than 48 hours.
- Budget at least 4 GB RAM for ClamAV, following the official container guidance.
- The official ClamAV image currently publishes AMD64 only. Compose pins `linux/amd64`; Docker Desktop can emulate it on Apple silicon, while an AMD64 Linux host runs it natively.

## Local start

Create an untracked environment file next to this README:

```dotenv
SCANNER_AUTH_TOKEN=replace-with-a-random-value-at-least-32-characters
```

Then run:

```bash
docker compose --env-file .env.scanner up --build -d
curl --fail http://127.0.0.1:8787/health
```

The default bind is loopback-only. If port 8787 is already in use, set `SCANNER_HOST_PORT` in `.env.scanner` and use that port instead. Put Caddy, nginx, or another TLS proxy on the same host and forward a dedicated HTTPS hostname to the chosen loopback port. Do not log request bodies or the authorization header.

## ClassLoop server settings

```dotenv
CLASSLOOP_MALWARE_SCANNER_URL=https://scanner.example.com/scan
CLASSLOOP_MALWARE_SCANNER_TOKEN=the-same-private-random-token
```

These values are server-only. Do not prefix them with `VITE_`.

## Release probes

Use only harmless test artifacts and a non-production Filestack folder/account:

1. Upload a small clean PDF and confirm finalization returns a `clean` ClamAV receipt.
2. Upload the standard EICAR antivirus test file and confirm ClassLoop returns HTTP 422, no share URL, and attempts Filestack deletion.
3. Stop the scanner and confirm ClassLoop returns HTTP 502, no share URL, and attempts deletion.
4. Start it again, confirm `/health` reports fresh signatures, then repeat the clean probe.

ClamAV detection is a point-in-time safety check, not proof that a file is permanently “virus-free.”
