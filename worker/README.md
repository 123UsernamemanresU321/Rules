# Session Order OS - Cloudflare Worker

This Worker acts as a secure proxy between the frontend and the DeepSeek AI API.

## Security Features

- ✅ API key stored as Cloudflare secret (never in code)
- ✅ CORS restricted to allowed origins
- ✅ Request size validation (max 10KB)
- ✅ Payload structure validation
- ✅ Rate limiting (10 requests/minute/IP)
- ✅ No content logging

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Cloudflare account
- DeepSeek API key

### Setup

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Configure the secret:
   ```bash
   wrangler secret put DEEPSEEK_API_KEY
   # Paste your API key when prompted
   ```

4. Update `wrangler.toml`:
   - Add your GitHub Pages URL to `ALLOWED_ORIGINS`
   - Example: `"https://yourusername.github.io,http://localhost:8080"`

5. Deploy:
   ```bash
   wrangler deploy
   ```

6. Note the Worker URL (e.g., `https://session-order-os-worker.yourname.workers.dev`)

7. Configure the frontend:
   - Go to Settings in the app
   - Enter the Worker URL
   - Test the connection

## Local Development

Run locally:
```bash
wrangler dev
```

Test with curl:
```bash
curl -X POST http://localhost:8787/analyze \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:8080" \
  -d '{"student":{"grade":5,"band":"B","bandName":"Upper Primary"},"session":{"mode":"in-person","timeIntoSession":600,"disciplineState":{"FOCUS_OFF_TASK":1}},"incident":{"category":"FOCUS_OFF_TASK","categoryLabel":"Off-Task","severityGuess":2,"description":"Looking at phone during explanation"},"methodology":{"maxLadderStep":4,"parentContactThreshold":4,"allowedConsequences":["reset_break"],"notAllowedConsequences":["session_end"],"ladderSummary":[{"step":1,"action":"Redirect"}]}}'
```

## Endpoints

### GET /health
Health check endpoint. Returns worker status and version.

### POST /analyze
Main analysis endpoint. Sends incident to DeepSeek and returns recommendations.

**Request body:** See worker.js for full schema.

**Response:** JSON object with category, severity, scripts, and recommendations.

## Troubleshooting

### "Origin not allowed"
Add your origin to `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy.

### "AI service not configured"
Run `wrangler secret put DEEPSEEK_API_KEY` to set your API key.

### "Rate limit exceeded"
Wait 60 seconds. Default limit is 10 requests per minute per IP.

### CORS errors in browser
Check that the exact origin (including protocol and port) is in `ALLOWED_ORIGINS`.
