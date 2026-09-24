# 実装

普段の使い方は [README.md](./README.md) を参照。ここではパイプラインの内部構成と設計判断を扱う。

## 開発環境

```sh
mise install      # bun
bun install
```

```sh
mise run lint      # Biome
mise run format    # Biome
mise run serve     # docs/ をローカルプレビュー
```

## 設計方針

**翻訳配信とデイジェストは混ぜない。** ニーズが違う。翻訳は海外サイトの新着をそのまま日本語で
拾い読みする全量ストリーム(選定・コメントなし、1サイト=1フィード)。デイジェストは Claude が
選定・整理するレポート/リリース(ドメイン単位)。デイジェストは翻訳の出力を入力に読むが、
逆方向の依存も成果物の共有もしない。

**ドメインごとに状態を共有しない。** 入力フィード・出力・スケジュールを分ける。共有するのは
`src/lib/`(パス・URL・翻訳エンジン等の低レベル関数)だけ。実装はサービス別にディレクトリを分ける:
`src/translate/`(B)、`src/digest/`(A)、`src/site/`(両者のページ・OPML 生成)。

| パイプライン | 入力 | Claude | 出力 | 頻度 |
| --- | --- | --- | --- | --- |
| 翻訳フィード | 海外サイトの content フィード(日本語サイトは対象外) | 使わない（DeepL のみ） | `translated/<id>.xml` ＋ `translated/index.html` | 6 時間ごと |
| レポート | 翻訳フィードの直近 24h + 日本語サイトは購読元を直接取得 | 重要記事を 5〜10 件選定 | `digest/report-<domain>.xml` ＋ `digest/report/<domain>/YYYY-MM-DD.html` | 毎日 07:00 JST |
| リリースレポート | 各ドメインの release フィードの直近 7 日 | 注目リリースを整理 | `digest/release-<domain>.xml` ＋ `digest/release/<domain>/YYYY-MM-DD.html` | 毎週月 07:30 JST |
| フィード監査 | `source.yaml` の採用実績（`adoption-log.ndjson`）＋ `interests.yaml` | 無効化候補判定＋新規フィード探索 | `source.yaml` への PR（自動マージ） | 毎週日 07:00 JST |
| Issue 駆動反映 | Issue のタイトル・本文 | 要望を読み取り変更を判断 | `source.yaml`/`interests.yaml` への PR（自動マージ） | Issue 作成時 |

- レポートは claude / kubernetes / aws の 3 ドメイン。リリースレポートは devtools を加えた 4 ドメイン
- フィード監査・Issue 駆動反映はドメイン非依存（`source.yaml`/`interests.yaml` 全体を扱う）

## 全体構成

| 項目 | 決定 |
| --- | --- |
| ランタイム | Bun + TypeScript |
| ツール/タスク管理 | mise |
| Lint / Format | Biome |
| パッケージ構成 | 単一パッケージ |
| 実行基盤 | すべて GitHub Actions。ローカル常用スクリプトは持たない |
| 公開 | GitHub Pages（deploy from branch, `main:/docs`）。`https://ogontaro.github.io/feeds/` |
| カスタムドメイン | 使わない |
| 翻訳エンジン | DeepL API（Free キーは末尾 `:fx`）。未設定なら未翻訳のまま通す |
| AI 呼び出し | `anthropics/claude-code-action@v1`（ワークフローの一ステップ、`--allowedTools Read,Write`）。OpenCode Go（`https://opencode.ai/zen/go`）経由で DeepSeek を使う。各ステップの `env` に `ANTHROPIC_BASE_URL`/`ANTHROPIC_CUSTOM_HEADERS`/`OTEL_RESOURCE_ATTRIBUTES`、`with.anthropic_api_key` に `OPENCODE_API_KEY`、`claude_args` に `--model deepseek-v4.1-flash[1m]` を指定 |

## データ: source.yaml

購読フィードの正。1 エントリ = `{url, name, domain, kind, id?, enabled?, addedAt?, lastAdoptedAt?}`。
`addedAt`/`lastAdoptedAt` はフィード監査（後述）が採用実績を追跡するためのメタデータ。
`id` は翻訳フィードのファイル識別子（[a-z0-9-]）。海外サイトの content エントリは必須、
日本語サイトと release は不要（`needsTranslation` 判定で自動的に使い分けられる）。

```yaml
feeds:
  - url: https://example.com/feed.xml
    name: Example
    id: example           # 海外サイトの content のみ必須 → translated/example.xml
    domain: claude        # claude | kubernetes | aws | devtools
    kind: content         # content（翻訳＋レポート）| release（週次リリースレポート）
```

