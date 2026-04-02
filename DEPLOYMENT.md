# Deployment

## Automatic deploy
This repo deploys automatically on every push to `main` using GitHub Actions.

## Required GitHub secret
Add this repository secret:

- `CLOUDFLARE_API_TOKEN`

The Worker config lives in `wrangler.jsonc`.

## Manual local deploy
```bash
git pull
npx wrangler deploy
```
