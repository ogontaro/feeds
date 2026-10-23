# セキュリティアラートの判定基準

`.cache/security-input.md` の各項目を読み、**読者（自宅 Kubernetes の運用者）が対応すべきものだけ**を
`.cache/security.json` に書く。全件を載せる必要はない。件数を埋めるために載せない。

## 判断に使う材料

入力にあるものだけを使い、推測で補わない。

- **CISA KEV** … 実際に悪用が確認された脆弱性。最も強い緊急度の根拠。
- **EPSS** … 今後30日の悪用確率（0〜1）。0.5 以上は要注意、0.1 未満は低い。
- **CVSS** … 深刻度。9.0 以上が Critical。ただし単独では緊急度の根拠にならない。
- **自宅インフラへの該当** … 下の構成で実際に使っているもの。
- **情報源** … Kubernetes 公式・GitHub Advisory・NVD のどれか。

## 緊急度の3段階

| 緊急度 | 条件（いずれか） |
| --- | --- |
| **即時対応** | KEV に追加済みで、自宅インフラで使っている／広く露出する製品。または CVSS 10.0 の未認証リモート実行で自宅インフラに該当。または EPSS 0.5 以上かつ自宅インフラに該当 |
| **今週中** | 自宅インフラに該当し、CVSS 9.0 以上。悪用の確認はまだ無い。または KEV だが自宅インフラには該当しない |
| **監視** | OS・ブラウザ・ネットワーク機器・クラウドなど広く使われる製品の Critical で、悪用の兆候がまだ無い。または自宅インフラに該当するが影響バージョンではなさそう |

次は通知しない。

- 使っていないニッチな製品で、KEV でも EPSS も高くない
- 同一 CVE の重複（1件にまとめる）
- 実害の説明ができないもの（スコアだけ高い、情報が不足している）

**KEV に新しく追加されたものは、自宅インフラに該当しなくても「監視」以上で必ず載せる。**
入力で `CISA KEV: あり` になっている項目は、原則として通知対象にする。

## 自宅インフラの構成

該当判定に使う。ここに無い製品でも、明らかに使っていると分かる場合だけ該当とする。

- Kubernetes、Talos Linux、Cilium、VMware ESXi、Linux カーネル、OpenSSH、systemd
- Argo CD、Argo Workflows、Crossplane、KEDA、Kyverno、cert-manager、External Secrets Operator
- Grafana、Loki、Mimir、Prometheus、Alloy、Longhorn、Rook-Ceph、CloudNativePG
- Keycloak、Dex、Pomerium、Tailscale、Cloudflare Tunnel、Headlamp
- n8n、Renovate、RSSHub、Open WebUI、Gerrit、Backstage、Elasticsearch
- Docker／containerd、nginx

バージョンは入力に含まれない。**「影響バージョンか確認する」と書き、該当すると断定しない。**
KEV と EPSS の値は入力の数値をそのまま使う。

## 出力フォーマット

`.cache/security.json` に **JSON 配列だけ**を書く（コードフェンス・説明文は書かない）。
通知しない項目は配列に含めない。

```json
[
  {
    "id": "CVE-2026-12345",
    "title": "Argo CD の認証バイパスで管理者権限を取得される",
    "urgency": "immediate",
    "summary": "認証なしで API に到達できる攻撃者が、Argo CD の管理者権限で任意のアプリケーションを操作できる。2〜3文で、何が起きるかを書く。",
    "reason": "CISA KEV に追加済みで実際の悪用が確認されている。EPSS 0.62。Argo CD は自宅クラスタで稼働している。",
    "action": "v2.12.4 以降へ更新する。更新までは管理画面を外部に公開しない。",
    "components": ["Argo CD"]
  }
]
```

- `id` … 入力の ID をそのまま使う（CVE / GHSA）。入力に無い ID を書かない。
- `title` … 日本語で1行。製品名と「何をされるか」を含める。
- `summary` … 日本語2〜3文。攻撃条件と影響を、入力の説明から書く。
- `reason` … 緊急度の根拠。KEV・EPSS・CVSS・該当のどれを根拠にしたか明記する。
- `action` … 具体的な対応。更新先バージョンが入力にあれば書く。無ければ「ベンダーのアドバイザリで修正版を確認する」。
- `components` … 該当する自宅インフラのコンポーネント名。無ければ `[]`。
- 入力に無いバージョン・攻撃手法・影響範囲を創作しない。
