# Hero Habits

Kids rewards and personal goal tracking for households — soft-launch ready with free-tier caps, admin controls, PWA notifications, and Stripe wiring for when you turn subscriptions on.

**Former name:** Reward System

---

## What it does

- **Participants / People** — Who earns points
- **Activities / Habits** — What earns points
- **Rewards / Goals** — Milestones to unlock
- **Share** — Invite co-managers (Pro seat limits)
- **Billing** — Free vs Pro limits; Stripe checkout when enabled
- **Admin** — Feature flags, grant Pro/trial, test accounts, prices

### Plan limits

| | Free | Pro / trial |
|--|------|-------------|
| Managers | 1 | 3 |
| Participants | 2 | 10 |
| Activities | 5 | 50 |
| Rewards/goals | 3 | 20 |

---

## Google sign-in

1. [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → Create **OAuth client ID** (Web application).
2. Authorized JavaScript origins: your app origins (e.g. `http://localhost:5173`, `https://shareinsk.github.io`).
3. Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Supabase Dashboard → Authentication → Providers → **Google** → paste Client ID + Secret → Enable.
5. Authentication → URL Configuration → add redirect URLs:
   - `http://localhost:5173/auth/callback`
   - `https://shareinsk.github.io/<repo>/auth/callback` (match your Pages URL)

The login screen includes **Continue with Google**. New Google users still get a household via the existing signup trigger.

New guilds start on a **15-day Pro trial** automatically. Pricing UI is gated by the `billing_pricing` feature flag (off by default). Stripe checkout stays behind `billing_checkout`.

---

## Setup

### 1. App env

Copy `.env.example` → `.env`:

```bash
PUBLIC_SUPABASE_URL=...
PUBLIC_SUPABASE_ANON_KEY=...
# Optional for Web Push client subscribe:
PUBLIC_VAPID_PUBLIC_KEY=...
```

### 2. Database

In the Supabase SQL editor, run migrations in order:

1. `supabase/schema.sql` (if new project)
2. `supabase/migration_households.sql`
3. `supabase/migration_settings.sql`
4. **`supabase/migration_herohabits.sql`** ← entitlements, flags, caps, admin RPCs
5. **`supabase/migration_auto_trial_pricing_flag.sql`** ← auto Pro trial + `billing_pricing` flag
6. `supabase/migration_google_oauth.sql` (if using Google sign-in)
7. **`supabase/migration_onboarding_guide.sql`** ← interactive new-user guide flag

Promote yourself to super admin:

```sql
update public.profiles
set app_role = 'super_admin'
where id = '<your-user-uuid>';
```

### 3. Edge Functions (optional until monetization)

```bash
supabase functions deploy create-checkout-session
supabase functions deploy create-portal-session
supabase functions deploy stripe-webhook
supabase functions deploy send-notifications
supabase functions deploy parse-points-log

supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set RESEND_API_KEY=...
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:feedback@herohabits.app
supabase secrets set NOTIFICATION_CRON_SECRET=long-random-string
```

Point a Stripe webhook to `.../functions/v1/stripe-webhook` for:
`checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed`.

Schedule `send-notifications` daily with header `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`.

In **Admin → Plan prices**, paste Stripe Price IDs for US (`$4.99`) and IN (`₹49`). Enable the `billing_checkout` feature flag when ready to charge.

### 4. Soft launch checklist

- [ ] Run `migration_herohabits.sql`
- [ ] Run `migration_auto_trial_pricing_flag.sql`
- [ ] Run `migration_onboarding_guide.sql`
- [ ] Set your `app_role` to `super_admin`
- [ ] Keep `billing_pricing` and `billing_checkout` **off** until ready to show prices / charge
- [ ] Share Privacy / Terms / Feedback links
- [ ] Install as PWA; enable push from Settings

```bash
npm install
npm run dev
```

---

## Dual experience

Signup and Settings choose **Kids rewards** or **Goal tracking**. Same backend (`grand_rewards`, etc.); labels and theme tokens change.

---

## Stack

SvelteKit (static / GitHub Pages) · Supabase Auth + Postgres + Edge Functions · Stripe · PWA (vite-pwa)
