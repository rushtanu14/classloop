# ClassLoop Supabase Auth Setup

Use these settings when Supabase Auth email confirmation is enabled for ClassLoop cloud accounts.

## Redirect URLs

In Supabase Dashboard -> Authentication -> URL Configuration:

- Site URL: `https://classloop-followup.vercel.app`
- Redirect URL allow list:
  - `https://classloop-followup.vercel.app/#/billing?cloud=confirmed`
  - `http://127.0.0.1:5177/#/billing?cloud=confirmed` for local Playwright/dev checks
  - `http://localhost:5177/#/billing?cloud=confirmed` for local browser checks

If confirmation links open the wrong page or fail after clicking, the redirect URL is usually missing from this allow list. Supabase also recommends disabling email-link tracking in any external email provider because rewritten links can break auth verification.

## Confirm Signup Email

Paste `supabase/email-templates/confirm-signup.html` into Supabase Dashboard -> Authentication -> Email Templates -> Confirm signup.

The template tells Pro users what the email is for, how to return to ClassLoop, and what to do if the link does not open correctly.
