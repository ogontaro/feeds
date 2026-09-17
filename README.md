# rss

Claude / Kubernetes / AWS の情報を日本語で追うための個人用 RSS 基盤。GitHub Actions で更新し、
GitHub Pages で公開する。実装の詳細は [CONTRIBUTING.md](./CONTRIBUTING.md)。

**公開先**: <https://ogontaro.github.io/rss/> ／ 一括購読 OPML: `https://ogontaro.github.io/rss/subscriptions.opml`

ドメイン（claude / kubernetes / aws）ごとに独立したパイプライン。機能は混ざらない。

| 種別 | 内容 | 頻度 | フィード |
| --- | --- | --- | --- |
| 翻訳フィード | 購読フィードの新着タイトル・概要を DeepL で日本語化 | 6 時間ごと | `translated-<domain>.xml` |
| レポート | 直近 24h の新着から Claude が重要記事を 5〜10 件選定・日本語コメント | 毎日 07:00 JST | `report-<domain>.xml` |
| リリースレポート | 直近 7 日のツールリリースを Claude が整理（破壊的変更を先頭） | 毎週月 07:30 JST | `release-<domain>.xml` |

3 パイプラインとも claude / kubernetes / aws の 3 ドメイン。計 9 フィード。

## フィード管理

`feeds.yaml` が購読リストの正。1 エントリ = `{url, name, domain, kind}`。
`domain` は claude / kubernetes / aws、`kind` は content（翻訳＋レポート）/ release（週次リリース）。
公開前提なので、趣味・キー付き URL は入れない。選定基準・関心領域は `report-criteria/<name>.md`。

追加・削除したら次回の定期実行（最短 6 時間後）で反映される。すぐ反映したい場合は
下記タスクを手動実行する。

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
| `CLAUDE_CODE_OAUTH_TOKEN` | レポートのキュレーション。`claude setup-token` で生成、約 1 年有効・自動更新なし。401 で落ちたら再生成 |

ワークフロー・スケジュール・内部構成は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。
