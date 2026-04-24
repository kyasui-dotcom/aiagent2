# CAIt Hardcode Policy and Configuration Model

This document defines how CAIt handles values that were previously hardcoded.

Goal:
- Move operator-changeable behavior and UX copy to configuration.
- Keep protocol-level or safety-critical enums/constants in code.
- Prevent ad-hoc local-file overrides; persist settings in D1.

---

## 1. Configuration Layers

CAIt resolves values in this order:

1. D1 `app_settings` (runtime override)
2. code defaults in `APP_SETTING_DEFAULTS`
3. local fallback literals (only defensive fallback)

Relevant files:
- `public/work-action-registry.js`
- `lib/storage.js`
- `worker.js`
- `server.js`
- `public/client.js`

---

## 2. What Is Variableized (Code Constants)

### 2.1 Shared action constants

`public/work-action-registry.js`

- `WORK_ACTION_IDS`
  - canonical IDs for work actions (`open_order_settings`, `set_route_auto`, etc.)
- `EXACT_MATCH_ALLOWED_WORK_ACTIONS`
  - single source allowlist for exact-match action routing

These replace repeated string literals across worker/client/storage.

### 2.2 Shared order UI labels

`public/work-action-registry.js`

- `WORK_ORDER_UI_LABELS`
  - `sendOrder`
  - `addConstraints`
  - `prepareOrder`
  - `sendChat`
  - `answerFirst`
  - `revise`
  - `cancel`

These labels are used by intent-prompt generation and email/UX strings where applicable.

### 2.3 Shared app setting defaults

`public/work-action-registry.js`

- `APP_SETTING_DEFAULTS`
  - `work_order_send_label`
  - `work_order_add_constraints_label`
  - `work_order_prepare_label`
  - `work_chat_send_label`
  - `work_order_answer_first_label`
  - `work_order_revise_label`
  - `work_order_cancel_label`
  - `work_chat_intro_title`
  - `work_chat_intro_body`

---

## 3. What Is DB-Configurable (D1)

### 3.1 New table

`lib/storage.js` adds `APP_SETTINGS_D1_SCHEMA_SQL`:

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);
```

### 3.2 Storage behavior

`lib/storage.js`

- in-memory state now includes `appSettings`
- D1 `getState()` now reads `app_settings`
- D1 `replaceState()` now writes `app_settings`
- defaults are always merged via `mergeAppSettings(...)`

Result:
- No local JSON file is needed.
- Defaults are always present even when DB has no row for a key.

---

## 4. API for Runtime Configuration

Worker endpoints (`worker.js`):

- `GET /api/settings/app-settings`
  - returns merged settings map
- `POST /api/settings/app-settings`
  - body: `{ "key": "...", "value": "..." }`
  - updates one key
- `DELETE /api/settings/app-settings/:key`
  - removes override; default remains effective

Access control:
- admin-only (`canViewAdminDashboard(...)`)

Validation:
- unknown key is rejected
- empty value is rejected
- max length is constrained
- control chars are stripped

---

## 5. Where Config Is Applied

### 5.1 Open Chat intent system prompt

`worker.js`, `server.js`

- `openChatIntentSystemPrompt(...)` now receives label values
- prompt options for `prepare_order/use_previous_brief` are generated from config labels

### 5.2 Runtime context text for intent classification (worker)

`worker.js`

- `buildOpenChatRuntimeContextMarkdown(...)` uses configured send-order label

### 5.3 Work Chat intro copy (client)

`public/client.js`

- `renderWorkChatThread()` now reads:
  - `work_chat_intro_title`
  - `work_chat_intro_body`
- fallback is `APP_SETTING_DEFAULTS`

### 5.4 Chat UI label rendering (client)

`public/client.js`

- composer action button text now resolves from app settings:
  - `sendOrder`
  - `prepareOrder`
  - `sendChat`
  - `answerFirst`
- preorder decision labels now resolve from app settings:
  - `sendOrder`
  - `revise`
  - `cancel`
- `formatWorkUiText(...)` applies canonical label replacement in:
  - chat bubbles
  - status cards
  - flash/toast text

### 5.5 Snapshot payload

`worker.js`, `server.js`

- `/api/snapshot` now includes `appSettings`

---

## 6. Existing DB-Configurable Routing Rules

Already DB-backed and retained:

- `exact_match_actions` table
  - exact phrase -> action mapping
- worker APIs:
  - `GET /api/settings/exact-actions`
  - `POST /api/settings/exact-actions`
  - `DELETE /api/settings/exact-actions/:id`

This works alongside `WORK_ACTION_IDS` and allowlists.

---

## 7. Security Model

### 7.1 Injection resistance

- app setting key is strict allowlist (`APP_SETTING_DEFAULTS` keys only)
- values are not interpolated into SQL (parameter binding is used)
- values are sanitized (control chars removed, max length enforced)
- admin-only mutation endpoints

### 7.2 Why some items stay hardcoded

Kept in code by design:

- protocol enums
- route IDs
- safety guardrails
- permission checks
- strict allowlists

Reason:
- these define trusted control flow and should not be mutable by runtime content.

---

## 8. Operator Examples

### 8.1 Update Work intro title

```bash
curl -X POST https://<host>/api/settings/app-settings \
  -H "content-type: application/json" \
  -H "cookie: aiagent2_session=..." \
  -d '{"key":"work_chat_intro_title","value":"What work should CAIt execute?"}'
```

### 8.2 Restore default for one key

```bash
curl -X DELETE https://<host>/api/settings/app-settings/work_chat_intro_title \
  -H "cookie: aiagent2_session=..."
```

### 8.3 Inspect effective settings

```bash
curl https://<host>/api/settings/app-settings \
  -H "cookie: aiagent2_session=..."
```

---

## 9. QA and Verification

Use these checks after changing configuration logic:

```bash
node --check lib/storage.js
node --check worker.js
node --check server.js
node --check public/client.js
node --check public/work-action-registry.js
npm run -s qa:ui
node scripts/worker-api-qa.mjs
```

---

## 10. Migration Rule Going Forward

When a new hardcoded value is discovered:

1. Classify:
   - operator-facing copy/behavior toggle -> config candidate
   - protocol/safety token -> keep in code constant
2. If config candidate:
   - add key to `APP_SETTING_DEFAULTS`
   - wire through `app_settings` map
   - enforce validation and admin-only mutation
   - update this document
3. Add/adjust QA assertions.

This is the standard policy for future hardcode removal in CAIt.
