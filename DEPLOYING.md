# Deploying StackTest

Goal: get this on a real URL so anyone at Stackbox can open it, get invited, and log in from their own device — not just from your machine.

This guide uses **Render** because it needs no company IT involvement and its free tier covers a small internal tool like this. The steps are generic enough to adapt to Railway, Fly.io, or a company VM if you'd rather use one of those.

## ⚠️ Read this before you deploy

Accounts and invites are stored as JSON files on disk (`server/data/`), not a hosted database. That's fine for a small team, **but**: most hosting free tiers wipe the filesystem on every redeploy. If that happens here, **everyone's accounts get deleted** every time you ship a change.

You have two options:

1. **Attach a persistent disk** to the service and point `DATA_DIR` at it (covered below). Render's persistent disks require a paid instance tier — check current pricing when you sign up, since this changes over time.
2. **Accept the risk for now** — fine while you're the only real user / still testing. Just know that pushing an update could wipe every account, including your own admin one, and you'd need to re-bootstrap.

If this dashboard becomes something the whole company actually relies on, the right long-term fix is swapping the JSON-file storage in `server/db.js` for a real hosted database (Postgres, etc.) — the rest of the backend doesn't need to change, since everything else already calls through that one module.

## 1. Push this repo to GitHub

```bash
cd stacktest
git add -A
git commit -m "Add real user accounts and invite system"
```

Create a new repo on GitHub (github.com → New repository → don't initialize with a README, you already have one), then:

```bash
git remote add origin https://github.com/<your-username>/stacktest.git
git branch -M main
git push -u origin main
```

## 2. Create the Render service

1. Go to [render.com](https://render.com) and sign up / log in (GitHub login is easiest — it'll let Render see your repos).
2. **New → Web Service** → connect the `stacktest` repo you just pushed.
3. Settings:
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance type**: free is fine to start, but see the disk warning above if you want accounts to survive redeploys.
4. **Environment variables** (Render's dashboard → your service → Environment):
   | Key | Value |
   |---|---|
   | `JWT_SECRET` | a long random string — generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and paste the output |
   | `ALLOWED_DOMAIN` | `@stackbox.xyz` |
   | `NODE_ENV` | `production` |

   Do **not** set `PORT` — Render sets that for you automatically.

5. (Optional, recommended once you're past testing) **Add a persistent disk**: Render dashboard → your service → Disks → Add Disk. Mount it at `/data`, then add an env var `DATA_DIR=/data` so `server/db.js` writes there instead of the ephemeral app directory.

6. Click **Create Web Service**. Render will build and deploy — takes a few minutes on the first run.

## 3. First login

Once it's live, open the URL Render gives you (something like `https://stacktest-xxxx.onrender.com`). You'll see **"Create the first admin account"** — that's expected, since there are no users yet on this fresh deployment. Sign up with your own `@stackbox.xyz` email; you become the first admin.

From there, use the **Admin** page in the sidebar to generate invite links for the rest of the company and share them (Slack, Teams, email — whichever, since sending isn't automated).

## 4. Shipping future changes

```bash
git add -A
git commit -m "..."
git push
```

Render auto-deploys on every push to `main` (unless you turned that off). If you didn't attach a persistent disk, remember: this wipes existing accounts, so redeploy at low-traffic times and expect to re-share invite links afterward.
