# FuncMons Leaderboard API — deployment

Azure Functions (Python, FastAPI wrapped via the ASGI adapter) + Azure SQL
Database (serverless tier). No VM, no systemd, no manual nginx/HTTPS setup —
Azure handles all of that. Deploys automatically on every push to `main`
via GitHub Actions, same trigger-based flow as the frontend's GitHub Pages.

## Files

- `function_app.py` — Azure Functions entry point, wraps `main.py`'s FastAPI
  app. Nothing Azure-specific lives outside this one file.
- `main.py` — the actual API. A plain FastAPI app, testable with plain
  `uvicorn` locally, no Azure Functions involved.
- `db.py` — Azure SQL connection (via `pyodbc`), reads the connection
  string from the `SQL_CONNECTION_STRING` environment variable.
- `host.json` — Azure Functions host configuration (boilerplate, rarely
  needs touching).
- `local.settings.json.example` — template for local settings. Copy to
  `local.settings.json` and fill in real values; that file is gitignored
  since this repo is public.

## 1. Azure resources (one-time setup, via the Azure Portal)

1. **Azure SQL Database**, serverless compute tier — see chat history for
   the exact portal walkthrough used, or: SQL databases → Create → General
   Purpose → Serverless. Enable "Allow Azure services and resources to
   access this server" under Networking so the Function App can reach it.
2. **Function App** — Create → Runtime stack: Python 3.11 → Hosting plan:
   Consumption (serverless, pay-per-execution, generous free tier).
3. In the Function App's **Configuration → Application settings**, add
   `SQL_CONNECTION_STRING` with the real connection string (Azure Portal →
   the SQL Database → Connection strings → ODBC tab, fill in the actual
   password).

## 2. Local development

### First-time setup

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Local testing also needs Microsoft's ODBC driver installed on your machine
(the Azure Functions runtime already has this preinstalled — this is only
for testing on your own computer):

```bash
brew tap microsoft/mssql-release https://github.com/Microsoft/homebrew-mssql-release
brew trust microsoft/mssql-release
HOMEBREW_ACCEPT_EULA=Y brew install msodbcsql18
```

If that last command fails with a Command Line Tools error, update Xcode
Command Line Tools first (System Settings → Software Update), then retry.

Copy `local.settings.json.example` to `local.settings.json` and fill in the
real `SQL_CONNECTION_STRING` (Azure Portal → SQL Database → Connection
strings → ODBC → fill in your password). This file is gitignored — never
commit real credentials, the repo is public.

### Fast local loop (plain uvicorn, no Azure emulation)

```bash
export SQL_CONNECTION_STRING="<paste the same string from local.settings.json>"
.venv/bin/uvicorn main:app --reload --port 8000
curl http://127.0.0.1:8000/health
```

### Testing as an actual Azure Function (closer to production)

Needs Azure Functions Core Tools and the Azurite storage emulator:

```bash
brew install azure-functions-core-tools@4 azurite
azurite &        # in one terminal
func start       # in backend/, in another terminal
```

## 3. Deploying

Handled automatically by `.github/workflows/deploy-backend.yml` on every
push to `main` that touches `backend/`. First-time setup for that workflow:

1. Azure Portal → your Function App → Overview → **"Get publish profile"**
   (downloads an XML file).
2. GitHub repo → Settings → Secrets and variables → Actions → **New
   repository secret** → name it `AZURE_FUNCTIONAPP_PUBLISH_PROFILE`,
   paste the entire downloaded file as the value.
3. Update `AZURE_FUNCTIONAPP_NAME` in the workflow file to match your
   actual Function App's name.

After that, deploys are automatic — no manual steps.

## 4. Verify

```bash
curl https://<your-function-app-name>.azurewebsites.net/health
```

## 5. Wire up the frontend

Once `/health` responds correctly from the public internet, update
`../math/funcmons/leaderboard.js` to call this API instead of
`localStorage`. Ask Claude to do this swap once deployment is confirmed
working — the live site keeps using localStorage until then, so nothing
breaks from a premature switch.