- 公開前提。趣味・個人性の強いフィード、キーや userId を URL に含むフィードは入れない
- OPML はサービス別に2つ（`opml/digest.opml` / `opml/translated.opml`）。全部入りの1本は
  目的の違うフィードが混ざるので作らない
- aws / content は **EKS 関連と AI/Bedrock 関連を重点**（`report-criteria/report-aws.md`）
- claude / content の新規ツール発見源は、記事化されるのを待たず GitHub 上のリポジトリ自体も対象にする
  （週次フィード監査の WebSearch も同様）。ただし whole-repo の `commits.atom` は bot/CI コミットで
  ノイズだらけになるため使わない。path 指定の commits atom を使う（実装例は `source.yaml` の
  `awesome-claude-code` 参照）

## データ: interests.yaml

ドメインごとの関心キーワード。`report-criteria/*.md`（自然言語の選定基準）とは別に、
フィード選定・週次フィード監査の WebSearch クエリ・レポート選別の入力として使う構造化データ。

```yaml
interests:
  claude:
    include: [Claude, Anthropic, AIエディタ, agents.md]
    exclude: [仮想通貨, NFT]
  kubernetes:
    include: [Platform Engineering, GitOps]
    exclude: []
  aws:
    include: [Bedrock, EKS]
    exclude: []
```

## パイプライン詳細

### 翻訳フィード（`src/translate/run.ts`, 6 時間ごと）

海外サイトの content フィードごとに（1サイト=1フィード）:

1. `source.yaml` の `kind: content` のうち `needsTranslation`（＝記事 URL が日本語ソースでない）を満たすもの only。日本語サイトは翻訳フィードを作らない。
2. 既存 `docs/translated/<id>.xml` の guid 集合と照合、新規のみ処理。
3. 新規エントリのタイトルと description を DeepL で日本語化。
4. 既存に足して公開日時の降順で **直近 100 件**に truncate、`docs/translated/<id>.xml` を再生成。

- **1 フィードも取得できなかったサイトは書き換えない**（空フィードで guid 集合を消さない）。
- `--strict`（`translate.yml` で付与）はどれか 1 サイトでも取得ゼロなら異常終了。
  `report.yml` から呼ぶときは付けない（取れたぶんだけ更新して先へ進む）。
- 1 フィードあたりの取り込みは最大 20 件（新しい順）。全履歴を返すミラー・アグリゲータ系
  フィードでも翻訳枠と DeepL の 1 リクエスト 50 件制限を超えないための上限。

各エントリ: 翻訳タイトル ＋ 翻訳 description / link は原文 URL /
content は「原文を読む」＋（海外記事のみ）「Google 翻訳で全文を読む」の 2 リンク。本文・選定コメントは転載しない。
記事 URL が日本語ソース（`src/lib/urls.ts` の `JA_SOURCE_HOSTS`、はてな / Zenn 等）のものは翻訳自体をスキップ。

**Google 翻訳リンク**: `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(記事URL)}`。
URL 全体を `encodeURIComponent`。生成前にスペースを除去（`%20`/`+` が `u=` に入ると HTTP 400）。

### レポート（`report.yml`, 毎日 07:00 JST = cron `0 22 * * *`）

先頭で `src/translate/run.ts`（`--strict` なし）を実行して翻訳フィードを最新化 →
ワークフロー単体で完結させる。以降ドメインごとに:

1. `src/digest/report-collect.ts <domain>`: 当該ドメインの content フィードのうち海外サイトは `translated/<id>.xml` を読み、日本語サイトは購読元を直接取得。`pubDate` が過去 24h の
   エントリを新しい順に **最大 50 件**、`.cache/report-<domain>-input.json` に書き出す。
2. 入力が 0 件ならそのドメインはスキップ（`if:` ガード）。
3. `claude-code-action`: `.cache/report-<domain>-input.json` と `report-criteria/report-<domain>.md` を読み、
   基準どおりに `.cache/report-<domain>.md` を書く。
4. `src/digest/report-render.ts <domain>`: md → `docs/digest/report/<domain>/YYYY-MM-DD.html`、
   保持期間（14 日）より古い HTML を削除し、残ったページ一覧から `docs/digest/report-<domain>.xml` を
   再生成（直近 60 エントリ）。

### リリースレポート（`release.yml`, 毎週月 07:30 JST = cron `30 22 * * 0`）

ドメイン（claude / kubernetes / aws / devtools）ごとに:

