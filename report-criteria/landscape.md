# 技術ランドスケープの更新基準

`landscape.yaml` は、利用者が追っている技術の全体像（業界の潮流と、利用者の関心・利用状況）を 1 つにまとめたもの。
毎月の月次トレンドを受けて、項目の追加・段階の見直しを**更新案**として書く。`landscape.yaml` 自体は書き換えない
（スクリプトが検証してマージする）。

## 入力

- `landscape.yaml`: 現在のランドスケープ。`focus` は利用者本人が書いた分野ごとの関心領域
- `.cache/trend.md`: 今月の月次トレンドレポート
- `source.yaml` の `kind: release` のエントリ: 利用者が**実際に使っている**ツール
- `interests.yaml`: 利用者の関心キーワード

## 各フィールドの決め方

すべて入力から確かめられる根拠で決める。推測で埋めない。

| フィールド | 値 | 決め方 |
| --- | --- | --- |
| quadrant | `ai` / `platform` / `practice` / `ops` | AI・エージェント / 基盤・インフラ / 開発手法・プロセス / 運用・セキュリティ |
| ring | `adopt` | その方式の**中心となるツール**を `kind: release` で使っている（GitOps ← Argo CD、IaC ← Terraform）。ツールに関連機能があるだけでは付けない |
| | `trial` | 使っているツールの延長で試せて、月次トレンドに根拠がある |
| | `assess` | 関心には合うが、使っているツールとの接点が無い。または月次トレンドでシグナル止まり |
| | `hold` | 月次トレンドが衰退・リスクを指摘している、または利用者の環境に合わない |
| interest | `high` / `low` | `focus` か `interests.yaml` に合えば `high`、それ以外は `low` |
| reason | 1 行 | 「使っているツール名」か「月次トレンドの項目名」を必ず含める。どちらも書けない項目は載せない |
| cited | `true` / `false` | 今月の `.cache/trend.md` の「今月の潮流」で、その概念が取り上げられたか |
| declining | `true` / `false` | 今月の `.cache/trend.md` が、その概念の衰退・リスクを書いているか |

## 更新のしかた

- 現在の `items` はすべて出力に含める（ring 等を見直してよい）。書き漏らしても消えないが、見直しが反映されない
- 外すのは「定着（当たり前になり追う意味がない）」か「消滅」のときだけ。`removed` に理由付きで書く
- 月次トレンドの「今月の潮流」の項目は、reason が書けるなら新しく載せる。利用者の環境の外にある業界の潮流も
  `interest: low` で載せてよい（全体像の中で自分の関心がどこにあるかを見せるため）
- 項目の粒度は概念・方式（例: GitOps、Platform Engineering）。ツール名そのものは項目にしない
- 全体で 30 項目まで
- `focus` には触れない

## 出力フォーマット（`.cache/landscape-update.yaml` に書く。このファイルだけ）

```yaml
items:
  - name: GitOps
    quadrant: platform
    ring: adopt
    interest: high
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
