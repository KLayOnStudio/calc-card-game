# FuncMons Leaderboard API — deployment

FastAPI + SQLite, small enough to run directly with `systemd` behind `nginx`.
No Docker needed for a class-sized leaderboard.

## 1. One-time server setup (Ubuntu/Debian assumed — adjust package manager if different)

```bash
sudo apt update
sudo apt install -y python3-venv python3-pip nginx certbot python3-certbot-nginx

# App lives here; adjust the path if you'd rather put it elsewhere.
sudo mkdir -p /opt/funcmons
sudo chown $USER:$USER /opt/funcmons
```

Copy this `backend/` folder to `/opt/funcmons` on the VM (`scp -r backend/* user@vm:/opt/funcmons/`).

```bash
cd /opt/funcmons
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

## 2. systemd service

Create `/etc/systemd/system/funcmons.service`:

```ini
[Unit]
Description=FuncMons leaderboard API
After=network.target

[Service]
User=YOUR_USERNAME
WorkingDirectory=/opt/funcmons
ExecStart=/opt/funcmons/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now funcmons
sudo systemctl status funcmons   # should show "active (running)"
```

The API only listens on `127.0.0.1` — it's not reachable from outside until
nginx proxies to it below. That's intentional: nginx handles HTTPS/TLS
termination, uvicorn doesn't need to.

## 3. nginx reverse proxy + HTTPS

Point a DNS **A record** (not CNAME) for whatever subdomain you're using for
the API — e.g. `api.klayonstudio.com` → the VM's public IP. (This is
separate from `games.klayonstudio.com`, which is a CNAME to GitHub Pages for
the frontend — the API needs its own subdomain pointed directly at the VM.)

Create `/etc/nginx/sites-available/funcmons`:

```nginx
server {
    listen 80;
    server_name api.klayonstudio.com;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/funcmons /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Once the DNS A record above has propagated:
sudo certbot --nginx -d api.klayonstudio.com
```

Certbot rewrites the nginx config to serve HTTPS and auto-renews the
certificate (a systemd timer it installs handles renewal — nothing to do
manually after this).

## 4. Verify

```bash
curl https://api.klayonstudio.com/health
# {"ok":true}
```

## 5. Wire up the frontend

Once the above is live, update `../leaderboard.js` to `fetch()` this API
instead of `localStorage` — ask Claude to do this swap once you've confirmed
`/health` responds over HTTPS from the public internet, not just from the VM
itself. Update `ALLOWED_ORIGINS` in `main.py` first if the frontend's domain
ever changes from `games.klayonstudio.com`.

## Updating the code later

```bash
# On your Mac, after Claude edits backend/main.py:
scp backend/main.py user@vm:/opt/funcmons/main.py
ssh user@vm 'sudo systemctl restart funcmons'
```
