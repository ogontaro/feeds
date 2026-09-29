# 実装

普段の使い方は [README.md](./README.md) を参照してください。ここではパイプラインの内部構成と設計判断を扱います。

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

**翻訳配信とデイジェストは混ぜません。** ニーズが違います。翻訳は海外サイトの新着をそのまま日本語で
拾い読みする全量ストリームです(選定・コメントなし、1サイト=1フィード)。デイジェストは Claude が
選定・整理するレポート/リリースです(ドメイン単位)。デイジェストは翻訳の出力を入力に読みますが、
逆方向の依存も成果物の共有もしません。

**ドメインごとに状態を共有しません。** 入力フィード・出力・スケジュールを分けます。共有するのは
`src/lib/`(パス・URL・翻訳エンジン等の低レベル関数)だけです。実装はサービス別にディレクトリを分けています:
`src/translate/`(B)、`src/digest/`(A)、`src/site/`(両者のページ・OPML 生成)。

| パイプライン | 入力 | Claude | 出力 | 頻度 |
| --- | --- | --- | --- | --- |
| 翻訳フィード | 海外サイトの content フィード(日本語サイトは対象外) | 使わない（DeepL のみ） | `translated/<id>.xml` ＋ `translated/index.html` | 6 時間ごと |
| レポート | 翻訳フィードの直近 24h + 日本語サイトは購読元を直接取得 + X タイムラインの直近 24h | 見てほしいものだけ最大 5 件選定（X はドメインに合うものだけ混ぜる） | `digest/report-<domain>.xml` ＋ `digest/report/<domain>/YYYY-MM-DD.html` | 毎日 07:00 JST |
| X タイムライン取得 | X ホームタイムライン | 使わない | actions/cache 上の蓄積（レポートの追加入力） | 30 分ごと |
| リリースレポート | 各ドメインの release フィードの直近 7 日 | 注目リリースを整理 | `digest/release-<domain>.xml` ＋ `digest/release/<domain>/YYYY-MM-DD.html` | 毎週月 07:30 JST |
| 月次トレンド | 前月の日次レポート・週次リリース＋外部情報源の前月分＋前回のトレンドレポート | 潮流を三角測量で判定し、前月からの変化を書きます | `digest/trend.xml` ＋ `digest/trend/YYYY-MM.html` | 毎月2日 07:45 JST |
| フィード監査 | `source.yaml` の採用実績（`adoption-log.ndjson`）＋ `interests.yaml` | 無効化候補判定＋新規フィード探索 | `source.yaml` への PR（自動マージ） | 毎週日 07:00 JST |
| Issue 駆動反映 | Issue のタイトル・本文 | 要望を読み取り変更を判断 | `source.yaml`/`interests.yaml` への PR（自動マージ） | Issue 作成時 |

- レポートは claude / kubernetes / aws の 3 ドメインです。リリースレポートは devtools を加えた 4 ドメインです
- 月次トレンドだけはドメイン横断の1本です（業界全体の潮流を追う目的のため）
- X タイムラインは独立したレポート・カテゴリを持ちません。各ドメインのレポートが追加入力として読み、そのドメインに合うポストだけを記事と混ぜて載せます
- フィード監査・Issue 駆動反映はドメイン非依存です（`source.yaml`/`interests.yaml` 全体を扱います）

## 全体構成

| 項目 | 決定 |
| --- | --- |
| ランタイム | Bun + TypeScript |
| ツール/タスク管理 | mise |
| Lint / Format | Biome |
| パッケージ構成 | 単一パッケージ |
| 実行基盤 | すべて GitHub Actions です。ローカル常用スクリプトは持ちません |
| 公開 | GitHub Pages（deploy from branch, `main:/docs`）。`https://ogontaro.github.io/feeds/` |
| カスタムドメイン | 使わない |
| 翻訳エンジン | DeepL API（Free キーは末尾 `:fx`）。枠切れ時は MyMemory に切り替えます。キー未設定なら未翻訳のまま通します |
| AI 呼び出し | `anthropics/claude-code-action@v1`（ワークフローの一ステップ、`--allowedTools Read,Write`）。OpenCode Go（`https://opencode.ai/zen/go`）経由で DeepSeek を使います。各ステップの `env` に `ANTHROPIC_BASE_URL`/`ANTHROPIC_CUSTOM_HEADERS`/`OTEL_RESOURCE_ATTRIBUTES`、`with.anthropic_api_key` に `OPENCODE_API_KEY`、`claude_args` に `--model deepseek-v4.1-flash[1m]` を指定します |