1. `src/digest/release-collect.ts <domain>`: `kind: release` の feed から過去 7 日のリリースを取得。
   `project` / `version` / `link` / `notes`（英語原文、4000 字で truncate）を
   `.cache/release-<domain>-input.json` に書き出す。翻訳サービスは通さない。
2. 0 件ならスキップ。
3. `claude-code-action`: 入力と `report-criteria/release-<domain>.md` を読み、
   プロジェクト単位・破壊的変更を先頭にした日本語ダイジェストを `.cache/release-<domain>.md` に書く。
4. `src/digest/release-render.ts <domain>`: md → `docs/digest/release/<domain>/YYYY-MM-DD.html`、
   `docs/digest/release-<domain>.xml` を再生成（直近 26 エントリ）。

### フィード出典トラッキング（`adoption-log.ndjson`）

`report-render.ts` / `release-render.ts` が、生成した Markdown に実際に引用された記事の
リンクを入力 JSON と突き合わせ、採用された `sourceName`（= `source.yaml` の `name`）を
`{date, domain, sourceName}` の1行 JSON として追記する（追記専用、`.gitignore` 対象外）。
`source.yaml` 自体を書き換えると YAML コメント・構造が壊れるため、判定用の集計は
このログ側で行い、`source.yaml` への反映（`enabled: false` 等）はフィード監査が担う。

### フィード監査（`feed-audit.yml`, 毎週日 07:00 JST = cron `0 22 * * 6`）

1. `src/feed-audit-collect.ts`: `adoption-log.ndjson` と `starred-log.ndjson` を集計し、
   直近 8 週間（56 日）採用実績が無い `content` フィードを無効化候補として
   `.cache/feed-audit-input.json` に書き出す（`release` フィードは対象外。リリースが
   無いのは普通のことで「不採用」の根拠にならない）。
2. `claude-code-action`: 候補・`interests.yaml`・`source.yaml` を読み、無効化候補のうち
   明確にノイズ・停止していそうなものだけ `enabled: false` にする。あわせて
   `interests.yaml` の `include` キーワードで WebSearch し、ドメインごとに新規フィード
   候補を 1〜2件、`addedAt` 付きで `source.yaml` に追加する（既存の YAML コメント・
   構造は保ったまま編集）。`--allowedTools Read,Write,WebSearch`。
3. `src/feed-audit-validate.ts`: 今日 `addedAt` が付いた新規エントリだけを対象に、
   実際に RSS/Atom として取得・パースでき、直近 30 日以内の更新があるかを検証。
   通らないものは `source.yaml` から削除する（`yaml` パッケージの `parseDocument` で
   コメント保持したまま部分編集）。
4. 変更があればブランチを切ってコミット・push、`gh pr create` → `gh pr merge --auto --squash`。

`claude-code-action` は PR の自動作成・自動マージができない設計（人間の最終確認を必須にする
セキュリティ方針）のため、コミットまでを同アクションが担い、PR 作成とマージはワークフロー内の
素の `gh` コマンドで行う。

### Issue 駆動の要望反映（`issue-request.yml`, Issue 作成時）

Issue のタイトル・本文を `claude-code-action` に渡し、`source.yaml`/`interests.yaml` への
変更（フィード追加・無効化、関心キーワードの追加・削除）を判断して直接編集させる。
要望が不明瞭・無関係なら何も変更しない。変更があればフィード監査と同じ
検証（`feed-audit-validate.ts`）→ PR 作成 → 自動マージの流れに乗る。
棚卸しリマインダー（後述）が作る `component-review` ラベル付き Issue はこのワークフローの
対象から除外する。

本リポジトリは public のため誰でも Issue を作成でき、`issues: opened` はそのままだと
第三者にもトリガーされる。`claude-code-action` 自体に write/admin 権限のない actor では
処理をスキップする組み込みガード（`checkWritePermissions`）があるが、ジョブの起動自体は
防げないため、ワークフロー側の `if` にも `github.event.issue.user.login ==
github.repository_owner` を明示し、リポジトリオーナー以外の Issue ではジョブごと起動しない
ようにしている（多層防御）。`workflow_dispatch`/`schedule` は GitHub の仕様上そもそも
write 権限保持者しか実行できない。

### 棚卸しリマインダー（`component-review-reminder.yml`, 毎月1日）

`gh issue create` で「使用コンポーネントの棚卸し」を促す Issue を自動作成するだけ。
自動検出はしない（自宅クラスタや日常使いのツールをコードから検出する手段が無いため）。
気づいたら本人が `source.yaml` に反映する運用と組み合わせる。

### Inoreader スター連携（`inoreader-sync.yml`, 毎週日 06:00 JST）

