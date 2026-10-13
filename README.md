# Fitness Central

Mobile-first web app: sign in with Google, connect Strava, join a group (max 10), and watch everyone's weekly distance on a side-scrolling landscape.

Stack: Next.js 15 (App Router, TypeScript) + Supabase (Google auth, Postgres with row level security) + Strava API.

`demo/preview.html` is a static mock of the main screen with sample data. Open it in any browser.

## Read this first: Strava's rules

Strava's API policy (section 2.3) says an app may display a user's Strava data only to that user, not to other users. A group leaderboard shows each friend's distance to the others, which is exactly what that clause restricts. Strava has been stalling apps with leaderboards in review. New Strava apps also start at 1 athlete, and you can self-upgrade to 10 without review. Anything larger needs Strava's approval.

What this means for you:
- A group of up to 10 friends fits the self-service limit, so you can build and test the whole thing today.
- Before inviting people beyond your own circle, read https://www.strava.com/legal/api_policy and ask Strava (or the developer community hub) whether a private, opt-in group is allowed. I can't promise it is.
- The `activities` table has a `source` column and the UI never touches Strava directly, so you can add another data source later (manual entry, Apple Health through a native wrapper, Garmin) without redesigning anything.
- Follow Strava's brand rules: "Connect with Strava" button, "Powered by Strava" logo, and a link back to Strava where you show their data.

## Setup

1. **Supabase**: create a project. SQL editor: run `supabase/migrations/001_init.sql`, then `002_consent.sql`.
2. **Google login**: Google Cloud Console > APIs & Services > Credentials > OAuth client (Web). Add Supabase's callback URL (shown in Supabase > Authentication > Providers > Google) as an authorized redirect URI. Paste the client ID and secret into Supabase.
3. **Supabase URL config**: Authentication > URL Configuration. Set Site URL to your app URL and add `http://localhost:3000/auth/callback` plus your deployed `/auth/callback` to Redirect URLs.
4. **Strava**: https://www.strava.com/settings/api > create an app. Authorization Callback Domain: `localhost` for local work, your real domain once deployed.
5. `cp .env.example .env.local` and fill it in. Never commit it.
6. `npm install && npm run dev`, then open http://localhost:3000.

## Webhook (so runs appear within seconds)

Needs a public HTTPS URL (deploy first, or use a tunnel). Run once:

```
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_ID -F client_secret=YOUR_SECRET \
  -F callback_url=https://YOUR-DOMAIN/api/strava/webhook \
  -F verify_token=YOUR_STRAVA_WEBHOOK_VERIFY_TOKEN
```

Without it the app still works: opening the app triggers a sync if the last one is over 10 minutes old, and History has a Sync button.

## Testing on an iPhone

- Laptop: browser dev tools > device toolbar > iPhone.
- Real phone, easiest: deploy to Vercel (set the same env vars, update the Supabase and Strava URLs) and open the link on the phone.
- Real phone on your Wi-Fi: `npm run dev` already listens on your network, but Strava and Google callbacks are fussy about LAN IPs, so a tunnel (Cloudflare Tunnel, ngrok) is smoother.
- On iPhone Safari: Share > Add to Home Screen gives a full-screen app feel.

## How security works

- Row level security is on for every table. The browser can only read its own profile, activities and Strava link, plus groups and members for groups it belongs to. Table grants are stripped to the minimum.
- Strava tokens live in `strava_tokens`, which has no policies and no grants. Only server code using the service role key can read them. That key is never sent to the browser.
- Members see each other's weekly and overall totals (via `group_standings`), never individual activities.
- Creating, joining and leaving groups happen in SECURITY DEFINER functions that check `auth.uid()`. The 10-member cap is enforced in the database under a row lock, so two people can't squeeze in at once.
- Group codes are 6 characters from a 32-character alphabet, and lookups are rate limited to 15 per 10 minutes per user.
- The Strava OAuth flow uses a random `state` cookie. Webhook payloads are never trusted: they only trigger a re-fetch from Strava using the athlete's own token. If an athlete revokes access, their Strava data and tokens are deleted.
- Security headers are set in `next.config.js`.

Worth adding before real launch: a Content-Security-Policy, Supabase Vault for token encryption at rest, and bot protection on sign-in.

## Consent

New users must tick an agreement (their weekly and overall distance is shown to their group) before connecting Strava or joining a group. The database also refuses group creation and joining without it. Members can withdraw from the Group tab, which removes them from their group. Edit the wording in `src/app/consent/page.tsx` and bump `CONSENT_VERSION` in `src/lib/consent.ts` to ask everyone again.

## Design notes

- Weeks run Monday to Monday in the group creator's time zone, so the landscape "resets" at the right moment for them.
- The track shows 10 km on screen at first (more on wide screens) and holds 50 km. Distances past 50 km pin at the finish flag.
- Overall leaderboard counts each member's distance since they joined.

## Your roadmap, and what to change

- **Multiple groups per user**: drop the `one_group_per_user` constraint, add a group switcher on the Race page, and pass the chosen `group_id` to the same functions. Nothing else in the schema needs to change.
- **Group chat**: a `messages` table (`group_id`, `user_id`, `body`, `created_at`) with an RLS policy using `is_group_member(group_id)`, and Supabase Realtime for live updates.
- **Schedules**: an `events` table (`group_id`, `activity`, `starts_at`, `place`, `created_by`) plus `event_rsvps` (`event_id`, `user_id`). Posting one inserts a chat message of type `event`, and the Join button inserts an RSVP.
# fitness-central