## データ: source.yaml

購読フィードの正です。1 エントリ = `{url, name, domain, kind, id?, enabled?, addedAt?, lastAdoptedAt?}`。
`addedAt`/`lastAdoptedAt` はフィード監査（後述）が採用実績を追跡するためのメタデータです。
`id` は翻訳フィードのファイル識別子（[a-z0-9-]）です。海外サイトの content エントリは必須で、
日本語サイトと release は不要です（`needsTranslation` 判定で自動的に使い分けられます）。

```yaml
feeds:
  - url: https://example.com/feed.xml
    name: Example
    id: example           # 海外サイトの content のみ必須 → translated/example.xml
    domain: claude        # claude | kubernetes | aws | devtools
    kind: content         # content（翻訳＋レポート）| release（週次リリースレポート）
```

- 公開前提です。趣味・個人性の強いフィード、キーや userId を URL に含むフィードは入れません
- OPML はサービス別に2つです（`opml/digest.opml` / `opml/translated.opml`）。全部入りの1本は
  目的の違うフィードが混ざるので作りません
- aws / content は **EKS 関連と AI/Bedrock 関連を重点**です（`report-criteria/report-aws.md`）
- claude / content の新規ツール発見源は、記事化されるのを待たず GitHub 上のリポジトリ自体も対象にします
  （週次フィード監査の WebSearch も同様です）。ただし whole-repo の `commits.atom` は bot/CI コミットで
  ノイズだらけになるため使いません。path 指定の commits atom を使います（実装例は `source.yaml` の
  `awesome-claude-code` を参照してください）。README.md 自体を bot が更新するリポジトリは path 指定でも除けないので対象外です

## データ: landscape.yaml

技術ランドスケープの**全量**（`docs/digest/landscape.html` と `landscape/<項目>.html` の正）です。業界の潮流と、利用者の利用状況をまとめます。利用者の興味はここに持たず、`interests.yaml` の `landscape` 節が正です（AI が書くファイルに人の意図を混ぜないためです）。
日次・週次・月次レポートの AI ステップが参考資料として読みます（関連を説明するためだけに使い、載っていない記事を落としません）。

- `items`: `{name, summary, quadrant, ring, reason, since, lastCited, trend}`。`summary` は技術そのものの 1 文説明で、詳細ページに出ます。月次トレンドの実行時に更新されます（手で直してもよいです）。
  判定基準は `report-criteria/landscape.md` です
- `trend` はスクリプトが計算します: 前回に無ければ new、今月の月次トレンドで言及されれば up、衰退の指摘か 6 か月言及なしで down、それ以外は stable

## データ: interests.yaml

**本人が保守する興味リスト**です（AI・スクリプトは `landscape` 節を書き換えません）。2 つの節があります。

- `interests`: ドメインごとの関心キーワード。`report-criteria/*.md`（自然言語の選定基準）とは別に、
  フィード選定・週次フィード監査の WebSearch クエリ・レポート選別の入力として使う構造化データです
- `landscape`: 分野（`ai` / `platform` / `practice` / `ops`）ごとの `focus`（関心領域の文章）と `items`（`landscape.yaml` の項目名と完全一致）。
  ページ生成時に全量と突き合わせて「興味あり」を強調します。全量にない名前はページに「全量にまだない興味」と出て、次回の月次更新で AI が追加を検討します

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

landscape:
  platform:
    focus: 自宅 Kubernetes を GitOps で運用する
    items: [GitOps, IaC]
