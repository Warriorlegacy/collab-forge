# CollabForge Deployment Guide

## Prerequisites

- Cloudflare account with Wrangler CLI authenticated: `wrangler login`
- Vercel account with CLI authenticated: `vercel login`
- Supabase project URL and service role key

---

## Step 1: Deploy Worker to Cloudflare

```bash
cd D:\Signhify\collab-forge\apps\worker

# Set secrets (run these one by one, paste your values when prompted)
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# Deploy
wrangler deploy
```

After deploy, you'll see output like:
```
Published collab-forge-worker (X.X sec)
  https://collab-forge-worker.your-username.workers.dev
```

**Copy this URL** — you'll need it for the web app.

---

## Step 2: Deploy Web App to Vercel

```bash
cd D:\Signhify\collab-forge\apps\web

# Link to Vercel project (first time only)
vercel link

# Set environment variable
vercel env add VITE_API_BASE production
# Paste your worker URL when prompted, e.g.:
# https://collab-forge-worker.your-username.workers.dev

# Deploy
vercel --prod
```

After deploy, Vercel gives you a production URL like:
```
https://collab-forge.vercel.app
```

---

## Step 3: Update WebSocket URL in Worker

The WebSocket endpoint is handled in `apps/worker/src/main.ts`. The current implementation uses a basic WebSocket upgrade. For production, you may want to:

1. Add a custom domain in Cloudflare dashboard
2. Update `wrangler.toml` with `routes` if using a custom domain

---

## Step 4: Test the Deployment

1. Open your Vercel URL
2. Type a prompt in the textarea
3. Click "Run Pipeline"
4. You should see live events in the right panel

If the worker is unreachable, the client falls back to local mock events — the demo still works.

---

## Environment Variables Summary

| Variable | Where | Value |
|----------|-------|-------|
| `SUPABASE_URL` | Cloudflare secret | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Cloudflare secret | Your Supabase service role key |
| `VITE_API_BASE` | Vercel env | `https://collab-forge-worker.your-username.workers.dev` |

---

## Post-Deployment

1. Update `docs/resume.md` with the live URLs
2. Update LinkedIn featured links with the Vercel URL
3. Record a 60-second demo of the live event stream
4. Post on LinkedIn: "CollabForge is now live — a real-time collaborative AI agent IDE with DAG execution and event-sourced state"
