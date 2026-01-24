# Session Order OS

**Offline-first, privacy-first tutoring session discipline management.**

Session Order OS helps tutors maintain order during live tutoring sessions with grade-aware (Grades 1-13), incident-driven discipline management. AI recommends; the tutor decides.

![Session Order OS](https://img.shields.io/badge/Status-Ready-green) ![License](https://img.shields.io/badge/License-MIT-blue) ![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen)

---

## Features

- 🚀 **Fast incident logging** (5-15 seconds)
- 📱 **Offline-first** - works without internet
- 🎓 **Grade-aware** - methodology adapts to Grades 1-13
- 🤖 **Optional AI** - DeepSeek integration via secure Cloudflare Worker
- 🔒 **Privacy-first** - all data stored locally, no tracking
- 📊 **Pattern insights** - identify trends across sessions
- 📄 **Export/import** - JSON + print-friendly reports

---

## Quick Start

### Option 1: Run Locally (No Server Required)

1. Clone or download this repository
2. Open `frontend/index.html` in your browser
3. Start using the app!

### Option 2: Deploy to GitHub Pages

1. Fork this repository
2. Go to **Settings → Pages** in your fork
3. Set source to `main` branch, `/frontend` folder
4. Your app will be live at `https://yourusername.github.io/session-order-os/`

---

## Project Structure

```
session-order-os/
├── frontend/           # Static web app (deploy to GitHub Pages)
│   ├── index.html      # Main HTML shell
│   ├── styles.css      # Complete styling
│   ├── app.js          # Main app controller
│   ├── db.js           # IndexedDB wrapper
│   ├── session.js      # Session management
│   ├── incidents.js    # Incident logging
│   ├── methodology.js  # Discipline methodology
│   ├── ai.js           # AI communication (via Worker)
│   ├── validate.js     # JSON Schema validation
│   ├── export.js       # Export/import functionality
│   └── utils.js        # Utilities
├── worker/             # Cloudflare Worker (optional)
│   ├── worker.js       # Worker code
│   ├── wrangler.toml   # Worker config
│   └── README.md       # Worker-specific docs
├── tests/              # Test suite
│   ├── test.html       # Test runner
│   └── tests.js        # Unit tests
└── README.md           # This file
```

---

## GitHub Pages Deployment

### Step 1: Fork and Enable Pages

1. Click **Fork** on this repository
2. In your fork, go to **Settings → Pages**
3. Under "Source", select:
   - Branch: `main`
   - Folder: `/frontend`
4. Click **Save**
5. Wait 1-2 minutes for deployment

### Step 2: Access Your App

Your app will be available at:
```
https://YOUR_USERNAME.github.io/session-order-os/
```

### Step 3: Configure AI (Optional)

If you want AI-powered recommendations:
1. Deploy the Cloudflare Worker (see below)
2. In the app, go to **Settings**
3. Enter your Worker URL
4. Enable AI

---

## Cloudflare Worker Setup Guide

This section provides a comprehensive, step-by-step guide to deploying the Cloudflare Worker that securely proxies AI requests.

### Prerequisites

- **Cloudflare account** (free tier is sufficient)
- **Node.js 18+** installed
- **npm** (comes with Node.js)
- **DeepSeek API key** from [platform.deepseek.com](https://platform.deepseek.com)

### Step 1: Install Wrangler CLI

Wrangler is Cloudflare's CLI for managing Workers.

**macOS / Linux:**
```bash
npm install -g wrangler
```

**Windows (PowerShell as Administrator):**
```powershell
npm install -g wrangler
```

**Or use npx (no global install):**
```bash
npx wrangler --version
```

Verify installation:
```bash
wrangler --version
# Should output: wrangler x.x.x
```

### Step 2: Authenticate with Cloudflare

```bash
wrangler login
```

This opens your browser. Log in to Cloudflare and authorize Wrangler.

**Verify authentication:**
```bash
wrangler whoami
```

Expected output:
```
👋 You are logged in with an OAuth Token, associated with the email: your@email.com
```

### Step 3: Navigate to Worker Directory

```bash
cd path/to/session-order-os/worker
```

### Step 4: Configure wrangler.toml

Open `wrangler.toml` and update `ALLOWED_ORIGINS`:

```toml
[vars]
ALLOWED_ORIGINS = "https://YOUR_USERNAME.github.io,http://localhost:8080"
```

Replace `YOUR_USERNAME` with your actual GitHub username.

**Important:** Include `http://localhost:8080` for local testing.

### Step 5: Set the DeepSeek API Key Secret

**CRITICAL: Never put your API key in code or wrangler.toml!**

```bash
wrangler secret put DEEPSEEK_API_KEY
```

When prompted, paste your DeepSeek API key and press Enter.

Expected output:
```
🌀 Creating the secret for the Worker "session-order-os-worker"
✨ Success! Uploaded secret DEEPSEEK_API_KEY
```

### Step 6: Test Locally

Run the Worker locally:
```bash
wrangler dev
```

Expected output:
```
⎔ Starting local server...
╭──────────────────────────────────────────────────────────╮
│  [b] open a browser, [d] open Devtools, [l] turn on local mode, [c] clear console, [x] to exit  │
╰──────────────────────────────────────────────────────────╯
Listening on http://localhost:8787
```

**Test with curl:**
```bash
curl http://localhost:8787/health
```

Expected response:
```json
{"status":"ok","version":"1.0.0","timestamp":"..."}
```

**Test analyze endpoint:**
```bash
curl -X POST http://localhost:8787/analyze \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{
    "student": {"grade": 5, "band": "B", "bandName": "Upper Primary"},
    "session": {"mode": "in-person", "timeIntoSession": 600, "disciplineState": {}},
    "incident": {"category": "FOCUS_OFF_TASK", "categoryLabel": "Off-Task", "severityGuess": 2, "description": "Looking at phone"},
    "methodology": {"maxLadderStep": 4, "parentContactThreshold": 4, "allowedConsequences": [], "notAllowedConsequences": [], "ladderSummary": []}
  }'
```

Press `x` to stop the local server.

### Step 7: Deploy to Production

```bash
wrangler deploy
```

Expected output:
```
🌀 Building session-order-os-worker...
🌀 Uploading...
✨ Success! Deployed to:
 https://session-order-os-worker.YOUR_SUBDOMAIN.workers.dev
```

**Copy this URL** - you'll need it for the frontend configuration.

### Step 8: Test Production Deployment

```bash
curl https://session-order-os-worker.YOUR_SUBDOMAIN.workers.dev/health
```

**Test from browser console (on your GitHub Pages app):**
```javascript
fetch('https://session-order-os-worker.YOUR_SUBDOMAIN.workers.dev/health')
  .then(r => r.json())
  .then(console.log);
```

### Step 9: Configure Frontend

1. Open your deployed app
2. Go to **Settings**
3. Enter the Worker URL: `https://session-order-os-worker.YOUR_SUBDOMAIN.workers.dev`
4. Click **Test Connection**
5. If successful, enable **AI-powered recommendations**
6. Click **Save Settings**

---

## Troubleshooting

### Authentication Errors

**"Not logged in"**
```bash
wrangler login
```

**"API token not found"**
```bash
wrangler logout
wrangler login
```

### CORS Errors

**"Origin not allowed"**

1. Check `ALLOWED_ORIGINS` in `wrangler.toml`
2. Ensure exact match (including protocol and port)
3. Redeploy:
   ```bash
   wrangler deploy
   ```

### Error 1101: Worker Threw Exception

Check worker logs:
```bash
wrangler tail
```

Common causes:
- Missing `DEEPSEEK_API_KEY` secret
- Invalid JSON in request body
- DeepSeek API issues

### "AI service not configured"

Set the API key secret:
```bash
wrangler secret put DEEPSEEK_API_KEY
```

### Missing Compatibility Date

Ensure `wrangler.toml` has:
```toml
compatibility_date = "2024-01-01"
```

### Rate Limit Exceeded

Default limit: 10 requests/minute/IP. Wait 60 seconds.

---

## Rotating Secrets Safely

To rotate your DeepSeek API key:

1. Get new API key from DeepSeek
2. Update the secret:
   ```bash
   wrangler secret put DEEPSEEK_API_KEY
   # Enter new key
   ```
3. Old key is immediately replaced

---

## Custom Domain Setup (Optional)

### Using workers.dev Subdomain

Your Worker is automatically available at:
```
https://session-order-os-worker.YOUR_SUBDOMAIN.workers.dev
```

### Using Custom Domain

1. Add domain to Cloudflare (update nameservers)
2. Update `wrangler.toml`:
   ```toml
   [[routes]]
   pattern = "api.yourdomain.com/*"
   zone_name = "yourdomain.com"
   ```
3. Deploy:
   ```bash
   wrangler deploy
   ```
4. Update `ALLOWED_ORIGINS` to include your frontend domain

---

## Verifying API Key Security

**The API key should NEVER appear in:**
- Source code
- wrangler.toml
- Git commits
- Browser DevTools (Network tab)
- Frontend bundle

**To verify:**

1. Search codebase:
   ```bash
   grep -r "sk-" .
   # Should return nothing (or only this README)
   ```

2. Check Network tab:
   - Open DevTools → Network
   - Make an AI request
   - Click the request to the Worker
   - Verify no `Authorization` header in the request
   - The Worker adds this header, not the frontend

---

## Security Notes

| Feature | Implementation |
|---------|----------------|
| API key storage | Cloudflare Worker secret only |
| CORS | Restricted to allowed origins |
| Rate limiting | 10 requests/minute/IP |
| Request validation | Size limit + schema validation |
| XSS prevention | All user input sanitized |
| AI response validation | JSON Schema validation |
| Content logging | None (privacy-first) |

---

## Running Tests

Open `tests/test.html` in your browser:

```bash
open tests/test.html    # macOS
start tests/test.html   # Windows
xdg-open tests/test.html # Linux
```

Or from the console:
```javascript
TestSuite.runAll();
```

---

## Methodology Configuration

The default methodology covers:

| Band | Grades | Approach |
|------|--------|----------|
| A | 1-2 | Immediate, visual, short cycles |
| B | 3-5 | Structured choices, early accountability |
| C | 6-8 | Contracts + restorative routines |
| D | 9-10 | Professional norms + performance |
| E | 11-13 | Partnership model + firm boundaries |

### Categories

1. **Focus/Off-Task** - Distraction, daydreaming
2. **Interrupting** - Speaking over, not waiting
3. **Disrespect/Tone** - Eye rolling, rude tone
4. **Non-Compliance** - Refusal, work avoidance
5. **Device Misuse** - Phone, off-task apps
6. **Academic Integrity** - Copying, AI misuse
7. **Safety/Boundary** - Physical safety, inappropriate content

### Severity Levels

| Level | Name | Response |
|-------|------|----------|
| 1 | Minor | Redirect attention |
| 2 | Moderate | Pause and address |
| 3 | Major | Formal intervention |
| 4 | Critical | Session stop protocol |

---

## AI Behavior

The AI:
- ✅ Recommends proportionate, restorative responses
- ✅ Considers grade band and prior incidents
- ✅ Provides scripts (gentle/neutral/firm)
- ✅ Suggests prevention strategies
- ✅ Notes fairness considerations
- ❌ Never recommends humiliation or threats
- ❌ Never makes the final decision (tutor decides)

When offline or AI disabled:
- App uses deterministic methodology logic
- No errors shown to tutor
- Session proceeds normally

---

## Export/Import

### Export All Data
Settings → Export All Data → Downloads JSON file

### Import Data
Settings → Import Data → Select JSON file

### Session Reports
Reports → Select session → View/Print Report

---

## Contributing

1. Fork the repository
2. Make changes
3. Test with `tests/test.html`
4. Submit pull request

---

## License

MIT License - see LICENSE file for details.

---

## Support

- 📖 [Documentation](./README.md)
- 🐛 [Report Issues](../../issues)
- 💡 [Feature Requests](../../issues)

---

Built with ❤️ for tutors everywhere.
