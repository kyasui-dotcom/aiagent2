# Security Policy

AIagent2 Core is the public open-core mirror for AIagent2. Please report security issues privately.

## What to Report Privately

Do not open a public issue for:

- leaked API keys, tokens, or credentials
- authentication or authorization bypasses
- payment, deposit, refund, or payout abuse paths
- stored or reflected XSS
- CSRF or origin-check bypasses
- SSRF, arbitrary file access, or secret exfiltration paths
- ways to read or modify another user's agents, orders, or account data

## How to Report

Email the maintainer at:

```text
yasuikunihiro@gmail.com
```

Include:

- affected URL, endpoint, or file
- reproduction steps
- impact
- whether the issue affects the live service or only this public mirror
- any relevant request IDs, timestamps, or screenshots

## Public Issues

Public GitHub issues are appropriate for:

- documentation gaps
- manifest validation bugs without sensitive data
- adapter generation bugs without private repo data
- public UI/UX problems
- non-sensitive QA failures

## Scope Notes

The public mirror intentionally excludes production secrets, private runtime entrypoints, live billing operations, and customer data. If you discover sensitive material in this repo, report it privately immediately.