```

## パイプライン詳細

### 翻訳フィード（`src/translate/run.ts`, 6 時間ごと）

海外サイトの content フィードごとに（1サイト=1フィード）:

1. `source.yaml` の `kind: content` のうち `needsTranslation`（＝記事 URL が日本語ソースでない）を満たすもの only です。日本語サイトは翻訳フィードを作りません。
2. 既存 `docs/translated/<id>.xml` の guid 集合と照合し、新規のみ処理します。
3. 新規エントリのタイトルと description を DeepL で日本語化します。DeepL が枠切れ／認証エラーなら MyMemory（匿名・日次枠）に落とし、
   それも尽きたら未翻訳で公開します。Google News のリンク（`news.google.com/rss/articles/…`）は元記事 URL に解決します。
3a. 残った枠で、未翻訳のまま公開した直近 7 日のエントリ（1 フィード 10 件まで）を訳し直し、未解決の Google News リンクも解決し直します。
4. 既存に足して公開日時の降順で **直近 100 件**に truncate し、`docs/translated/<id>.xml` を再生成します。

- **1 フィードも取得できなかったサイトは書き換えません**（空フィードで guid 集合を消しません）。
- `--strict`（`translate.yml` で付与）はどれか 1 サイトでも取得ゼロなら異常終了します。
  `report.yml` から呼ぶときは付けません（取れたぶんだけ更新して先へ進みます）。
- 1 フィードあたりの取り込みは最大 20 件です（新しい順）。全履歴を返すミラー・アグリゲータ系
  フィードでも翻訳枠と DeepL の 1 リクエスト 50 件制限を超えないための上限です。

各エントリ: 翻訳タイトル ＋ 翻訳 description / link は原文 URL /
content は「原文を読む」＋（海外記事のみ）「Google 翻訳で全文を読む」の 2 リンクです。本文・選定コメントは転載しません。
記事 URL が日本語ソース（`src/lib/urls.ts` の `JA_SOURCE_HOSTS`、はてな / Zenn 等）のものは翻訳自体をスキップします。

**Google 翻訳リンク**: `https://translate.google.com/translate?sl=auto&tl=ja&u=${encodeURIComponent(記事URL)}`。
URL 全体を `encodeURIComponent` します。生成前にスペースを除去します（`%20`/`+` が `u=` に入ると HTTP 400）。

### レポート（`report.yml`, 毎日 07:00 JST = cron `0 22 * * *`）

先頭で `src/translate/run.ts`（`--strict` なし）を実行して翻訳フィードを最新化 →
ワークフロー単体で完結させます。以降ドメインごとに:

1. `src/digest/report-collect.ts <domain>`: 当該ドメインの content フィードのうち海外サイトは `translated/<id>.xml` を読み、日本語サイトは購読元を直接取得します。`pubDate` が過去 24h の
   エントリを新しい順に **1 ソース最大 8 件・全体で最大 50 件**、`.cache/report-<domain>-input.json` に書き出します。
2. 入力が 0 件ならそのドメインはスキップします（`if:` ガード）。
3. `claude-code-action`: `.cache/report-<domain>-input.json` と `report-criteria/report-<domain>.md` を読み、
   基準どおりに `.cache/report-<domain>.md` を書きます。
4. `src/digest/report-render.ts <domain>`: md → `docs/digest/report/<domain>/YYYY-MM-DD.html`、
   保持期間（35 日。月次トレンドが前月ぶんを読むため）より古い HTML を削除し、残ったページ一覧から `docs/digest/report-<domain>.xml` を
   再生成します（直近 60 エントリ）。

### X タイムライン（`timeline.yml` 30 分ごと ＋ `report.yml` の追加入力）

入力は自前 RSSHub の `twitter/home_latest`（フォロー中）と `twitter/home`（おすすめ）です（ホストは `x-timeline.ts` に直書き、キーは `RSSHUB_ACCESS_KEY`）。home_latest は 1 回の取得で
88 件(平日日中は ~8 時間ぶん)しか返らないため、取得と日次レポートを分けます。

1. `timeline.yml`（cron `5,35 * * * *`）: `actions/cache/restore` で蓄積を復元 →
   `src/digest/x-timeline.ts --strict` が取得して（5xx・通信エラーは 30 秒・60 秒待って再試行します）
   `.cache/x-timeline.json` に guid でマージし、初回取得時刻（`seen`）から 7 日で刈り込みます →
   `actions/cache/save`（一部ルートが失敗して異常終了しても取得できた分は保存します。失敗 Issue は開いているものがあれば増やしません）。
   毎回 `METRIC home_latest total= overlap= depth_h=` をログに出します。`depth_h` は今回の 88 件のうち最も早く
   初回取得した時刻から今までの時間で、これより長く間隔を空けると取りこぼします（取得間隔の余裕の監視用です）。
   重なりが 0 件なら取りこぼしとして `::warning::` を出します。キャッシュは上書きできないので key は実行ごとに一意で
   （`x-timeline-<run_id>-<run_attempt>`）、復元は `restore-keys: x-timeline-` の前方一致で最新を拾います。
