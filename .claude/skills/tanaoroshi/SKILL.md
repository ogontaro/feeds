---
name: tanaoroshi
description: 毎月の棚卸し（GitHub Issue「使用コンポーネントの棚卸し」）に対応するとき、または「棚卸しして」「興味リストを見直したい」「interests.yaml を更新したい」と言われたときに使う。購読リスト（source.yaml）と興味リスト（interests.yaml の landscape）を、対話で洗い出して更新する。
---

# 棚卸し

毎月1日 09:00 JST に `component-review-reminder.yml` が Issue を作る。この skill はその Issue の作業を対話で進める。
翌2日 07:45 JST の月次トレンドが、ここで直した `interests.yaml` を読んで全量（`landscape.yaml`）を更新する。

## 持ち主（間違えると翌月に上書きされる）

| ファイル | 持ち主 | この skill で |
| --- | --- | --- |
| `interests.yaml` | 本人 | 編集する |
| `source.yaml` | 本人 | 編集する |
| `landscape.yaml` | AI（月次） | 読むだけ。編集しない |

## 手順

1. **現状を出す**: `landscape.yaml` と `interests.yaml` の `landscape` 節を突き合わせ、分野ごとに「興味あり」の項目を表で見せる。
   突き合わせは名前の完全一致。`landscape` 節にあって全量に無い名前は「未掲載」として別に出す。
2. **聞く**（分野ごとに1回、まとめて）:
   - 興味が薄れた項目、新しく気になる項目はあるか
   - 新しく使い始めた／使わなくなったツールはあるか（`source.yaml` の `kind: release` に反映）
   - 未購読のよく見るサイトはあるか
3. **直す**: 答えを `interests.yaml` の `landscape.<分野>.items` と `focus`、`source.yaml` に反映する。
   - `items` は `landscape.yaml` の `name` と完全一致させる。全量に無い項目は、その名前のまま書いてよい（次回の月次更新で AI が追加を検討する）
   - 分野は `ai` / `platform` / `practice` / `ops`
   - `interests.yaml` の `interests`（ドメイン別キーワード）は、ドメインの関心が変わったときだけ触る
4. **確かめる**: `bun run src/site/build.ts` を実行し、`docs/digest/landscape.html` で「興味あり」の強調と「全量にまだない興味」を確認する。
5. **締める**: 変更内容を短くまとめ、Issue をクローズするよう伝える。コミット・Issue のクローズはユーザーの指示があるときだけ行う。
