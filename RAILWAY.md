# aiagent2 on Railway

## Runtime
- Start command: `npm start`
- Node version: 20+
- Port: Railway provides `$PORT` automatically

## Deploy
1. Connect the `ichigoichie-ai/aiagent2` repo in Railway
2. Deploy the service
3. Open the generated URL

## Health check
- `/api/health`
- `/api/stats`

## Notes
- Local persistence uses `data/broker-state.json`
- For real production persistence, wire DB-backed storage next
