# RSS 運用リポジトリ 設計

## 目的

Claude / Kubernetes / AWS の情報を日本語で追うための個人用 RSS 基盤。GitHub Actions だけで完結させ、
生成物を GitHub Pages（`main:/docs`）で公開する。読むのは自分の RSS リーダー（Inoreader など）。

**機能は混ぜない。** ドメイン（claude / kubernetes / aws）ごとに独立したパイプラインを持ち、
入力フィード・出力・スケジュール・状態を共有しない。共有するのはコード（処理関数）だけ。

| パイプライン | 入力 | Claude | 出力 | 頻度 |
| --- | --- | --- | --- | --- |
| 翻訳フィード | 各ドメインの content フィード | 使わない（DeepL のみ） | `translated-<domain>.xml` | 6 時間ごと |
| レポート | `translated-<domain>.xml` の直近 24h | 重要記事を 5〜10 件選定 | `report-<domain>.xml` ＋ `report/<domain>/YYYY-MM-DD.html` | 毎日 07:00 JST |
| リリースレポート | 各ドメインの release フィードの直近 7 日 | 注目リリースを整理 | `release-<domain>.xml` ＋ `release/<domain>/YYYY-MM-DD.html` | 毎週月 07:30 JST |

- 翻訳・レポートのドメイン: claude / kubernetes / aws
- リリースレポートのドメイン: aws / kubernetes

## 全体構成

| 項目 | 決定 |
| --- | --- |
| ランタイム | Bun + TypeScript |
| ツール/タスク管理 | mise |
| Lint / Format | Biome |
| パッケージ構成 | 単一パッケージ |
| 実行基盤 | すべて GitHub Actions。ローカル常用スクリプトは持たない |
| 公開 | GitHub Pages（deploy from branch, `main:/docs`）。`https://ogontaro.github.io/rss/` |
| カスタムドメイン | 使わない |
| 翻訳エンジン | DeepL API（Free キーは末尾 `:fx`）。未設定なら未翻訳のまま通す |
| AI 呼び出し | `anthropics/claude-code-action@v1`（ワークフローの一ステップ、`--allowedTools Read,Write`） |

## データ: feeds.yaml

購読フィードの正。1 エントリ = `{url, name, domain, kind}`。

```yaml
feeds:
  - url: https://example.com/feed.xml
    name: Example
    domain: claude        # claude | kubernetes | aws
    kind: content         # content（翻訳＋レポート）| release（週次リリースレポート）
```

- 公開前提。趣味・個人性の強いフィード、キーや userId を URL に含むフィードは入れない
- OPML 一括インポートは持たない（全部入りになり混ざるため）。フィードは手で管理する
- aws / content は **EKS 関連と AI/Bedrock 関連を重点**（`report-criteria/report-aws.md`）

## パイプライン詳細

### 翻訳フィード（`src/translate.ts`, 6 時間ごと）

ドメインごとに:

1. `feeds.yaml` の `kind: content` かつ当該ドメインを取得。
2. 既存 `docs/translated-<domain>.xml` の guid 集合と照合、新規のみ処理。
3. 新規エントリのタイトルと description を DeepL で日本語化。
4. 既存に足して公開日時の降順で **直近 100 件**に truncate、`docs/translated-<domain>.xml` を再生成。

- そのドメインで **1 フィードも取得できなかった実行は書き換えない**（空フィードで guid 集合を消さない）。
- `--strict`（`translate.yml` で付与）はどれか 1 ドメインでも取得ゼロなら異常終了。
  `report.yml` から呼ぶときは付けない（取れたぶんだけ更新して先へ進む）。

各エントリ: 翻訳タイトル ＋ 末尾にソース名 / 翻訳 description / link は原文 URL /
content は「原文を読む」＋「Google 翻訳で全文を読む」の 2 リンクのみ（本文は転載しない）。

**Google 翻訳リンク**: `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(記事URL)}`。
URL 全体を `encodeURIComponent`。生成前にスペースを除去（`%20`/`+` が `u=` に入ると HTTP 400）。

### レポート（`report.yml`, 毎日 07:00 JST = cron `0 22 * * *`）

先頭で `src/translate.ts`（`--strict` なし）を実行して全ドメインの翻訳フィードを最新化 →
ワークフロー単体で完結させる。以降ドメインごとに:

1. `src/report-collect.ts <domain>`: `translated-<domain>.xml` を読み、`pubDate` が過去 24h の
   エントリを新しい順に **最大 50 件**、`.cache/report-<domain>-input.json` に書き出す。
2. 入力が 0 件ならそのドメインはスキップ（`if:` ガード）。
3. `claude-code-action`: `.cache/report-<domain>-input.json` と `report-criteria/report-<domain>.md` を読み、
   基準どおりに `.cache/report-<domain>.md` を書く。