`src/inoreader-starred.ts` が Inoreader の Reader API（OAuth2, refresh token）で
スター付きアイテムを取得し、`starred-log.ndjson` に追記する。フィード監査の
採用実績集計にそのまま合流する（スターを付ける＝読まれて評価された、という扱い）。
`INOREADER_REFRESH_TOKEN` 未設定時は何もせず正常終了する（OAuth アプリ登録は
手動の一回きりの作業のため、それまでワークフローを失敗させない）。

### AIモデルのフォールバック（DeepSeek → qwen）

`claude-code-action` を使う全ステップは `continue-on-error: true` を付け、直後に
`if: steps.<id>.outcome == 'failure'` の qwen フォールバックステップを対にして置いている。
DeepSeek（OpenCode Go 経由）が不調でも自動で qwen に切り替わる。

時刻ベースの切り替えはしていない。OpenCode Go（`opencode.ai/zen/go`）の混雑時間帯は
DeepSeek 公式 API の割引時間帯とは別物で確認できないため、検証できない数字を
ハードコードするより、実際の失敗を検知して切り替える方が確実（`issue-request.yml` の
ようにトリガー時刻が読めないワークフローでも同じロジックで対応できる）。

### ワークフロー失敗対応（`translate/report/release/feed-audit/issue-request/
inoreader-sync/component-review-reminder.yml` 末尾の `notify-failure` ジョブ、
`workflow-failure-fix.yml`）

各ワークフローの末尾に `if: failure()` の `notify-failure` ジョブがあり、本体ジョブが
失敗すると `workflow-failure` ラベル付きの Issue を自動作成する（本文は run URL・
ワークフロー名のみ。public リポジトリのためログ全文は貼らない）。

`translate.yml` には対で「close resolved failure issues」ステップ（本体ジョブ成功時、
同一ワークフロー名の `workflow-failure` ラベル付き open Issue を検索してクローズ）があり、
一過性の失敗で作られた Issue が次回成功時に自動で片付く（AI 判断を挟まない決定的な
gh CLI 操作のみ）。他の 5 ワークフローへの横展開は未実施。

`workflow-failure-fix.yml` は対象7ワークフローの `workflow_run: completed` を
トリガーに、失敗（`conclusion == 'failure'`）を検知して `gh run view --log-failed` で
ログを読み、原因が自リポジトリのコード/ワークフロー定義にあれば小さな修正をして
PR を作成する（**自動マージしない**。既存の自動マージはフィード URL 1 行追加のみで
`feed-audit-validate.ts` 検証済みだが、ワークフロー/スクリプトの修正は blast radius が
桁違いのため人間レビュー必須）。一時的な上流障害（5xx・レート制限・モデル不可用等）は
プロンプトで明示的に「変更しない」よう指示している — でないと自動マージなしでも
無意味な PR が積み上がる。

`issues: opened` ではなく `workflow_run` を使っているのは、`GITHUB_TOKEN` で作成した
Issue は新しいワークフロー実行をトリガーしない（GitHub の再帰防止仕様）ため、
`notify-failure` が作った Issue では `issues: opened` が発火しないと実機検証で判明した
から。ループ防止は `workflows:` の対象一覧に `workflow-failure-fix` 自身を含めないことで
担保している。

### サイト（`src/site/build.ts`, 各ワークフローの末尾）

- `docs/assets/style.css` を書き出す（単一オーナー）
- サービスB: `docs/translated/index.html`（海外サイト一覧）と `docs/opml/translated.opml` を生成
- サービスA: `docs/index.html`（日次/週次レポート、ドメイン別に最新+過去一覧+購読リンク）と `docs/opml/digest.opml`、各ドメインの `docs/digest/report|release/<domain>/index.html`（過去一覧）を生成
- 実在しないフィードファイル（初回 CI 前の devtools 等）は OPML・購読リンクから除外

## 状態管理

専用ストアを持たない。生成物そのものを状態とする。

- 翻訳: 既存 `translated/<id>.xml` の guid 集合に無いものだけ処理。
- レポート / リリース: `digest/report|release/<domain>/YYYY-MM-DD.html` が既にあればその日はスキップ。
- 各フィードは件数上限で truncate（翻訳 100 / レポート 60 / リリース 26）。

> `translated/<id>.xml` / `digest/report-*.xml` / `digest/release-*.xml` は **CI でのみ生成する**。ローカル生成物を
> コミットしない。guid は永続で、翻訳エンジン未設定のパススルー実行でもエントリは「翻訳済み」として
> guid 集合に入り、本番でも再翻訳されない。初期コミットに含めるのは `docs/index.html` /
> `docs/translated/index.html` / `docs/assets/` / `docs/opml/` だけ。

## GitHub Actions

| ファイル | トリガー | 内容 |
| --- | --- | --- |
| `translate.yml` | `0 */6 * * *` ＋ dispatch | 海外サイトのサイト別翻訳（`--strict`）→ build → commit |
| `report.yml` | `0 22 * * *` ＋ dispatch | 翻訳最新化 → ドメインごとに collect / claude-code-action / render → build → commit |
| `release.yml` | `30 22 * * 0` ＋ dispatch | ドメインごとに collect / claude-code-action / render → build → commit |
| `feed-audit.yml` | `0 22 * * 6` ＋ dispatch | collect → claude-code-action → validate → PR 作成・自動マージ |
| `issue-request.yml` | `issues: opened` | claude-code-action → validate → PR 作成・自動マージ |
| `component-review-reminder.yml` | `0 0 1 * *` ＋ dispatch | 棚卸し Issue を作成 |
| `inoreader-sync.yml` | `0 21 * * 6` ＋ dispatch | スター取得 → commit |

- `docs/` を書き込む5ワークフロー（translate/report/release/feed-audit/inoreader-sync）は
  全て `concurrency: { group: docs-write }` で直列化。`source.yaml` の同時書き換えを防ぐ。
- commit ステップは `permissions: contents: write` ＋ `git push "https://x-access-token:${GITHUB_TOKEN}@github.com/..."`。
  `claude-code-action` が git 認証情報を書き換えるため、素の `git push` は認証失敗する。
- Secrets: `DEEPL_API_KEY` / `OPENCODE_API_KEY`（OpenCode Go 経由で DeepSeek を使うための
  APIキー。`anthropic_api_key`/`ANTHROPIC_CUSTOM_HEADERS` に渡す）。`CLAUDE_CODE_OAUTH_TOKEN`
  は Anthropic 直接に戻す場合の切り戻し用に残置（現状未使用）。`INOREADER_CLIENT_ID` /
  `INOREADER_CLIENT_SECRET` / `INOREADER_REFRESH_TOKEN` は任意（未設定ならスター連携だけスキップ）。

### 既知の運用リスク

- `GITHUB_TOKEN` の push で `pages-build-deployment` が自動起動することは検証済み。
- `claude-code-action` はスケジュール実行に human-actor チェックを適用し、cron を最後に編集した
  ユーザーに実行を帰属させる。通らないとそのレポートが止まり、症状は「ワークフロー失敗」だけ。
- レポートは 1 日あたり **claude-code-action を最大 3 回**（ドメイン数）、月曜は release.yml で
  追加で最大 4 回（claude / kubernetes / aws / devtools）。CI 利用はサブスクの
  5 時間ローリング枠を消費する。

## ディレクトリ構成

```
source.yaml
interests.yaml
adoption-log.ndjson    フィード採用実績ログ（追記専用）
starred-log.ndjson     Inoreader スター記録ログ（追記専用）
report-criteria/
  report-claude.md  report-kubernetes.md  report-aws.md
  release-claude.md  release-aws.md  release-kubernetes.md  release-devtools.md