2. `report.yml`: 同じ `path`/`restore-keys` で復元 → `x-timeline.ts`（`--strict` なし。取得に失敗しても
   蓄積だけで進みます）がその時点の取得分も足し、初回取得時刻が直近 24h のものを `.cache/x-recent.json` に書きます。
   投稿時刻ではなく初回取得時刻で切るのは、おすすめ（`home`）が数日前の投稿も出すためです。
   各ドメインの curate がドメインの入力と一緒にこれを読み、`report-criteria/x-posts.md`（X 共通の扱い）と
   ドメインの選定基準に従って、そのドメインに合うポストだけを採ります。記事が 0 件でもポストがあれば curate を走らせます。
   report.yml も蓄積を保存します（しないと次の取得が同じポストを初見扱いにし、翌日のレポートにも載ります）。

公開されるのは選ばれた技術的なポストの要約とリンクだけです。ただし鍵アカウントをフォローしていると、そのポストも要約の対象になることがあります。
public リポジトリのため、プライバシーは次で担保します。

- 生のタイムラインはコミットしません（`.cache/` のみ・gitignore）。公開されるのは基準で選んだ技術ポストの要約だけです
- スクリプトのログは件数のみです。取得エラーはステータスコードだけ出します（RSSHub のエラーページには認証トークンの
  一部が載るため、本文・ヘッダ・URL は出しません。失敗ログは workflow-failure-fix が PR/Issue に転記することがあります）
- 投稿者は URL 上のハンドルだけ持ちます（表示名は保存しません）。`adoption-log.ndjson` には記録しません（採用ログはドメイン入力だけを見るので X のポストは入りません）
- `RSSHUB_ACCESS_KEY` は collect ステップの `env` にだけ渡します（claude-code-action には渡りません）
- キャッシュを読めるのはこのリポジトリのワークフローだけです。`pull_request` / `pull_request_target` トリガーの
  ワークフローを追加するとフォーク PR からキャッシュを読まれうるので追加しません
- claude-code-action はデバッグログ有効で再実行するとツール出力（入力のポスト）をログに出します。report.yml の失敗を
  デバッグログ付きで再実行しません
- `RSSHUB_ACCESS_KEY` 未設定時はスクリプトが空の入力を書いて正常終了し、レポートは記事だけで作ります

### リリースレポート（`release.yml`, 毎週月 07:30 JST = cron `30 22 * * 0`）

ドメイン（claude / kubernetes / aws / devtools）ごとに:

1. `src/digest/release-collect.ts <domain>`: `kind: release` の feed から過去 7 日のリリースを取得します。
   `project` / `version` / `link` / `notes`（英語原文、4000 字で truncate）を
   `.cache/release-<domain>-input.json` に書き出します。翻訳サービスは通しません。
2. 0 件ならスキップします。
3. `claude-code-action`: 入力と `report-criteria/release-<domain>.md` を読み、
   プロジェクト単位・破壊的変更を先頭にした日本語ダイジェストを `.cache/release-<domain>.md` に書きます。
4. `src/digest/release-render.ts <domain>`: md → `docs/digest/release/<domain>/YYYY-MM-DD.html`、
   `docs/digest/release-<domain>.xml` を再生成します（直近 26 エントリ）。

### 月次トレンド（`trend.yml`, 毎月2日 07:45 JST = cron `45 22 1 * *`）

SRE から Platform Engineering / IDP が出てきたような、概念・呼称の出現と定着を月単位で追います。
ドメイン横断の1本です。

1. `src/digest/trend-collect.ts [YYYY-MM]`: 対象月（省略時は JST の前月）について次を `.cache/trend-input.md` に書き出します（JSON だと本文が 1 行に潰れ、Read ツールが長い行を切り詰めるため Markdown です）。
   `docs/digest/trend/<月>.html` が既にあれば何も書かずに終わり、以降はスキップします。
   - 当月の日次レポート・週次リリースの本文（`<article>` をテキスト化）
   - スクリプト内 `SOURCES` の外部フィード（Thoughtworks / Martin Fowler / Stack Overflow / JetBrains /
     CNCF / Linux Foundation / PlatformEngineering.org / GitHub / Pragmatic Engineer / Publickey / CodeZine）の当月分です。
     各ソースに三角測量の種別の目安（定量調査・専門家判定・実活動データ・ニュース）を付けます。数えるかは記事の中身で判定します
   - 前回のトレンドレポート（前月からの変化を書くため）
