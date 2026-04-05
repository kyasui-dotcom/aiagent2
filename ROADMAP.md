# AIagent2 Roadmap

Cloudflare/D1 前提・エンジニアファーストで進めるための実行ロードマップ。

---

## Phase 1 — Cloudflare/D1で成立する土台を固める

**目的**
- Cloudflare Workers + D1 前提で、最低限の実行基盤が成立している状態にする

**やること**
- `wrangler.jsonc` の binding / assets / D1 設定確認
- Worker API の現状確認
- D1 schema 適用確認
- `/api/health`, `/api/ready`, `/api/schema`, `/api/snapshot`, `/api/agents`, `/api/jobs` の確認
- seed / billing audit の成立確認

**完了条件**
- Cloudflare/D1前提の構成で土台が成立している
- Worker API の基本動作が確認できる
- runs / agents の土台データが読める

**状態**
- ほぼ完了

---

## Phase 2 — Runsを本物の運用画面にする

**目的**
- Runs画面だけで「何が起きたか / なぜ失敗したか / 次に何をすべきか」が分かるようにする

**やること**
- run detail の整理
- failure / dispatch / retryability 表示改善
- trace / logs の可読性改善
- next action の提示
- retry 導線の明確化
- agent 明示指定実行の反映

**完了条件**
- Runs画面で実行状態の判断ができる
- retry可否と次アクションがすぐ分かる
- 選択した run の詳細がすぐ読める

**状態**
- 完了

---

## Phase 3 — Agentsを運用UIとして仕上げる

**目的**
- Agents画面を「ただの一覧」ではなく、運用判断ができる画面にする

**やること**
- agent search/filter 強化
- verify / health / capability / endpoint の見せ方改善
- online/offline の視認性改善
- agent選択 → run作成の流れ改善
- verify失敗時の理由表示改善
- agent detail を運用向けに整理

**完了条件**
- どのagentが使えるか即わかる
- どのagentに投げるべきか判断しやすい
- verify 状態や壊れ方が分かる

**状態**
- 進行中

---

## Phase 4 — CLI / APIファースト導線を完成させる

**目的**
- Web UI が説明書兼コックピットとして機能し、CLI/API利用の入口になるようにする

**やること**
- CLI quickstart の現実的な整備
- API examples の更新
- `agent_id` 指定例の反映
- connect / run / logs / status の流れ整理
- 未ログインでも価値が分かる構成にする

**完了条件**
- 初見のエンジニアが迷わず使い始められる
- WebからCLI/API利用へ自然に流れる

**状態**
- 完了

---

## Phase 5 — ゲームっぽい世界観の仕上げ

**目的**
- 過剰すぎず、仕事で使える範囲でゲームっぽい司令室感を整える

**やること**
- HUD感の微調整
- status badge 改良
- panel / selected / hover の磨き込み
- stats の視認性改善
- 演出が強すぎないか最終確認

**完了条件**
- “ゲームっぽいけど仕事で使える” バランスになる
- 見た目の統一感が出る

**状態**
- 完了

---

## Phase 6 — 不要物整理と最終整頓

**目的**
- repo 全体を Cloudflare/D1 前提で読みやすく整える

**やること**
- 不要ファイルや古い前提の除去
- docs 整合性確認
- scripts / sample / manifest の位置づけ整理
- 差分整理
- commit しやすい粒度にまとめる

**完了条件**
- repo の方向性がブレていない
- Cloudflare/D1 前提で読める

**状態**
- 完了

---

## Phase 7 — 最終QA / デプロイ / 反映

**目的**
- 完成版として外に出せる状態にする

**やること**
- 主要操作の通し確認
- Cloudflare deploy 確認
- 必要なら GitHub Actions deploy 確認
- 反映後の挙動確認
- リリースメモ整理

**完了条件**
- 実際に触れる
- 主要機能が壊れていない
- 次の作業へ引き継ぎやすい

**状態**
- QA完了、deploy待ち

---

## 優先順

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6
7. Phase 7

---

## ひとことで言うと

このロードマップの目的は、AIagent2を

- Cloudflare/D1 前提で動く
- エンジニアが使いやすい
- Runs/Agents中心で運用しやすい
- CLI/APIにも自然につながる
- 少しゲームっぽくて気持ちいい

プロダクトに仕上げること。
