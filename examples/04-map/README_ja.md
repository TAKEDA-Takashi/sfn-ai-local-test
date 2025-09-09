# 04-map: Map ステートによる反復処理

## 概要
Map ステートを使用して配列データを反復処理する例です。
商品リストの各アイテムに対して検証と処理を行う商品処理シナリオを実装しています。

## 学習ポイント

### 1. Map ステートの基本構造
```json
"ProcessItems": {
  "Type": "Map",
  "ItemsPath": "$.itemList.Payload.items",
  "MaxConcurrency": 2,
  "ItemSelector": {
    "item.$": "$$.Map.Item.Value",
    "index.$": "$$.Map.Item.Index",
    "category.$": "$.category"
  },
  "ItemProcessor": {
    "StartAt": "ValidateItem",
    "States": {
      /* 各アイテムの処理ステート */
    }
  },
  "ResultPath": "$.processedItems",
  "Next": "SummarizeResults"
}
```

### 2. Map ステートの機能
- **ItemsPath**: 反復処理する配列の指定
- **MaxConcurrency**: 並列実行数の制限（オプション）
- **ItemSelector**: 各反復の入力データ準備
- **ItemProcessor**: 各アイテムで実行されるステートマシン
- **ResultPath**: 結果配列の格納場所

### 3. Map 内のコンテキスト変数
Map の反復処理で使用できる特殊変数：
```json
"$$.Map.Item.Value"  // 現在のアイテム値
"$$.Map.Item.Index"  // 現在のアイテムインデックス（0ベース）
```

### 4. Map と Choice の組み合わせ
ItemProcessor内で検証結果に基づく条件分岐を実装し、有効・無効なアイテムを適切に処理できます。

## ステートマシンの構成

```
[開始]
   ↓
GetItemList（アイテム配列の取得）
   ↓
ProcessItems（Map ステート）
   ├─── 各アイテムごとに：
   │    ├─── ValidateItem（検証）
   │    ├─── CheckValidation（Choice分岐）
   │    ├─── ProcessValidItem（有効な場合）
   │    └─── HandleInvalidItem（無効な場合）
   ↓
SummarizeResults（結果の集約）
   ↓
[終了]
```

## ItemProcessor のロジック

各配列要素に対して以下の処理を実行：
1. **ValidateItem**: アイテムが条件を満たすかチェック
2. **CheckValidation**: 検証結果に基づくChoice分岐
3. **ProcessValidItem**: 有効なアイテムの処理
4. **HandleInvalidItem**: 無効なアイテムをPassステートで適切に処理

## テストケース

### 1. 電子機器処理
- 電子機器カテゴリのアイテムリストを処理
- すべてのアイテムが有効で処理される
- 全アイテムの処理成功を確認

### 2. 空カテゴリ
- 未知のカテゴリで空リストが返される
- 空配列の処理が正常に動作することを確認
- 結果の集約処理も正常に動作

## mapExpectationsの使い方

`mapExpectations`機能により、Mapステートの詳細な動作検証（反復回数や実行パス検証）が可能です。

`mapExpectations`フィールドを使用すると：

### 基本的な検証
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationCount: 3  # 処理される反復回数（アイテム数）
```

### 全反復で共通のパス検証
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationPaths:
      pathMatching: "exact"  # exact/includes/sequence から選択
      all: ["ValidateItem", "CheckValidation", "ProcessValidItem"]  # 全反復が従うパス
```

### 特定の反復パスの検証
```yaml
mapExpectations:
  - state: "ProcessItems"
    iterationPaths:
      pathMatching: "exact"
      samples:
        0: ["ValidateItem", "CheckValidation", "ProcessValidItem"]   # 反復0のパス
        1: ["ValidateItem", "CheckValidation", "HandleInvalidItem"]  # 反復1のパス
        2: ["ValidateItem", "CheckValidation", "ProcessValidItem"]   # 反復2のパス
```

### pathMatchingオプション
- `exact`: 完全一致
- `sequence`: 順序保持された部分一致
- `includes`: 指定されたステートを含む（順序無関係）

```yaml
iterationPaths:
  pathMatching: "sequence"
  all: ["ValidateItem", "ProcessValidItem"]  # CheckValidationをスキップしても可
```

## 主要設定オプション

### MaxConcurrency
```json
"MaxConcurrency": 2  // 最大2つのアイテムを並列処理
```

### ItemSelector
```json
"ItemSelector": {
  "item.$": "$$.Map.Item.Value",    // 現在のアイテム
  "index.$": "$$.Map.Item.Index",   // アイテムのインデックス
  "category.$": "$.category"        // 親コンテキストからのデータ
}
```

### 結果の処理
- **ResultPath**: `"$.processedItems"` - 結果配列を格納
- 各結果はそのアイテムのItemProcessor出力を含む
- 結果は入力アイテムと同じ順序で保持される

## テストの実行

```bash
# テスト実行
sfn-test run --suite ./test-suite.yaml

# 期待される結果
✅ Electronics processing
✅ Empty category

All tests passed!
```

## 実践的な使用例

Map ステートが有効なケース：
- **バッチ処理**: データ項目の配列を処理
- **データ変換**: データセット内の各項目に変換を適用
- **検証パイプライン**: 異なる結果を持つアイテムの検証と処理
- **並列処理**: MaxConcurrencyを使用した複数アイテムの同時処理

## よくあるパターン

### 1. フィルタパターン
ItemProcessor内でChoice ステートを使用してアイテムをフィルタ：
```json
"CheckValidation": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.validation.Payload.isValid",
      "BooleanEquals": true,
      "Next": "ProcessValidItem"
    }
  ],
  "Default": "HandleInvalidItem"
}
```

### 2. エラーハンドリング
- 無効なアイテムはPassステートで適切に処理
- ItemProcessor内でCatchブロックを使用したエラー復旧
- 結果配列は処理結果に応じて異なる構造を含む

## トラブルシューティング

### Q: Mapステートの結果が予期しない形式になる？
A: ItemProcessorの出力を確認してください。各反復の結果が結果配列の一要素になります。

### Q: ItemProcessor内で元の入力データにアクセスするには？
A: ItemSelectorを使用して親コンテキストから必要なデータを各反復に渡してください。

### Q: 大きな配列でパフォーマンスが問題になる？
A: MaxConcurrencyを使用してリソース使用量を制御し、下流サービスの負荷を防いでください。

## 次のステップ
Map処理を理解したら、[05-distributed-map](../05-distributed-map/)で大規模分散処理について学びましょう。