2. `claude-code-action`: 入力と `report-criteria/trend.md` を読み `.cache/trend.md` を書きます。
   採否の段階付けはトレンドレポートに混ぜず、技術ランドスケープ（手順 4〜5）で扱います。
3. `src/digest/trend-render.ts`: md → `docs/digest/trend/YYYY-MM.html`、`docs/digest/trend.xml` を再生成します（直近 24 エントリ）。
4. `claude-code-action`: `landscape.yaml`・`.cache/trend.md`・`source.yaml`・`interests.yaml` と
   `report-criteria/landscape.md` を読み、更新案を `.cache/landscape-update.yaml` に書きます（`landscape.yaml` は直接書かせません）。
5. `src/digest/landscape-update.ts`: 更新案を検証（値の種類・重複・空の根拠は異常終了）して `landscape.yaml` にマージします。
   ファイル先頭のコメントは保持し、AI が書き漏らした既存項目は消さずに残します（外すのは `removed` に理由付きで挙げたものだけです）。
   `trend`（new / up / stable / down）・`since`・`lastCited` はここで計算します。ページは build.ts が生成します。

- 外部情報源は WebSearch ではなく RSS で取ります。AI 呼び出しが OpenCode Go 経由のため WebSearch が動作保証がなく検出困難なためです。
  取得件数が少ないソースがあるため、潮流は複数月で判定する前提にしています
- ドメインを持たないので `adoption-log.ndjson` には記録しません

### フィード出典トラッキング（`adoption-log.ndjson`）

`report-render.ts` / `release-render.ts` が、生成した Markdown に実際に引用された記事の
リンクを入力 JSON と突き合わせ、採用された `sourceName`（= `source.yaml` の `name`）を
`{date, domain, sourceName}` の1行 JSON として追記します（追記専用、`.gitignore` 対象外）。
`source.yaml` 自体を書き換えると YAML コメント・構造が壊れるため、判定用の集計は
このログ側で行い、`source.yaml` への反映（`enabled: false` 等）はフィード監査が担います。

### フィード監査（`feed-audit.yml`, 毎週日 07:00 JST = cron `0 22 * * 6`）

1. `src/feed-audit-collect.ts`: `adoption-log.ndjson` と `starred-log.ndjson` を集計し、
   直近 8 週間（56 日）採用実績が無い `content` フィードを無効化候補として
   `.cache/feed-audit-input.json` に書き出します（`release` フィードは対象外です。リリースが
   無いのは普通のことで「不採用」の根拠になりません）。
2. `claude-code-action`: 候補・`interests.yaml`・`source.yaml` を読み、無効化候補のうち
   明確にノイズ・停止していそうなものだけ `enabled: false` にします。あわせて
   `interests.yaml` の `include` キーワードで WebSearch し、ドメインごとに新規フィード
   候補を 1〜2件、`addedAt` 付きで `source.yaml` に追加します（既存の YAML コメント・
   構造は保ったまま編集します）。`--allowedTools Read,Write,WebSearch`。
3. `src/feed-audit-validate.ts`: 今日 `addedAt` が付いた新規エントリだけを対象に、
   実際に RSS/Atom として取得・パースでき、直近 30 日以内の更新があるかを検証します。
   通らないものは `source.yaml` から削除します（`yaml` パッケージの `parseDocument` で
   コメント保持したまま部分編集）。
4. 変更があればブランチを切ってコミット・push し、`gh pr create` → `gh pr merge --auto --squash`。

`claude-code-action` は PR の自動作成・自動マージができない設計（人間の最終確認を必須にする
セキュリティ方針）のため、コミットまでを同アクションが担い、PR 作成とマージはワークフロー内の
素の `gh` コマンドで行います。

### Issue 駆動の要望反映（`issue-request.yml`, Issue 作成時）

Issue のタイトル・本文を `claude-code-action` に渡し、`source.yaml`/`interests.yaml` への
変更（フィード追加・無効化、関心キーワードの追加・削除）を判断して直接編集させます。
要望が不明瞭・無関係なら何も変更しません。変更があればフィード監査と同じ
検証（`feed-audit-validate.ts`）→ PR 作成 → 自動マージの流れに乗ります。
棚卸しリマインダー（後述）が作る `component-review` ラベル付き Issue はこのワークフローの
対象から除外します。

