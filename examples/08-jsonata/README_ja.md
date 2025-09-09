# JSONata サンプル - 注文処理ワークフロー

[English](README.md) | [日本語版](#jsonata-サンプル---注文処理ワークフロー)

このサンプルでは、AWS Step FunctionsにおけるJSONataクエリ言語の包括的な機能を紹介し、高度なデータ変換と処理機能、そして**データフロー分析による最適化されたモック生成**を実演しています。

## 概要

eコマースの注文処理ワークフローを通じて以下を実証：
- **変数代入** (`Assign`フィールド) - 計算値の保存
- **データ変換** (`Arguments`フィールド) - 複雑な入力データの変換  
- **出力整形** (`Output`フィールド) - JSONataによる結果のフォーマット
- **条件ロジック** (`Condition`フィールド) - JSONataベースの分岐処理
- **高度な関数** - UUID生成、ハッシュ化、日時操作

## ワークフロー構成

```
CalculateOrderTotal (Pass + Assign)
    ├─ 合計価格を計算
    ├─ アイテム数をカウント
    └─ 変数を保存
           ↓
ProcessOrder (Task + Arguments)
    ├─ 注文IDを生成
    ├─ アイテムデータを変換
    └─ メタデータを追加
           ↓
CheckOrderValue (Choice + Condition)
    ├─ > $1000 → ProcessHighValueOrder
    ├─ > $100  → ProcessStandardOrder
    └─ default → ProcessLowValueOrder
           ↓
FormatFinalOutput (Pass + Output)
    └─ 包括的なレポートを生成
```

## 実装されているJSONata機能

### 1. 変数代入 (Assignフィールド)
```json
"Assign": {
  "orderTotal": "{% $sum($states.input.items.price * $states.input.items.quantity) %}",
  "itemCount": "{% $count($states.input.items) %}",
  "customerFullName": "{% $states.input.customer.firstName & ' ' & $states.input.customer.lastName %}"
}
```
変数は後続のステートで`$variableName`として参照可能です。

### 2. 複雑なデータ変換 (Argumentsフィールド)
```json
"items": "{% $states.input.items ~> |$|{
  'productId': $.id,
  'productName': $.name,
  'unitPrice': $.price,
  'quantity': $.quantity,
  'subtotal': $.price * $.quantity
}| %}"
```
`~>`演算子とパイプライン`|...|`により強力な変換が可能です。

### 3. 条件分岐 (Conditionフィールド)
```json
"Choices": [
  {
    "Condition": "{% $states.input.orderTotal > 1000 %}",
    "Next": "ProcessHighValueOrder"
  }
]
```
注意：JSONataモードでは`Variable`フィールドではなく`Condition`フィールドを使用します。

### 4. JSONata関数カタログ

| カテゴリ | 関数 | 例 |
|----------|------|-------|
| **集計** | `$sum()`, `$count()`, `$average()` | `$sum(items.price)` |
| **文字列** | `&`, `$substring()`, `$uppercase()` | `firstName & ' ' & lastName` |
| **数学** | `$round()`, `$floor()`, `$ceil()` | `$round(price * 0.9, 2)` |
| **日時** | `$now()`, `$millis()`, `$fromMillis()` | `$fromMillis($millis() + 86400000)` |
| **ユーティリティ** | `$uuid()`, `$hash()`, `$merge()` | `$hash(customerId & $now())` |
| **変換** | `~>`, `$map()`, `$filter()` | `items ~> |$|{...}|` |

## サンプルの実行方法

```bash
# 最適化されたテストスイートで実行（推奨）
npx sfn-test run --suite test-suite.yaml

# カスタム入力で実行
npx sfn-test run --asl workflow.asl.json --input '{"customer":{"id":"test","firstName":"田中","lastName":"太郎"},"items":[{"id":"1","name":"ノートPC","price":120000,"quantity":1}],"source":"web"}'
```

## 最適化されたモック設計

このサンプルでは、データフロー分析により最適化された14行のシンプルなモック設定を使用しています：

### 設計の特徴

- **シンプルな固定レスポンス**: 14行のみで完全な機能を提供
- **データフロー最適化**: タスク出力の使用パターンを分析し、最小限の複雑さを実現
- **100%カバレッジ**: 全テストケースが成功し、完全なワークフローカバレッジを実現

## 入出力例

### サンプル入力
```json
{
  "customer": {
    "id": "CUST-12345",
    "firstName": "田中",
    "lastName": "太郎"
  },
  "items": [
    {
      "id": "PROD-001",
      "name": "ノートPC",
      "price": 120000,
      "quantity": 1
    },
    {
      "id": "PROD-002",
      "name": "マウス",
      "price": 2500,
      "quantity": 2
    }
  ],
  "source": "web"
}
```

### 期待される出力構造
```json
{
  "summary": {
    "orderId": "uuid-here",
    "customerName": "田中 太郎",
    "orderStatus": "high-value",
    "originalAmount": 125000,
    "finalAmount": 106250,
    "savings": 18750
  },
  "benefits": ["送料無料", "優先サポート"],
  "delivery": {
    "estimatedDate": "2024-01-15",
    "trackingId": "A1B2C3D4"
  }
}
```

## AWS準拠ノート

✅ **Passステート**: `Output`と`Assign`をサポート、`Arguments`はサポートしない  
✅ **Taskステート**: `Arguments`と`Output`の両方をサポート  
✅ **Choiceステート**: JSONataモードでは`Condition`フィールドを使用（`Variable`ではない）  
✅ **エラーハンドリング**: JSONataエラーは`States.QueryEvaluationError`を生成  
✅ **式構文**: すべてのJSONataは`{% ... %}`区切り文字で囲む

## ファイル構成

- **`workflow.asl.json`** - JSONata対応Step Functionsワークフロー定義
- **`test-suite.yaml`** - 100%カバレッジを達成する包括的テストケース
- **`mock.yaml`** - 最適化されたモック設定（14行）
- **`USAGE.md`** - クイックスタートガイド
- **`README.md`** - 英語版ドキュメント

## ベストプラクティス

1. **変数を活用**: `Assign`で計算値を一度保存し、再計算を避ける
2. **型安全性**: `$number()`や`$string()`などの明示的変換関数を使用
3. **エラーハンドリング**: `States.QueryEvaluationError`用のCatchブロックを追加
4. **テスト**: AWS Step Functions test-state APIでJSONata式を検証
5. **パフォーマンス**: 複雑な変換は複数ステートより効率的
6. **モック最適化**: データフロー分析を用いて必要最小限の複雑度を決定

## クイックスタート

即座にテストするには：
```bash
npx sfn-test run --suite test-suite.yaml
```

このサンプルは、本番Step FunctionsワークフローでのJSONata使用に関する包括的なテンプレートを提供し、モック最適化のベストプラクティスを示し、データフロー分析がAI生成コードの品質を劇的に改善できることを実証しています。