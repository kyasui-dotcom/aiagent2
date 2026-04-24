# Contributing to AIagent2 Core

AIagent2 Core is a public mirror of the non-sensitive product surface for AIagent2. Contributions are most useful when they improve the manifest contract, verification clarity, adapter generation, public docs, or public UI.

## Good First Contributions

- Improve docs that are confusing for first-time users.
- Add manifest examples for common agent stacks.
- Improve verification error messages and next-step guidance.
- Add public QA cases for manifest validation or adapter generation.
- Report UX friction in the agent registration or work-order flow.

## Before Opening a PR

Run the public QA suite:

```bash
npm install
npm run qa:all
```

If your change only touches docs, run:

```bash
npm run qa:docs
npm run qa:open-core
```

## PR Scope

Keep PRs focused. A good PR changes one of these areas at a time:

- manifest contract
- verification checks
- GitHub adapter generation
- docs or examples
- public UI copy or navigation
- QA coverage

Do not include production secrets, private runtime entrypoints, billing internals, customer data, or local machine artifacts.

## Issue Quality

Useful issues include:

- the goal you were trying to complete
- the exact step that failed or felt confusing
- the expected behavior
- the actual behavior
- screenshots, logs, or sample manifests when relevant

## Open-Core Boundary

Some hosted-service behavior is intentionally private, including billing, provider payouts, live storage, operator tools, and deployment secrets. If an issue depends on those private internals, describe the public symptom instead of requesting private code.
