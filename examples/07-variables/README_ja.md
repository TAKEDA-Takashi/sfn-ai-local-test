# Variables（変数）サンプル

このサンプルでは、AWS Step Functions の**Variables機能**を`Assign`フィールドを使用して、ワークフロー実行全体で変数の作成、更新、参照を行う方法を実演します。

## 学習目標

このサンプルを学習することで、以下を理解できます：

1. **変数の代入** - `Assign`フィールドを使用した変数の作成と更新
2. **変数の参照** - `$variableName`を使用した変数へのアクセス
3. **変数のスコープ** - 変数がステート間でどのように永続化されるか
4. **変数の計算** - 既存の変数を使用した計算処理
5. **タイムスタンプ変数** - ステート開始時刻の取得方法

## 主要概念

### Assignフィールドの構文
```json
"Assign": {
  "staticVariable": "fixed-value",
  "dynamicVariable.$": "$.inputField", 
  "timestampVariable.$": "$$.State.EnteredTime",
  "calculatedVariable.$": "States.MathAdd($existingVar, $.newValue)"
}
```

### 変数の参照方法
```json
"Parameters": {
  "userId.$": "$.userId",
  "totalSavings.$": "$totalSavings",
  "processingStatus.$": "$processingStatus"
}
```

## ワークフロー構造

```
InitializeUser (Assign: userCreated, processingStatus, transactionCount)
↓
CalculateDiscount (Lambda Task - Assign: discountCalculated, processingStatus, calculationStep, discountAmount)  
↓
CheckEligibility (eligibleForBonusに基づく条件分岐)
├─ ProcessBonus (Lambda Task - Assign: bonusProcessed, processingStatus, bonusAmount, transactionCount++, totalSavings)
└─ ProcessRegular (Lambda Task - Assign: regularProcessed, processingStatus, transactionCount++, totalSavings)
↓
GenerateReport (Pass - Assign: reportGenerated, processingStatus = "completed")
```

## 変数の使用パターン

### 1. カウンタ変数
```json
// カウンタの初期化
"transactionCount": 0

// 後続ステートでStates.MathAddを使用してカウンタをインクリメント  
"transactionCount.$": "States.MathAdd($transactionCount, 1)"
```

### 2. ステータス追跡
```json
// 各段階でステータスを設定
"processingStatus": "initialized"      // InitializeUser
"processingStatus": "discount_calculated"  // CalculateDiscount  
"processingStatus": "bonus_applied"        // ProcessBonus
"processingStatus": "completed"            // GenerateReport
```

### 3. アキュムレータ変数
```json
// States.MathAddを使用して異なるソースからの値を結合
"totalSavings.$": "States.MathAdd($discountAmount, $.bonusAmount)"

// 通常パス（割引のみ）の場合
"totalSavings.$": "$discountAmount"
```

### 4. タイムスタンプ追跡
```json
// ステート開始時刻を取得
"userCreated.$": "$$.State.EnteredTime"
"discountCalculated.$": "$$.State.EnteredTime"  
"reportGenerated.$": "$$.State.EnteredTime"
```

## 変数のスコープルール

1. **代入タイミング**: `Assign`内のすべての式が最初に評価され、その後同時に代入される
2. **利用可能性**: 変数は同じステート内および後続のすべてのステートで利用可能
3. **参照構文**: 変数の参照には`$variableName`を使用
4. **数学演算**: 計算には`States.MathAdd($var1, $var2)`のようなStates組み込み関数を使用
5. **永続性**: 変数は実行全体を通じて永続化される
6. **サイズ制限**: 
   - 単一変数: 最大256 KiB
   - 1つのAssign内のすべての変数: 最大256 KiB  
   - 実行全体の変数: 最大10 MiB

## 重要な実装ノート

- **現在のステート内での変数**: 変数は同じステートの他のフィールド（Parametersなど）でも参照可能
- **States関数**: `States.MathAdd()`、`States.MathRandom()`などを数学演算に使用
- **変数vs入力**: 変数は`$variableName`、入力データは`$.fieldName`で参照
- **混在参照**: 同じ式内で変数参照（`$var`）と入力参照（`$.field`）を組み合わせ可能

## テスト機能

### State Expectations
テストスイートでは`stateExpectations`を使用して、特定のステートでの変数値を検証します：

```yaml
stateExpectations:
  - state: "ProcessBonus"
    variables:
      transactionCount: 1
      totalSavings: 75  # discountAmount (50) + bonusAmount (25)
      processingStatus: "bonus_applied"
      bonusAmount: 25
```

### 変数参照のテスト
テストでは変数が以下のように動作することを検証します：
- 正しく作成・更新される
- 後続ステートで参照できる
- 計算で使用できる
- 複数の操作を通じて蓄積される

## テストの実行

```bash
# すべての変数テストケースを実行
sfn-test run --suite test-suite.yaml

# 変数の変更を確認するための詳細出力付き実行
sfn-test run --suite test-suite.yaml --verbose

# 特定の変数パターンをテスト
sfn-test run --suite test-suite.yaml --case "Variable accumulation over multiple states"
```

## テストケース

1. **ボーナス対象ユーザー** - ボーナスパスでの完全な変数ライフサイクル
2. **通常ユーザー** - 異なる変数値での代替パス  
3. **変数の蓄積** - 複雑な計算と蓄積パターン
4. **変数参照** - 変数を参照する様々な方法のテスト
5. **タイムスタンプ変数** - 時間ベースの変数代入のテスト

各テストケースには`stateExpectations`が含まれており、ワークフローの各ステップで変数が正しく代入・更新されることを検証します。

## 重要な注意点

- 変数は**実行スコープ**です - ワークフロー実行全体で永続化されます
- JSONパスで変数を参照するには`$variableName`を使用します
- 数学演算にはStates組み込み関数を使用します（例：`States.MathAdd($var1, $.field)`）
- 変数の代入はステート内の他のすべてのフィールド処理の**後に**発生します  
- 変数は複雑なワークフローでの状態追跡に特に有用です
- 大きなデータ構造を保存する際は変数サイズ制限を考慮してください