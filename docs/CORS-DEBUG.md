# CORS Debugging for admin.tableshare.ai

If the portal at admin.tableshare.ai shows "Failed to fetch" when calling the API at tableshare.pixelcheese.com, follow these steps.

## 1. Test CORS from browser console

1. Open **admin.tableshare.ai** in Chrome (incognito).
2. Open DevTools (F12) → **Console** tab.
3. Run:
   ```javascript
   fetch('https://tableshare.pixelcheese.com/api/v1/cors-test', { credentials: 'include' })
     .then(r => r.json())
     .then(console.log)
     .catch(console.error);
   ```
4. Check the result:
   - **Success** (`{ ok: true, ... }`) → CORS works; the issue may be with the auth or specific endpoints.
   - **CORS error** in console → Backend CORS config or proxy is wrong.
   - **Network error** / **Failed to fetch** → Request may not be reaching the server (DNS, firewall, proxy).

## 2. Check Network tab

1. Open DevTools → **Network** tab.
2. Try to log in (or trigger the failing request).
3. Find the failed request (red).
4. Click it and check:
   - **Status**: 0 or (failed) often means CORS or network.
   - **Headers** → **Response Headers**: Look for `Access-Control-Allow-Origin`. It should be `https://admin.tableshare.ai`.
   - If it's a **preflight** (OPTIONS): Does it get 204/200? Are CORS headers present?

## 3. Check server logs

On the server (e.g. `pm2 logs tableshare-api` or `journalctl -u tableshare-api`):

- When you try from admin.tableshare.ai, you should see:
  ```
  [CORS] OPTIONS /api/v1/auth/login Origin: https://admin.tableshare.ai Allowed: true
  ```
- If you **don't** see this, the request is not reaching Node (e.g. nginx is handling or blocking it).

## 4. Nginx (if used)

If tableshare.pixelcheese.com is behind nginx, nginx may need to pass OPTIONS through to Node. Check:

```bash
# On server
cat /etc/nginx/sites-enabled/tableshare  # or your config path
```

Ensure OPTIONS requests are proxied to Node, not handled by nginx. If nginx handles OPTIONS, it must add CORS headers. Example for passing through:

```nginx
location /api/ {
    if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Allow-Origin' $http_origin always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
        add_header 'Access-Control-Allow-Headers' 'Content-Type, Authorization';
        add_header 'Access-Control-Allow-Credentials' 'true';
        add_header 'Access-Control-Max-Age' 86400;
        return 204;
    }
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin $http_origin;
}
```

Or simpler: proxy everything to Node and let Node handle CORS (no special nginx CORS config).

## 5. Try array-based CORS

In `src/server.js`, replace the CORS `origin` callback with the array:

```javascript
app.use(cors({
  origin: allowedOrigins,  // use array directly instead of callback
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
}));
```

Then redeploy and restart.

## 6. Verify deployment

Confirm the server is running the updated code:

```bash
# On server
cd /opt/tableshare-backend
grep -A2 "allowedOrigins" src/server.js
pm2 restart tableshare-api
```