本リポジトリは public のため誰でも Issue を作成でき、`issues: opened` はそのままだと
第三者にもトリガーされます。`claude-code-action` 自体に write/admin 権限のない actor では
処理をスキップする組み込みガード（`checkWritePermissions`）がありますが、ジョブの起動自体は
防げないため、ワークフロー側の `if` にも `github.event.issue.user.login ==
github.repository_owner` を明示し、リポジトリオーナー以外の Issue ではジョブごと起動しない
ようにしています（多層防御）。`workflow_dispatch`/`schedule` は GitHub の仕様上そもそも
write 権限保持者しか実行できません。

### 棚卸しリマインダー（`component-review-reminder.yml`, 毎月1日）

`gh issue create` で「使用コンポーネントの棚卸し」を促す Issue を自動作成するだけです。
自動検出はしません（自宅クラスタや日常使いのツールをコードから検出する手段が無いため）。
気づいたら本人が `source.yaml` に反映する運用と組み合わせます。

### Inoreader スター連携（`inoreader-sync.yml`, 毎週日 06:00 JST）

`src/inoreader-starred.ts` が Inoreader の Reader API（OAuth2, refresh token）で
スター付きアイテムを取得し、`starred-log.ndjson` に追記します。フィード監査の
採用実績集計にそのまま合流します（スターを付ける＝読まれて評価された、という扱いです）。
`INOREADER_REFRESH_TOKEN` 未設定時は何もせず正常終了します（OAuth アプリ登録は
手動の一回きりの作業のため、それまでワークフローを失敗させません）。

### AIモデルのフォールバック（DeepSeek → qwen）

`claude-code-action` を使う全ステップは `continue-on-error: true` を付け、直後に
`if: steps.<id>.outcome == 'failure'` の qwen フォールバックステップを対にして置いています。
DeepSeek（OpenCode Go 経由）が不調でも自動で qwen に切り替わります。

時刻ベースの切り替えはしていません。OpenCode Go（`opencode.ai/zen/go`）の混雑時間帯は
DeepSeek 公式 API の割引時間帯とは別物で確認できないため、検証できない数字を
ハードコードするより、実際の失敗を検知して切り替える方が確実です（`issue-request.yml` の
ようにトリガー時刻が読めないワークフローでも同じロジックで対応できます）。

