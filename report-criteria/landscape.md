# 技術ランドスケープの更新基準

`landscape.yaml` は、追うべき技術の**全量**（業界の潮流と、利用者の利用状況）をまとめたもの。利用者の興味は `interests.yaml` の `landscape` 節が持ち、ここには書かない。
毎月の月次トレンドを受けて、項目の追加・段階の見直しを**更新案**として書く。`landscape.yaml` 自体は書き換えない
（スクリプトが検証してマージする）。

## 入力

- `landscape.yaml`: 現在のランドスケープ
- `.cache/trend.md`: 今月の月次トレンドレポート
- `source.yaml` の `kind: release` のエントリ: 利用者が**実際に使っている**ツール
- `interests.yaml`: 利用者の関心キーワード（`interests`）と、分野ごとの関心領域・関心のある項目（`landscape`）。読むだけで書き換えない

## 各フィールドの決め方

すべて入力から確かめられる根拠で決める。推測で埋めない。

| フィールド | 値 | 決め方 |
| --- | --- | --- |
| quadrant | `ai` / `platform` / `practice` / `ops` | AI・エージェント / 基盤・インフラ / 開発手法・プロセス / 運用・セキュリティ |
| ring | `adopt` | その方式の**中心となるツール**を `kind: release` で使っている（GitOps ← Argo CD、IaC ← Terraform）。ツールに関連機能があるだけでは付けない |
| | `trial` | 使っているツールの延長で試せて、月次トレンドに根拠がある |
| | `assess` | 関心には合うが、使っているツールとの接点が無い。または月次トレンドでシグナル止まり |
| | `hold` | 月次トレンドが衰退・リスクを指摘している、または利用者の環境に合わない |
| summary | 1 文 | その技術が**何か**（利用者との関係ではなく技術そのものの説明）。新規項目では必須、既存項目は省略すると前回の値を引き継ぐ |
| reason | 1 行 | 「使っているツール名」か「月次トレンドの項目名」を必ず含める。どちらも書けない項目は載せない |
| cited | `true` / `false` | 今月の `.cache/trend.md` の「今月の潮流」で、その概念が取り上げられたか |
| declining | `true` / `false` | 今月の `.cache/trend.md` が、その概念の衰退・リスクを書いているか |

## 更新のしかた

- 現在の `items` はすべて出力に含める（ring 等を見直してよい）。書き漏らしても消えないが、見直しが反映されない
- 外すのは「定着（当たり前になり追う意味がない）」か「消滅」のときだけ。`removed` に理由付きで書く
- 月次トレンドの「今月の潮流」の項目は、reason が書けるなら新しく載せる。利用者の環境の外にある業界の潮流も
  載せてよい（全体像の中で自分の関心がどこにあるかを見せるため）
- `interests.yaml` の `landscape.<分野>.items` にあるのに `landscape.yaml` に無い名前は、reason が書けるなら**その名前のまま**追加する
- 項目の粒度は概念・方式（例: GitOps、Platform Engineering）。ツール名そのものは項目にしない
- 全体で 30 項目まで

## 出力フォーマット（`.cache/landscape-update.yaml` に書く。このファイルだけ）

```yaml
items:
  - name: GitOps
    summary: 望ましい状態を Git で宣言し、クラスタを継続的にそこへ同期させる運用
    quadrant: platform
    ring: adopt
    reason: Argo CD で自宅クラスタを同期している
    cited: false
    declining: false
removed:
  - name: <外す項目名>
    reason: 定着 — <理由 1 行>
changes:
  - "<項目名>: <前の ring or 新規> → <新しい ring or 外す> — <理由 1 行>"
```

- `removed` と `changes` は無ければ空配列 `[]`
- `changes` には ring が変わった項目・新規・外した項目だけを書く