4. `src/report-render.ts <domain>`: md → `docs/report/<domain>/YYYY-MM-DD.html`、
   保持期間（14 日）より古い HTML を削除し、残ったページ一覧から `docs/report-<domain>.xml` を
   再生成（直近 60 エントリ）。

### リリースレポート（`release.yml`, 毎週月 07:30 JST = cron `30 22 * * 0`）

ドメイン（aws / kubernetes）ごとに:

1. `src/release-collect.ts <domain>`: `kind: release` の feed から過去 7 日のリリースを取得。
   `project` / `version` / `link` / `notes`（英語原文、4000 字で truncate）を
   `.cache/release-<domain>-input.json` に書き出す。翻訳サービスは通さない。
2. 0 件ならスキップ。
3. `claude-code-action`: 入力と `report-criteria/release-<domain>.md` を読み、
   プロジェクト単位・破壊的変更を先頭にした日本語ダイジェストを `.cache/release-<domain>.md` に書く。
4. `src/release-render.ts <domain>`: md → `docs/release/<domain>/YYYY-MM-DD.html`、
   `docs/release-<domain>.xml` を再生成（直近 26 エントリ）。

### サイト（`src/build.ts`, 各ワークフローの末尾）

- `docs/assets/style.css` を書き出す（単一オーナー）
- `docs/subscriptions.opml` を生成（全 8 フィードの一括購読用）
- `docs/index.html` をダッシュボードとして再生成: ドメインごとに最新レポート日へのリンクと各フィード URL

## 状態管理

専用ストアを持たない。生成物そのものを状態とする。

- 翻訳: 既存 `translated-<domain>.xml` の guid 集合に無いものだけ処理。
- レポート / リリース: `report/<domain>/YYYY-MM-DD.html` が既にあればその日はスキップ。
- 各フィードは件数上限で truncate（翻訳 100 / レポート 60 / リリース 26）。

> `translated-*.xml` / `report-*.xml` / `release-*.xml` は **CI でのみ生成する**。ローカル生成物を
> コミットしない。guid は永続で、翻訳エンジン未設定のパススルー実行でもエントリは「翻訳済み」として
> guid 集合に入り、本番でも再翻訳されない。初期コミットに含めるのは `docs/index.html` /
> `docs/assets/` / `docs/subscriptions.opml` だけ。

## GitHub Actions

| ファイル | トリガー | 内容 |
| --- | --- | --- |
| `translate.yml` | `0 */6 * * *` ＋ dispatch | 全ドメイン翻訳（`--strict`）→ build → commit |
| `report.yml` | `0 22 * * *` ＋ dispatch | 翻訳最新化 → ドメインごとに collect / claude-code-action / render → build → commit |
| `release.yml` | `30 22 * * 0` ＋ dispatch | ドメインごとに collect / claude-code-action / render → build → commit |

- 3 ワークフローとも `concurrency: { group: docs-write }` で `docs/` の書き込みを直列化。
- commit ステップは `permissions: contents: write` ＋ `git push "https://x-access-token:${GITHUB_TOKEN}@github.com/..."`。
  `claude-code-action` が git 認証情報を書き換えるため、素の `git push` は認証失敗する。
- Secrets: `DEEPL_API_KEY` / `CLAUDE_CODE_OAUTH_TOKEN`（`claude setup-token`、約 1 年・自動更新なし、
  401 で落ちたら手動差し替え）。

### 既知の運用リスク

- `GITHUB_TOKEN` の push で `pages-build-deployment` が自動起動することは検証済み。
- `claude-code-action` はスケジュール実行に human-actor チェックを適用し、cron を最後に編集した
  ユーザーに実行を帰属させる。通らないとそのレポートが止まり、症状は「ワークフロー失敗」だけ。
- レポートは 1 日あたり **claude-code-action を最大 3 回**（ドメイン数）、月曜は追加で最大 2 回。
  CI 利用はサブスクの 5 時間ローリング枠を消費する。

## ディレクトリ構成

```
feeds.yaml
report-criteria/
  report-claude.md  report-kubernetes.md  report-aws.md  release-aws.md  release-kubernetes.md
src/
  lib/           config / feeds取得 / translate / domain-feed(RSS入出力) / html / style / labels / urls / types
  translate.ts
  report-collect.ts   report-render.ts
  release-collect.ts  release-render.ts
  build.ts
docs/            GitHub Pages 配信対象。ワークフローがコミット
.github/workflows/  translate.yml  report.yml  release.yml
```

mise タスク: `translate` / `report:collect <domain>` / `report:render <domain>` /
`release:collect <domain>` / `release:render <domain>` / `build` / `serve` / `lint` / `format`。

## スコープ外

- Inoreader API 連携、OPML インポート
- 記事本文の全文翻訳・転載（タイトルと description のみ、本文は Google 翻訳リンク）
- SSG（`marked` ＋ テンプレートリテラル ＋ `feed` の最小構成）
- 状態管理用の DB / 台帳ファイル
- 例外処理・リトライの作り込み（失敗は落として通知）