### ワークフロー失敗対応（`translate/report/release/trend/feed-audit/issue-request/
inoreader-sync/timeline/component-review-reminder.yml` 末尾の `notify-failure` ジョブ、
`workflow-failure-fix.yml`）

各ワークフローの末尾に `if: failure()` の `notify-failure` ジョブがあり、本体ジョブが
失敗すると `workflow-failure` ラベル付きの Issue を自動作成します（本文は run URL・
ワークフロー名のみです。public リポジトリのためログ全文は貼りません）。

`translate/report/release/trend/feed-audit/issue-request/inoreader-sync/timeline.yml` の8ワークフローには
対で「close resolved failure issues」ステップ（本体ジョブ成功時、同一ワークフロー名の
`workflow-failure` ラベル付き open Issue を検索してクローズ）があり、一過性の失敗で作られた
Issue が次回成功時に自動で片付きます（AI 判断を挟まない決定的な gh CLI 操作のみです）。
`component-review-reminder.yml`（本業がissue作成）は対象外です。

`workflow-failure-fix.yml` は対象8ワークフロー（timeline は対象外です。次の取得ですぐ回復するため）の `workflow_run: completed` を
トリガーに、失敗（`conclusion == 'failure'`）を検知して `gh run view --log-failed` で
ログを読み、原因が自リポジトリのコード/ワークフロー定義にあれば小さな修正をして
PR を作成します（**自動マージしません**。既存の自動マージはフィード URL 1 行追加のみで
`feed-audit-validate.ts` 検証済みですが、ワークフロー/スクリプトの修正は blast radius が
桁違いのため人間レビュー必須です）。一時的な上流障害（5xx・レート制限・モデル不可用等）は
プロンプトで明示的に「変更しない」よう指示しています — でないと自動マージなしでも
無意味な PR が積み上がります。

コード修正が出なかった（`no fix produced`）場合、かつ元の失敗が `schedule` トリガーの
実行だった場合のみ、`gh workflow run <name>.yml` で元のワークフローを1回だけ即時再実行します
（一過性の上流障害を6時間待たずに自己修復させます）。無限ループ防止は再帰防止そのものではなく
イベント種別のガード: 再実行は `workflow_dispatch` として発火するため、それが再度失敗して
`workflow-failure-fix` が起動しても `event == 'schedule'` を満たさずリトライは発火しません
（`GITHUB_TOKEN` からの `workflow_dispatch` が実際に新規runを起動することは
`_test-a.yml`/`_test-b.yml` による実機検証で確認済みです。`push`/`issues:opened` 等の
自動イベントとは異なり `workflow_dispatch` は再帰防止の対象外です）。再実行後も失敗する場合は
Issue が残り、人間が判断します（現状と同じです）。

`issues: opened` ではなく `workflow_run` を使っているのは、`GITHUB_TOKEN` で作成した
Issue は新しいワークフロー実行をトリガーしない（GitHub の再帰防止仕様）ため、
`notify-failure` が作った Issue では `issues: opened` が発火しないと実機検証で判明した
からです。ループ防止は `workflows:` の対象一覧に `workflow-failure-fix` 自身を含めないことで
担保しています。

### サイト（`src/site/build.ts`, 各ワークフローの末尾）

- `docs/assets/style.css` を書き出します（単一オーナー）
- サービスB: `docs/translated/index.html`（海外サイト一覧）と `docs/opml/translated.opml` を生成します
- サービスA: `docs/index.html`（日次/週次/月次レポート、ドメイン別に最新+過去一覧+購読リンク）と `docs/opml/digest.opml`、各ドメインの `docs/digest/report|release/<domain>/index.html` と `docs/digest/trend/index.html`（過去一覧）、`landscape.yaml` から `docs/digest/landscape.html`（レーダー図）を生成します
- 実在しないフィードファイル（初回 CI 前の devtools 等）は OPML・購読リンクから除外します

## 状態管理

専用ストアを持ちません。生成物そのものを状態とします（例外: X タイムラインの蓄積は actions/cache 上の `.cache/x-timeline.json`。コミットしません）。

- 翻訳: 既存 `translated/<id>.xml` の guid 集合に無いものだけ処理します。
- レポート / リリース: `digest/report|release/<domain>/YYYY-MM-DD.html` が既にあればその日はスキップします。
- 月次トレンド: `digest/trend/YYYY-MM.html` が既にあればその月はスキップします。前月との差分の材料は前回のトレンド HTML です。
- 各フィードは件数上限で truncate します（翻訳 100 / レポート 60 / リリース 26 / トレンド 24）。

> `translated/<id>.xml` / `digest/report-*.xml` / `digest/release-*.xml` は **CI でのみ生成します**。ローカル生成物を
> コミットしません。guid は永続で、翻訳エンジン未設定のパススルー実行でもエントリは「翻訳済み」として
> guid 集合に入り、本番でも再翻訳されません。初期コミットに含めるのは `docs/index.html` /
> `docs/translated/index.html` / `docs/assets/` / `docs/opml/` だけです。

## GitHub Actions

| ファイル | トリガー | 内容 |
| --- | --- | --- |
| `translate.yml` | `0 */6 * * *` ＋ dispatch | 海外サイトのサイト別翻訳（`--strict`）→ build → commit |
| `report.yml` | `0 22 * * *` ＋ dispatch | 翻訳最新化 → ドメインごとに collect / claude-code-action / render → build → commit |
| `release.yml` | `30 22 * * 0` ＋ dispatch | ドメインごとに collect / claude-code-action / render → build → commit |
| `trend.yml` | `45 22 1 * *` ＋ dispatch（`month` 入力で対象月を指定可） | collect / claude-code-action / render → ランドスケープ更新案 / マージ → build → commit |
| `feed-audit.yml` | `0 22 * * 6` ＋ dispatch | collect → claude-code-action → validate → PR 作成・自動マージ |
| `issue-request.yml` | `issues: opened` | claude-code-action → validate → PR 作成・自動マージ |
| `component-review-reminder.yml` | `0 0 1 * *` ＋ dispatch | 棚卸し Issue を作成 |
| `inoreader-sync.yml` | `0 21 * * 6` ＋ dispatch | スター取得 → commit |
| `timeline.yml` | `5,35 * * * *` ＋ dispatch | X タイムライン取得 → actions/cache に蓄積（docs は書きません。`concurrency: x-timeline`） |

- `docs/` を書き込む6ワークフロー（translate/report/release/trend/feed-audit/inoreader-sync）は
  全て `concurrency: { group: docs-write }` で直列化しています。`source.yaml` の同時書き換えを防ぎます。
- commit ステップは `permissions: contents: write` ＋ `git push "https://x-access-token:${GITHUB_TOKEN}@github.com/..."`。
  `claude-code-action` が git 認証情報を書き換えるため、素の `git push` は認証失敗します。
- Secrets: `DEEPL_API_KEY` / `OPENCODE_API_KEY`（OpenCode Go 経由で DeepSeek を使うための
  APIキーです。`anthropic_api_key`/`ANTHROPIC_CUSTOM_HEADERS` に渡します）。`CLAUDE_CODE_OAUTH_TOKEN`
  は Anthropic 直接に戻す場合の切り戻し用に残置しています（現状未使用です）。`INOREADER_CLIENT_ID` /
  `INOREADER_CLIENT_SECRET` / `INOREADER_REFRESH_TOKEN` は任意です（未設定ならスター連携だけスキップします）。
  `RSSHUB_ACCESS_KEY` は任意です（未設定なら X タイムラインの取得だけスキップします）。

### 既知の運用リスク

- `GITHUB_TOKEN` の push で `pages-build-deployment` が自動起動することは検証済みです。
- `claude-code-action` はスケジュール実行に human-actor チェックを適用し、cron を最後に編集した
  ユーザーに実行を帰属させます。通らないとそのレポートが止まり、症状は「ワークフロー失敗」だけです。
- レポートは 1 日あたり **claude-code-action を最大 3 回**（ドメイン数）、月曜は release.yml で
  追加で最大 4 回（claude / kubernetes / aws / devtools）、毎月2日は trend.yml で 2 回（トレンド・ランドスケープ）です。CI 利用はサブスクの
  5 時間ローリング枠を消費します。

## ディレクトリ構成

```
source.yaml
interests.yaml
landscape.yaml         技術ランドスケープの全量（月次で AI が更新）。興味は interests.yaml の landscape 節
adoption-log.ndjson    フィード採用実績ログ（追記専用）
starred-log.ndjson     Inoreader スター記録ログ（追記専用）
report-criteria/
  report-claude.md  report-kubernetes.md  report-aws.md  x-posts.md（X ポストの共通の扱い）
  release-claude.md  release-aws.md  release-kubernetes.md  release-devtools.md
  trend.md（月次トレンドの判定基準）  landscape.md（技術ランドスケープの更新基準）
