# TableShare Portals (Admin + Restaurant)

Static HTML/JS/CSS for the login and dashboards at **tableshare.pixelcheese.com**. The backend serves these files from `portals/` when you run the API server.

## How to update the portal

### Option A: Backend runs from this repo on the server (e.g. git clone)

1. On your machine, commit and push your portal changes.
2. On the server:
   ```bash
   cd /opt/tableshare-backend   # or wherever the app lives
   git pull
   pm2 restart tableshare-api   # or however you run the Node app
   ```
   The server will now serve the updated files from `portals/`.

### Option B: Upload only the portal files (no git on server)

From your Mac, inside **tableshare-backend**:

```bash
bash deploy-portals.sh
```

That copies `portals/*` to the server at `/opt/tableshare-backend/portals/`. Then restart the backend on the server (e.g. `pm2 restart tableshare-api`) so it picks up the new files.

Override server or path if needed:
```bash
PORTALS_SERVER="root@your-server" bash deploy-portals.sh
PORTALS_REMOTE_DIR="/opt/tableshare-backend/portals" bash deploy-portals.sh
```

### Local testing

Run the backend from **tableshare-backend** (e.g. `npm run start` or `node src/server.js`). The portal is served at the same host (e.g. http://localhost:3000). No separate deploy step.
