# Open Core Release Posture

This repo currently acts as the private operating repo for AIagent2. Before making any GitHub repository public, use this document to separate public core code from private operating concerns.

## Public-safe areas

These are the parts that are generally safe to publish after running the open-core QA checks:

- `MANIFEST.md`
- `README.md`
- `ROADMAP.md`
- `public/help.html`
- `public/guide.html`
- `public/cli-help.html`
- `public/qa.html`
- `public/terms.html`
- `public/privacy.html`
- `public/tokushoho.html`
- `lib/manifest.js`
- `lib/verify.js`
- `lib/github-adapter.js`
- `lib/builtin-agents.js`
- selected UI code that documents public product behavior
- non-production QA scripts

## Private operating concerns

Do not publish these by accident:

- any real env values, session secrets, API keys, or private keys
- Cloudflare credentials and deployment tokens
- Stripe live operational data and payout history
- GitHub App private key and OAuth client secret
- local browser artifacts, screenshots, and debugging traces
- D1 state dumps, broker state, or run history exports
- operator-only reports, reviewer queues, and internal moderation data
- customer/support exports that contain email addresses or billing details

## Recommended repo split

Use two repos:

- `aiagent2-core` public
  - manifest spec
  - hosted adapter generator
  - public docs
  - client examples
  - non-sensitive QA
- `aiagent2-private` private
  - production deployment config
  - billing and payout operations
  - live environment management
  - operator tooling
  - incident handling and internal reports

If you keep a single private operating repo, publish from an exported mirror instead of making this repo public directly.

## Minimum publish checklist

1. Run `npm run qa:open-core`.
2. Export the public mirror with `npm run open-core:export -- <destination-folder>`.
3. Confirm no tracked file contains a real secret or private key.
4. Confirm local artifacts are ignored:
   - `.playwright-cli/`
   - `.wrangler/`
   - `output/`
   - `test-results/`
   - `.env`
5. Confirm docs do not reference local machine paths.
6. Choose and add a real `LICENSE` file before public release.

## Public mirror whitelist

The initial public mirror is driven by [`open-core-whitelist.json`](./open-core-whitelist.json).

- it is intentionally conservative
- it favors docs, manifest/verification logic, hosted adapter generation, and public UI
- it excludes production deployment config, billing operations, payout operations, and internal moderation data

Use this command to export the current public-safe mirror:

```bash
npm run open-core:export -- ../aiagent2-core
```

That writes the whitelisted files into the destination folder and adds `OPEN_CORE_EXPORT.txt` as a reminder that a real license still needs to be added before publication.

## Important business decision still required

Open core is not complete until the public repo has an explicit license.

Typical options:

- `AGPL-3.0-only` or `AGPL-3.0-or-later` if you want strong copyleft on hosted modifications
- `Apache-2.0` if you want broad reuse
- keep the operating repo private and publish only a separate public mirror if you do not want to grant source reuse rights yet

This repo intentionally does not choose a license automatically because that is a business decision, not a code hygiene task.
