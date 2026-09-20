# feeds

Claude / Kubernetes / AWS の情報を日本語で追うための個人用 RSS 基盤。GitHub Actions で更新し、
GitHub Pages で公開する。機能一覧は [FEATURES.md](./FEATURES.md)、実装の詳細は
[CONTRIBUTING.md](./CONTRIBUTING.md)。

**公開先**: <https://ogontaro.github.io/feeds/> ／ 一括購読 OPML: `https://ogontaro.github.io/feeds/subscriptions.opml`

ドメイン（claude / kubernetes / aws）ごとに独立したパイプライン。機能は混ざらない。

| 種別 | 内容 | 頻度 | フィード |
| --- | --- | --- | --- |
| 翻訳フィード | 購読フィードの新着タイトル・概要を DeepL で日本語化 | 6 時間ごと | `translated-<domain>.xml` |
| レポート | 直近 24h の新着から Claude が重要記事を 5〜10 件選定・日本語コメント | 毎日 07:00 JST | `report-<domain>.xml` |
| リリースレポート | 直近 7 日のツールリリースを Claude が整理（破壊的変更を先頭） | 毎週月 07:30 JST | `release-<domain>.xml` |
| フィード監査 | 不採用フィードの無効化候補検出＋ WebSearch での新規フィード提案。PR 作成→自動マージ | 毎週日 07:00 JST | — |
| 棚卸しリマインダー | 使用コンポーネントの棚卸しを促す GitHub Issue を自動作成 | 毎月1日 | — |
| Issue 駆動の要望反映 | Issue に書いた要望を読み取り `source.yaml`/`interests.yaml` に反映。PR 作成→自動マージ | Issue 作成時 | — |
| Inoreader スター連携 | スター付き記事を取得しフィード監査の採用実績に統合 | 毎週日 06:00 JST | — |

3 パイプラインとも claude / kubernetes / aws の 3 ドメイン。計 9 フィード。

## フィード管理

`source.yaml` が購読リストの正。1 エントリ = `{url, name, domain, kind}`。
`domain` は claude / kubernetes / aws、`kind` は content（翻訳＋レポート）/ release（週次リリース）。
公開前提なので、趣味・キー付き URL は入れない。選定基準・関心領域は `report-criteria/<name>.md` と
`interests.yaml`（ドメインごとの関心キーワード）。

追加・削除は基本的に週次のフィード監査（不採用フィードの無効化・新規フィード提案）と
Issue 駆動の要望反映が自動でやる。すぐ反映したい場合は下記タスクを手動実行するか、
Issue を作って要望を書く。

## タスク

普段は GitHub Actions が自動実行する。手動で試したい・すぐ反映したいときに使う。

```sh
mise install      # bun
bun install
```

| コマンド | 内容 |
| --- | --- |
| `mise run translate` | 全ドメインの content フィードを取得・翻訳して `translated-<domain>.xml` を再生成 |
| `mise run report:collect <domain>` | 直近 24h を `.cache/report-<domain>-input.json` へ |
| `mise run report:render <domain>` | `.cache/report-<domain>.md` → `docs/report/<domain>/*.html` と `report-<domain>.xml` |
| `mise run release:collect <domain>` | 直近 7 日のリリースを `.cache/release-<domain>-input.json` へ |
| `mise run release:render <domain>` | `.cache/release-<domain>.md` → `docs/release/<domain>/*.html` と `release-<domain>.xml` |
| `mise run build` | `docs/index.html` / `subscriptions.opml` / assets を再生成 |
| `mise run serve` | `docs/` をローカルプレビュー |

翻訳を試すには `DEEPL_API_KEY=... mise run translate`。

## Secrets（設定済み）

| 名前 | 用途 |
| --- | --- |
| `DEEPL_API_KEY` | タイトル・概要の翻訳（DeepL API。Free キーは末尾 `:fx`）。未設定なら未翻訳のまま通す |
| `OPENCODE_API_KEY` | レポート・フィード監査・Issue 対応のキュレーション。OpenCode Go（`https://opencode.ai/zen/go`）経由で DeepSeek モデルを使う。`claude-code-action` の `anthropic_api_key`/`ANTHROPIC_CUSTOM_HEADERS` に渡している |
| `CLAUDE_CODE_OAUTH_TOKEN` | 未使用（切り戻し用に残置）。Anthropic 直接に戻す場合はワークフロー内の `env`/`with` を元に戻して使う |

## Secrets（未設定・任意）

Inoreader スター連携（フィード監査の学習フィードバック）を使う場合のみ必要。
未設定でもワークフローは失敗せず、スター連携だけスキップされる。

| 名前 | 用途 |
| --- | --- |
| `INOREADER_CLIENT_ID` / `INOREADER_CLIENT_SECRET` | Inoreader の OAuth アプリ登録情報 |
| `INOREADER_REFRESH_TOKEN` | 上記アプリで発行した refresh token |

ワークフロー・スケジュール・内部構成は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。