src/
  lib/           config / feeds取得 / html / style / labels / urls / types / paths（低レベル共有）
  translate/     サービスB: run.ts（サイト別翻訳生成）engine.ts（DeepL）store.ts（translated/<id>.xml 入出力）
  digest/        サービスA: report-collect / report-render / release-collect / release-render
  site/          build.ts（index.html + translated/index.html + opml/ 生成）
  feed-audit-collect.ts  feed-audit-validate.ts  feed-audit-summarize.ts
  inoreader-starred.ts
docs/            GitHub Pages 配信対象。ワークフローがコミット
.github/workflows/
  translate.yml  report.yml  release.yml
  feed-audit.yml  issue-request.yml  component-review-reminder.yml  inoreader-sync.yml
```

mise タスク一覧は README の「タスク」参照。

## スコープ外

- Inoreader 側の購読管理・OPML インポート（ビューアとしてのみ使う。API 連携はスター取得のみ）
- 動的 Web アプリ化・自前のいいね/既読 UI（GitHub Pages の静的サイトのまま）
- 記事本文の全文翻訳・転載（タイトルと description のみ、本文は Google 翻訳リンク）
- SSG（`marked` ＋ テンプレートリテラル ＋ `feed` の最小構成）
- 状態管理用の DB（`adoption-log.ndjson`/`starred-log.ndjson` の追記ログのみ）
- 例外処理・リトライの作り込み（失敗は落として通知）
