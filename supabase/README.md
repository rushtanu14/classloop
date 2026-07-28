# ClassLoop Supabase Auth Setup

Use these settings when Supabase Auth email confirmation is enabled for ClassLoop cloud accounts.

## Redirect URLs

In Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: `https://classloop-followup.vercel.app`
- Redirect URL allow list:
  - `https://classloop-followup.vercel.app/#/billing?cloud=confirmed`
  - `https://classloop-followup.vercel.app/#/dashboard?cloud=confirmed`
  - `http://127.0.0.1:5177/#/billing?cloud=confirmed` for local Playwright/dev checks
  - `http://127.0.0.1:5177/#/dashboard?cloud=confirmed` for local Playwright/dev account confirmation
  - `http://localhost:5177/#/billing?cloud=confirmed` for local browser checks
  - `http://localhost:5177/#/dashboard?cloud=confirmed` for local browser account confirmation

Billing confirmation uses the billing route. New-account signup, confirmation
resends, and account-email changes use the dashboard route. If a custom or
preview origin is configured through `VITE_CLASSLOOP_PUBLIC_URL`, add both of
those exact hash routes for that origin too.

If confirmation links open the wrong page or fail after clicking, the redirect URL is usually missing from this allow list. Supabase also recommends disabling email-link tracking in any external email provider because rewritten links can break auth verification.

## Confirm Signup Email

Paste `supabase/email-templates/confirm-signup.html` into Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup.

The template tells Pro users what the email is for, how to return to ClassLoop, and what to do if the link does not open correctly.

## Apply the schema

Run `supabase/schema.sql` in the SQL editor after every schema update. The script is idempotent and now:

- removes legacy `accounts` and `billingProfile` fields from cloud workspace snapshots;
- rejects future direct database writes containing either of those top-level fields;
- routes all cloud workspace inserts and updates through the authenticated `/api/cloud-state` service-role boundary;
- supports teacher, student, and individual profiles;
- creates RLS-protected classes, memberships, publications, publication versions, and submissions;
- permits students to create or update submissions only while they remain student members of the publication's class;
- reserves the reviewed submission state and review timestamp for the class teacher;
- leaves hosted recap email disabled for every profile by default.

Local account password hashes and billing entitlements must never be copied into `classloop_workspace_state`.
Authenticated clients cannot directly create profile rows and may update only
the `no_training_on_student_data` privacy preference on their own existing
profile. Role, billing, Stripe, subscription, and hosted-email-delivery columns
remain server-owned and are changed only by service-role APIs, verified
webhooks, or an administrator.

## Grant hosted recap email

The shared SMTP/Gmail sender is a controlled-pilot capability. After verifying the teacher and school authorization, an administrator may enable one profile in the SQL editor:

```sql
update public.classloop_profiles
set email_delivery_enabled = true,
    updated_at = now()
where email = 'verified-teacher@example.com'
  and role = 'teacher';
```

The API also requires a confirmed Supabase email and verifies that the authenticated email owns the published session. Disabling the flag immediately blocks future hosted sends.
