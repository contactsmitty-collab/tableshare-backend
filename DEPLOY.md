# TableShare Backend – Deploy from GitHub

## One-time: Put the backend on GitHub

1. **Create a new repo on GitHub**  
   - Go to [github.com/new](https://github.com/new).  
   - Name it e.g. `tableshare-backend`.  
   - Don’t add a README or .gitignore (you already have them).  
   - Create the repo.

2. **From your Mac, in the backend folder:**

   ```bash
   cd /Users/christophersmith/Desktop/TableShare/tableshare-backend
   git init
   git add .
   git commit -m "Initial commit: TableShare API"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/tableshare-backend.git
   git push -u origin main
   ```

   Replace `YOUR_USERNAME` with your GitHub username (or org, e.g. `contactsmitty-collab`).

3. **Secrets**  
   `.env` and `.env.*` are in `.gitignore` and are **not** pushed. Keep them only on your Mac and on the server.

---

## One-time: Set up the server to run from GitHub

1. **SSH in:**

   ```bash
   ssh root@165.227.179.81
   ```

2. **Clone the repo** (only once):

   ```bash
   cd /opt
   # If you already have code there, back it up then replace with clone:
   # mv tableshare-backend tableshare-backend.bak
   git clone https://github.com/YOUR_USERNAME/tableshare-backend.git
   cd tableshare-backend
   ```

3. **Install dependencies:**

   ```bash
   npm install --production
   ```

4. **Configure environment:**

   ```bash
   nano .env
   ```

   Add at least:

   - `DATABASE_URL` – Postgres connection string  
   - `JWT_SECRET`  
   - `PORT` (e.g. 3000)  
   - Any API keys (Google, OpenAI, etc.) you use in production  

   Save and exit.

5. **Start with PM2:**

   ```bash
   pm2 start src/server.js --name tableshare-api
   pm2 save
   pm2 startup   # follow the command it prints so it restarts on reboot
   ```

6. **Run migrations** (if needed):

   ```bash
   node scripts/run-migrations.js
   ```

---

## Every time you want to deploy (after pushing to GitHub)

On the server:

```bash
ssh root@165.227.179.81
cd /opt/tableshare-backend
git pull origin main
npm install --production
pm2 restart tableshare-api
```

If you add new migrations, run:

```bash
node scripts/run-migrations.js
```

---

## Optional: deploy script on the server

Create `/opt/tableshare-backend/deploy.sh` on the server:

```bash
#!/bin/bash
set -e
cd /opt/tableshare-backend
git pull origin main
npm install --production
pm2 restart tableshare-api
echo "Deploy done."
```

Then:

```bash
chmod +x /opt/tableshare-backend/deploy.sh
```

After that you can deploy with:

```bash
ssh root@165.227.179.81 '/opt/tableshare-backend/deploy.sh'
```

---

## Summary

| Step | Where | Action |
|------|--------|--------|
| 1 | GitHub | Create repo `tableshare-backend` |
| 2 | Mac | `git init`, add, commit, push from backend folder |
| 3 | Server | Clone repo to `/opt/tableshare-backend`, add `.env`, `npm install`, `pm2 start` |
| 4 | Later | Push from Mac → on server: `git pull`, `npm install`, `pm2 restart tableshare-api` |

**Seed test users:** On the server run `node scripts/seed-test-users-and-features.js`. Log in with alice@test.tableshare.app (or bob, carol, dave, eve); password `Test123!`.

You no longer need to keep the backend “only locally” – the source of truth is GitHub; the server always pulls from there.
