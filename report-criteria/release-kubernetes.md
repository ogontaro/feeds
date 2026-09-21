# Kubernetes リリースレポートの選定基準

`release-kubernetes-input.json`（過去7日間のリリース。`project` / `version` / `link` / `notes`（英語原文））から、
注目すべきリリースを整理する。対象は k8s 系ツールと自宅クラスタで使っているアドオン
（Argo CD / Cilium / cert-manager / CloudNativePG / Longhorn / Grafana スタック（Grafana・Loki・Mimir・Alloy）/
external-secrets / KEDA / Pomerium / Terraform 等）。
リリースが 0 件なら「今週の対象リリースはありませんでした」とだけ書く。

## 方針

- **プロジェクトごとにまとめる**。同一プロジェクトで複数バージョンが出ていれば1エントリに集約
- 各エントリの先頭に **破壊的変更・アップグレード時の注意** を書く。次に **注目すべき新機能・修正**
- パッチのみで内容が薄いものは1行の定型（「バグ修正と依存更新」等）に畳む
- 英語のリリースノートを読んで日本語で要約する（翻訳サービスは通さない）

## 出力フォーマット（`.cache/release-kubernetes.md` に書く。このファイルだけ）

```
## 今週のリリース

### <プロジェクト名> <バージョン（範囲）>
**破壊的変更**: <あれば。なければ「なし」>
<2〜4行の日本語要約。移行の要否と注目機能。>
[リリースを見る](<link>) / [Google 翻訳で読む](https://translate.google.com/translate?sl=auto&tl=ja&u=<URLエンコードした link>)
```
