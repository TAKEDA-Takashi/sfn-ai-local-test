# 包括的テストガイド

このガイドでは、sfn-ai-local-testを使用したテストケースの作成、モック設定、ベストプラクティスについて包括的に説明します。

## 📋 目次

1. [クイックスタート](#クイックスタート)
2. [モック設定](#モック設定)
3. [テストケース作成](#テストケース作成)
4. [ベストプラクティス](#ベストプラクティス)
5. [CI/CD統合](#cicd統合)
6. [パフォーマンス最適化](#パフォーマンス最適化)

---

## クイックスタート

### 基本的なテストスイート

```yaml
version: "1.0"
name: "My Test Suite"
stateMachine: "payment-workflow"
baseMock: "payment-mocks"

testCases:
  - name: "正常処理"
    input: { orderId: "123", amount: 1000 }
    expectedOutput:
      status: "completed"
      transactionId: "tx-123"
```

### 基本的なモック設定

```yaml
version: "1.0"
mocks:
  - state: "ProcessPayment"
    type: "fixed"
    response:
      Payload:
        status: "completed"
        transactionId: "tx-123"
```

---

## モック設定

### モックタイプ仕様

#### 1. 固定レスポンス (fixed)

予測可能なシナリオで一貫したデータを返します。

```yaml
- state: "GetUserInfo"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John Smith"
```

**使用場面:**
- 単純なユニットテスト
- 確定的な動作の検証
- 基本的な統合テスト

#### 2. 条件レスポンス (conditional)

入力条件に基づいて異なる応答を返します。部分一致で評価されます。

```yaml
- state: "ProcessPayment"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:
            amount: 500
      response:
        Payload: { status: "approved" }
    - when:
        input:
          Payload:
            amount: 5000
      response:
        Payload: { status: "manual_review" }
    - default:
        Payload: { status: "pending" }
```

**重要:** 
- `when`条件には必ず`input`フィールドを使用してください
- Lambda統合の場合は`Payload`でラップしてください
- 条件は完全一致または部分一致で評価されます（複雑な演算子は未サポート）

#### 3. ステートフルレスポンス (stateful)

呼び出し回数に基づいて動作を変更します。

```yaml
- state: "RetryableProcess"
  type: "stateful"
  responses:
    - Payload: { status: "processing" }      # 1回目
    - Payload: { status: "still_processing" } # 2回目
    - Payload: { status: "completed" }       # 3回目
```

**使用場面:**
- リトライ動作のテスト
- ポーリングパターンの検証
- 段階的な処理フローのテスト

#### 4. エラーシミュレーション (error)

エラー状態をシミュレートしてエラーハンドリングをテストします。

```yaml
- state: "FlakeyService"
  type: "error"
  error:
    type: "States.TaskFailed"
    cause: "Service temporarily unavailable"
  probability: 0.3  # 30%の確率でエラー
```

**エラータイプの例:**
- `States.TaskFailed` - タスク実行失敗
- `States.Timeout` - タイムアウト
- `States.Permissions` - 権限エラー
- `Lambda.ServiceException` - Lambda固有エラー

#### 5. ItemReader (Distributed Map用)

Distributed Mapのデータソースをモックします。

```yaml
- state: "ProcessBatch"
  type: "itemReader"
  dataFile: "items.csv"     # test-dataディレクトリから読み込み
  dataFormat: "csv"         # 省略可能（拡張子から自動判定）
```

### 遅延（delay）の設定

すべてのモックタイプで`delay`フィールドを使用してレスポンスを遅延させることができます：

```yaml
# Fixed型での遅延
- state: "SlowAPI"
  type: "fixed"
  delay: 2000  # 2秒遅延
  response:
    Payload: { result: "success" }

# Error型での遅延（エラー前に遅延）
- state: "TimeoutService"
  type: "error"
  delay: 5000  # 5秒後にエラー
  error:
    type: "States.Timeout"
    cause: "Service timeout"

# Conditional型での条件別遅延
- state: "PriorityProcessor"
  type: "conditional"
  conditions:
    - when:
        input:
          priority: "high"
      delay: 100  # 高優先度は高速処理
      response:
        Payload: { status: "expedited" }
    - when:
        input:
          priority: "low"
      delay: 3000  # 低優先度は遅延
      response:
        Payload: { status: "queued" }
```

### Lambda統合パターン

最適化された統合（`arn:aws:states:::lambda:invoke`）を使用する場合、レスポンスは`Payload`でラップされます：

```yaml
- state: "ProcessOrder"
  type: "fixed"
  response:
    ExecutedVersion: "$LATEST"
    Payload:  # Lambda統合では必須
      orderId: "12345"
      status: "processed"
    StatusCode: 200
```

**注意**: 直接ARN指定は非推奨です。常に最適化された統合を使用してください。

### 条件マッチングの詳細

#### 部分マッチ

条件モックは部分マッチを使用します：

```yaml
conditions:
  - when:
      input:
        Payload:
          orderId: "order-001"  # 他のフィールドは無視される
    response:
      Payload: { status: "found" }
```


### Map/Parallel内のモック

Map内のステートは、ステート名のみで指定します（Mapステート名は不要）：

```yaml
- state: "ProcessItem"  # Map内の子ステート（Mapステート名は付けない）
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:
            itemId: "item-001"
      response:
        Payload: { processed: true }
```

**注意**: Map内のステートは独立したステートマシンとして実行されるため、親のMapステート名（`ProcessItems`など）を付ける必要はありません。

---

## テストケース作成

### テスト戦略

#### 単体テストアプローチ

個々のステートを独立してテストする場合：

```yaml
testCases:
  - name: "単一ステートのテスト"
    input: { taskType: "single" }
    stateExpectations:
      - state: "ProcessTask"
        input: { taskType: "single" }
        output: { processed: true }
        outputMatching: "exact"
```

#### 統合テストアプローチ

ワークフロー全体の動作を検証する場合：

```yaml
testCases:
  - name: "エンドツーエンドフロー"
    input: { orderId: "12345" }
    expectedOutput:
      orderId: "12345"
      status: "completed"
    expectedPath:
      - "ValidateOrder"
      - "ProcessPayment"
      - "ShipOrder"
      - "SendNotification"
```

#### エラーケースのテスト

異常系の処理を検証する場合：

```yaml
testCases:
  - name: "エラーハンドリングテスト"
    input: { amount: -100 }
    expectedError: "States.TaskFailed"
    mockOverrides:
      - state: "ValidateAmount"
        type: "error"
        error:
          type: "ValidationError"
          cause: "Amount cannot be negative"
```

### カバレッジ向上のテクニック

#### 1. 境界値テスト

```yaml
testCases:
  - name: "最小値テスト"
    input: { value: 0 }
  - name: "最大値テスト"
    input: { value: 999999 }
  - name: "境界値テスト"
    input: { value: 100 }  # 閾値
```

#### 2. 全パス網羅

Choice ステートの全分岐を網羅：

```yaml
testCases:
  - name: "パスA"
    input: { type: "A" }
    expectedPath: ["Check", "ProcessA"]
  
  - name: "パスB"
    input: { type: "B" }
    expectedPath: ["Check", "ProcessB"]
  
  - name: "デフォルトパス"
    input: { type: "Unknown" }
    expectedPath: ["Check", "DefaultProcess"]
```

#### Choiceステートのモック（特殊ケース）

通常、Choiceステートは外部リソースを呼び出さないためモックは不要ですが、以下のような特殊ケースで有用です：

**無限ループの回避**：
```yaml
# リトライループのテスト - 強制的に特定の分岐へ
mocks:
  - state: "RetryDecision"
    type: "fixed"
    response:
      Next: "Success"  # Choice評価を上書きして強制遷移
```

**ステートフルなループ制御**：
```yaml
# 3回目のループで強制終了
mocks:
  - state: "CheckRetryCount"
    type: "stateful"
    responses:
      - { Next: "RetryOperation" }  # 1回目: リトライ
      - { Next: "RetryOperation" }  # 2回目: リトライ
      - { Next: "ForceSuccess" }    # 3回目: 強制成功
```

**条件に基づく分岐制御**：
```yaml
# 入力に応じて異なる分岐を強制
mocks:
  - state: "ComplexValidation"
    type: "conditional"
    conditions:
      - when:
          input:
            testMode: true
        response:
          Next: "SkipValidation"  # テストモードでバリデーションをスキップ
      
      - when:
          input:
            forceComplete: true
        response:
          Next: "ForceComplete"   # 強制完了
      
      # Nextがない場合は通常のChoice評価にフォールバック
      - default: {}
```

**デバッグ用の分岐制御**：
```yaml
# 特定の機能パスを強制的にテスト
mocks:
  - state: "FeatureFlag"
    type: "fixed"
    response:
      Next: "NewFeaturePath"  # 新機能のパスを強制
```

**注意事項**：
- Choiceステートのモックは`Next`フィールドで次の遷移先を指定（ASL準拠）
- `Next`が指定されていない場合は、通常のChoice条件評価にフォールバック
- 他のステートと同様に`fixed`、`conditional`、`stateful`タイプが使用可能

#### 3. 並列処理の検証

Parallel ステートの全ブランチを検証：

```yaml
testCases:
  - name: "並列処理テスト"
    parallelExpectations:
      - state: "ParallelProcess"
        branchCount: 3
        branchPaths:
          0: ["Branch1Task1", "Branch1Task2"]
          1: ["Branch2Task1", "Branch2Task2"]
          2: ["Branch3Task1", "Branch3Task2"]
```

### アサーション設定

#### 出力検証モード

```yaml
assertions:
  outputMatching: "partial"  # 部分一致（開発時推奨）
  # outputMatching: "exact"   # 完全一致（本番環境推奨）
```

#### パス検証モード

```yaml
assertions:
  pathMatching: "includes"   # パスに含まれることを検証
  # pathMatching: "exact"    # 完全一致
  # pathMatching: "sequence" # 順序を保った部分一致
```

### モックオーバーライド

テストケースごとにモックを上書き：

```yaml
testCases:
  - name: "特別なケース"
    mockOverrides:  # このテストケースのみ有効
      - state: "GetUser"
        type: "fixed"
        response:
          Payload: { userId: "special" }
```

---

## ベストプラクティス

### テスト設計の原則

#### 最小限のモック

必要最小限のモックで最大限のカバレッジを達成：

```yaml
# ❌ 過度に詳細なモック
- state: "GetUser"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John"
      email: "john@example.com"
      address: { ... }  # テストに不要

# ✅ 必要十分なモック
- state: "GetUser"
  type: "fixed"
  response:
    Payload:
      userId: "123"
      name: "John"  # テストに必要な最小限
```

#### データ駆動テスト

外部ファイルを使用してテストデータを管理：

```yaml
# ItemReaderを使用したデータ駆動テスト
mocks:
  - state: "ProcessBatch"
    type: "itemReader"
    dataFile: "test-cases.csv"  # 100件のテストデータ
```

### 開発環境別の設定

#### デバッグ設定

開発中やテストのデバッグ時：

```yaml
settings:
  parallel: false          # 順次実行（エラーを追跡しやすい）
  verbose: true            # 詳細ログ出力
  timeout: 30000           # 長めのタイムアウト（30秒）

assertions:
  outputMatching: "partial"    # 緩い検証（開発中は柔軟に）
```

#### CI/CD設定

本番環境やCI/CDパイプラインでは：

```yaml
settings:
  parallel: true           # 高速実行
  verbose: false           # 最小限のログ
  stopOnFailure: true      # 早期終了
  timeout: 5000            # 短めのタイムアウト（5秒）

assertions:
  outputMatching: "exact"  # 厳密な検証
  pathMatching: "exact"    # 厳密なパス検証
```

### テストの構成と管理

#### テストスイートの分割

大規模なプロジェクトでは、ステートマシンや機能ごとにファイルを分割：

```
sfn-test/
├── mocks/                      # モック設定
│   ├── order-workflow.mock.yaml
│   └── payment-workflow.mock.yaml
├── test-suites/                # テストスイート
│   ├── order-workflow.test.yaml
│   ├── payment-workflow.test.yaml
│   └── integration.test.yaml
└── test-data/                  # テストデータ
    ├── sample-orders.json
    └── test-users.csv
```

#### 共通モックの活用

基本モック設定を共有して重複を削減：

```yaml
# base.mock.yaml - 共通モック
mocks:
  - state: "CommonAuth"
    type: "fixed"
    response: { authenticated: true }

# test-suite.yaml - テストスイート
baseMock: "base"  # 共通モックを参照
testCases:
  - name: "認証済みユーザーのテスト"
    # CommonAuthのモックが自動的に適用される
```

---

## CI/CD統合

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Step Functions Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - run: npm ci
      
      - name: Synthesize CDK
        run: npx cdk synth
        
      - name: Run Step Functions tests
        run: npx sfn-test run
        
      - name: Upload coverage
        uses: actions/upload-artifact@v3
        with:
          name: coverage
          path: .sfn-test/coverage/
```


### CDK統合

#### 自動抽出の活用

```yaml
# sfn-test.config.yaml
stateMachines:
  - name: order-processing
    source:
      type: cdk
      path: ./cdk.out/MyStack.template.json
      stateMachineName: OrderProcessingStateMachine
```

#### CDK開発ワークフロー

**推奨される開発フロー**:

1. CDKのTypeScriptコードを変更
2. `cdk synth`を手動で実行してテンプレートを更新
3. `sfn-test run`でテストを実行

```bash
# CDKコード変更後
npx cdk synth
sfn-test run

# または一行で
npx cdk synth && sfn-test run
```

**自動検出の仕組み**:
- sfn-ai-local-testはテンプレートファイルのタイムスタンプを監視
- テンプレートが更新されていれば、ASL定義を自動的に再抽出
- キャッシュにより、変更がない場合は高速に動作

---

## パフォーマンス最適化

### 並列実行の活用

独立したテストケースは並列実行で高速化：

```yaml
settings:
  parallel: true  # CPUコア数に応じて並列実行
```

### 選択的実行

開発中は特定のテストのみ実行：

```yaml
testCases:
  - name: "現在作業中のテスト"
    only: true  # このテストのみ実行
```

### タイムアウトの最適化

適切なタイムアウト設定で無駄な待機を削減：

```yaml
settings:
  timeout: 5000  # 通常は5秒で十分

testCases:
  - name: "長時間処理のテスト"
    timeout: 15000  # 特定のテストのみ延長
```

### メモリ効率

大規模なデータセットには外部ファイルを使用：

```yaml
# ❌ 避けるべき: 大規模データを直接埋め込み
- state: "GetLargeDataset"
  type: "fixed"
  response:
    Payload:
      items: [... 10000 items ...]

# ✅ 推奨: 外部ファイル参照
- state: "GetLargeDataset"
  type: "itemReader"
  dataFile: "large-dataset.jsonl"  # JSON Lines形式
```

---

## セキュリティ

### 機密情報の管理

テストデータに機密情報を含めない：

```yaml
# ❌ 避けるべき
- state: "GetSecret"
  response:
    Payload:
      apiKey: "sk-actual-api-key-12345"

# ✅ 推奨
- state: "GetSecret"
  response:
    Payload:
      apiKey: "test-api-key-dummy"
```
