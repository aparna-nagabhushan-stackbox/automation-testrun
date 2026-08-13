# StackTest

A Stackbox dashboard for tracking Playwright automation test results (YMS / YMSOUTBOUND), with a small Node backend for real user accounts.

`index.html` is the entire frontend (markup, styles, script — no build step). `server/` is a small Express backend that handles login, so accounts are real (bcrypt-hashed passwords, httpOnly session cookies) instead of a plaintext list baked into the page.

## Running it locally

```bash
npm install
cp .env.example .env      # then edit .env — see below
npm start
```

Open **http://localhost:3000** (do **not** open `index.html` directly as a file — login won't work without the server).

### `.env` setup

- `JWT_SECRET` — required. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `ALLOWED_DOMAIN` — only emails ending in this can be invited or bootstrap the first admin. Defaults to `@stackbox.xyz`.

The **first person** to open the app and submit the form becomes the first **admin** account (no invite needed for that one). Every account after that must be invited by an admin from the **Admin** page in the sidebar — there is no open signup.

## How accounts work

- Admin generates an invite (or a password-reset link) for a `@stackbox.xyz` email from the **Admin** page, and copies the link to send them (Slack/email/Teams — sending isn't automated).
- Recipient opens the link, sets their password, and is logged in immediately.
- Regular login afterwards is just email + password.
- All accounts and invite records live in `server/data/*.json` (gitignored — see the persistence warning in **Deploying** below).

## Deploying so your company can actually use it

See **[DEPLOYING.md](DEPLOYING.md)** for a step-by-step guide to putting this on a real URL (Render.com free tier), so it works for anyone with a `@stackbox.xyz` email from any device — not just on your own machine.

## Regression testing

```bash
npm run install-browser   # one-time: downloads a headless Chromium for Playwright
npm test
```

Spins up the backend on a throwaway port + temp data directory, bootstraps an admin, exercises the dashboard and Admin panel, and fails loudly on any JS error. Screenshots land in `tests/screenshots/`. Doesn't touch your real `server/data/`.

## AI Recorder — Claude-backed insights

Both AI Recorder modes (in-tab bookmarklet and Playwright-codegen "new window") now also ask Claude to turn the recording into plain-English steps with confidence flags, a plain-English summary, cleaned code, and masked test data. Flows that don't match an existing block, or that have a low-confidence locator, land in a pending review queue — an admin can approve them as one-off tests or promote them into a locked, reusable block. See [AI-RECORDER-BUILD-SPEC.md](AI-RECORDER-BUILD-SPEC.md) for the full design and `docs/superpowers/plans/2026-08-13-ai-recorder-enhancements.md` for the implementation plan.

Requires `ANTHROPIC_API_KEY` in `.env` — get one from [console.anthropic.com](https://console.anthropic.com/).

## Structure

- `index.html` — the entire frontend
- `server/` — Express backend (auth, invites, JSON-file storage)
- `tests/verify-dashboard.ts` — Playwright regression check
- `DEPLOYING.md` — how to put this on a real URL