src/
  lib/           config / feeds取得 / html / style / labels / urls / types / paths（低レベル共有）
  translate/     サービスB: run.ts（サイト別翻訳生成）engine.ts（DeepL）store.ts（translated/<id>.xml 入出力）
  digest/        サービスA: report-collect / report-render / release-collect / release-render / trend-collect / trend-render / landscape-update / x-timeline
  site/          build.ts（index.html + translated/index.html + opml/ 生成）landscape.ts（技術ランドスケープのページ）
  feed-audit-collect.ts  feed-audit-validate.ts  feed-audit-summarize.ts
  inoreader-starred.ts
docs/            GitHub Pages 配信対象。ワークフローがコミット
.github/workflows/
  translate.yml  report.yml  release.yml  trend.yml
  feed-audit.yml  issue-request.yml  component-review-reminder.yml  inoreader-sync.yml  timeline.yml
```

各スクリプトは `bun run src/<パス>.ts [引数]` で単体実行できます（例: `bun run src/digest/report-collect.ts claude`）。
翻訳を試すには `DEEPL_API_KEY=... bun run src/translate/run.ts`。

## スコープ外

- Inoreader 側の購読管理・OPML インポート（ビューアとしてのみ使います。API 連携はスター取得のみです）
- 動的 Web アプリ化・自前のいいね/既読 UI（GitHub Pages の静的サイトのまま）
- 記事本文の全文翻訳・転載（タイトルと description のみ、本文は Google 翻訳リンク）
- SSG（`marked` ＋ テンプレートリテラル ＋ `feed` の最小構成）
- 状態管理用の DB（`adoption-log.ndjson`/`starred-log.ndjson` の追記ログと、X タイムライン蓄積の actions/cache のみ）
- 例外処理・リトライの作り込み（失敗は落として通知）
