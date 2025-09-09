# 03-parallel: Parallel ステートによる並列処理

## 概要
Parallel ステートを使用して、複数の処理を並列実行する例です。
注文処理において、検証・価格計算・在庫確認を同時に実行します。

## 学習ポイント

### 1. Parallel ステートの基本構造
```json
"ProcessInParallel": {
  "Type": "Parallel",
  "Branches": [
    { /* ブランチ1の定義 */ },
    { /* ブランチ2の定義 */ },
    { /* ブランチ3の定義 */ }
  ],
  "ResultPath": "$.parallelResults",
  "Next": "AggregateResults"
}
```

### 2. ブランチの特徴
- 各ブランチは独立したステートマシン
- すべてのブランチが並列実行される
- 全ブランチ完了後に次のステートへ遷移
- 結果は配列として返される（ブランチ順）

### 3. 結果の集約
並列実行の結果は配列として返され、インデックスでアクセス：
```json
"$.parallelResults[0]"  // ブランチ1の結果
"$.parallelResults[1]"  // ブランチ2の結果
"$.parallelResults[2]"  // ブランチ3の結果
```

## ステートマシンの構成

```
[開始]
   ↓
PrepareData
   ↓
ProcessInParallel ─────┬─── ブランチ1: ValidateOrder
                      ├─── ブランチ2: CalculatePrice → ApplyDiscount
                      └─── ブランチ3: CheckInventory
   ↓（全ブランチ完了後）
AggregateResults
   ↓
[終了]
```

## parallelExpectations の使い方

並列実行の詳細を検証する専用フィールド：

### ブランチ数の検証
```yaml
parallelExpectations:
  - state: "ProcessInParallel"
    branchCount: 3  # 3つのブランチが存在
```

### 各ブランチのパス検証
```yaml
parallelExpectations:
  - state: "ProcessInParallel"
    branchPaths:
      0: ["ValidateOrder"]                    # ブランチ0のパス
      1: ["CalculatePrice", "ApplyDiscount"]  # ブランチ1のパス
      2: ["CheckInventory"]                   # ブランチ2のパス
```

### pathMatchingオプション
```yaml
branchPaths:
  pathMatching: "sequence"  # exact/includes/sequence から選択
  0: ["ValidateOrder"]
```

## stateExpectations との使い分け

| 検証内容 | 使用フィールド | 例 |
|---------|--------------|-----|
| **ブランチ数** | parallelExpectations | `branchCount: 3` |
| **各ブランチの実行パス** | parallelExpectations | `branchPaths: { 0: [...] }` |
| **並列実行の入出力データ** | stateExpectations | `state: "ProcessInParallel"` の input/output |
| **個別ブランチ内のデータ** | stateExpectations | 現在未サポート |

## テストケースの設計

### 1. 基本的な並列処理
全ブランチが正常に実行され、結果が集約される

### 2. ブランチ実行の詳細検証
parallelExpectationsでブランチ数とパスを確認

### 3. エラーシナリオ
特定ブランチでエラーが発生した場合の動作
（注: 1つのブランチがエラーになると全体が失敗）

### 4. データ集約の検証
並列実行結果を正しく集約できているか確認

## テストの実行

```bash
# テスト実行
sfn-test run --test-suite ./test-suite.yaml

# 期待される結果
✓ 基本的な並列処理
✓ Parallel実行の詳細検証
✓ 在庫切れシナリオ
✓ ステートレベルの詳細検証
✓ 並列実行とパスの組み合わせ検証

All tests passed!
```

## 実践的な使用例

並列処理が有効なケース：
- **注文処理**: 検証・価格計算・在庫確認を同時実行
- **データ処理**: 異なる変換処理を並列実行
- **通知送信**: メール・SMS・プッシュ通知を同時送信
- **外部API呼び出し**: 複数のAPIを並列で呼び出し

## トラブルシューティング

### Q: 並列実行の結果の順序が保証されない？
A: 結果は必ずブランチ定義順に配列化されます。実行順序は並列でも、結果の配列インデックスは固定です。

### Q: 1つのブランチがエラーになったら？
A: デフォルトでは全体が失敗します。個別にエラーハンドリングが必要な場合は、各ブランチ内でCatchを使用します。

## 次のステップ
並列処理を理解したら、[04-map](../04-map/)で繰り返し処理について学びましょう。