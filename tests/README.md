# Tests Directory

## ディレクトリ構成

```
tests/
├── fixtures/                    # テストデータ
│   └── aws-test-states/         # AWS test-states API用のASLファイル
├── run-aws-test-states.sh      # AWS test-states API実行スクリプト
└── run-local-test.mjs          # ローカル実行用ヘルパースクリプト
```

## AWS Test States テスト

### 概要
`fixtures/aws-test-states/`にあるテストファイルは、AWS Step Functions [test-states API](https://docs.aws.amazon.com/step-functions/latest/apireference/API_TestState.html) との互換性を検証するためのものです。

### テストファイル一覧

**JSONata関数テスト:**
- `test-jsonata-hash.json` - $hash関数
- `test-jsonata-parse.json` - $parse関数（JSON文字列パース）
- `test-jsonata-partition.json` - $partition関数（配列分割、複数パターン）
- `test-jsonata-random.json` - $random関数
- `test-jsonata-range.json` - $range関数（複数パターン、3引数必須）
- `test-jsonata-uuid.json` - $uuid関数

**JSONPath関数テスト:**
- `test-jsonpath-array-contains.json` - States.ArrayContains
- `test-jsonpath-hash.json` - States.Hash（SHA-256, MD5, SHA-1）
- `test-jsonpath-json-merge.json` - States.JsonMerge
- `test-jsonpath-math-random.json` - States.MathRandom
- `test-jsonpath-string-split.json` - States.StringSplit（単一/複数文字デリミタ）

**特徴:**
- すべてインライン値を使用（外部入力ファイル不要）
- 単一ステート定義（States配列なし）
- AWSとローカル実装の両方で実行可能

### 前提条件
- AWS CLIがインストールされていること
- AWS認証が設定されていること（`aws configure`または`awsume`）
- 適切なIAMポリシー（`states:TestState`権限）

### 実行方法

#### すべてのテストを実行
```bash
# AWS test-states APIとローカル実装を比較
npm run test:test-states

# または直接実行
./tests/run-aws-test-states.sh
```

#### 個別テストの実行
```bash
# AWS CLIで直接実行（インライン値のため入力は空オブジェクト）
aws stepfunctions test-state \
  --definition file://tests/fixtures/aws-test-states/test-jsonata-hash.json \
  --input '{}'

# ローカル実装で実行
npx tsx src/cli/index.ts run \
  --asl tests/fixtures/aws-test-states/test-jsonata-hash.json \
  --input '{}'
```

### テスト結果の見方

スクリプトは以下を表示します：
- ✅ **Match** - AWSとローカルの結果が完全一致
- ✅ **Match (structure & format)** - ランダム/UUID値で構造と形式が一致
- ⚠️ **Mismatch** - 結果が異なる（要修正）

### 新しいテストの追加

1. `tests/fixtures/aws-test-states/`に新しいJSONファイルを作成
2. 命名規則: `test-jsonata-*.json`または`test-jsonpath-*.json`
3. インライン値を使用（外部入力ファイル不要）
4. 単一ステート定義を使用

例:
```json
{
  "Type": "Pass",
  "QueryLanguage": "JSONata",
  "Comment": "Test description",
  "Output": "{% $function('inline', 'values') %}",
  "End": true
}
```

## 注意事項

- これらのテストは開発時の互換性確認用
- 通常のユニットテスト（`npm test`）とは別
- CIでは自動実行されない（AWS認証が必要なため）
- ランダム値/UUIDのテストは値ではなく形式を検証
