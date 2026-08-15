# ClassLoop Python Migration Plan Index

The approved migration is split into eight independently verifiable plans. Execute them in order because each plan consumes interfaces from the preceding plan.

1. [Python Foundation and Parser Parity](2026-08-14-python-foundation-parser-parity.md)
2. [React API Boundary and Draft Cutover](2026-08-14-react-api-draft-cutover.md)
3. [Local Workspace and Desktop Runtime](2026-08-14-local-workspace-desktop-runtime.md)
4. [Hosted Identity and Cloud Workspace](2026-08-14-hosted-identity-cloud-workspace.md)
5. [Python Product Services](2026-08-14-python-product-services.md)
6. [Python Billing and Entitlements](2026-08-14-python-billing-entitlements.md)
7. [Frontend Decomposition and Legacy Removal](2026-08-14-frontend-decomposition-legacy-removal.md)
8. [Packaging and Release Parity](2026-08-14-packaging-release-parity.md)

The branch stays runnable after every plan. Legacy code is removed only after its Python replacement passes focused contract tests and the relevant browser journey.
