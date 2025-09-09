# エラーハンドリングサンプル

このサンプルでは、AWS Step Functionsの**基本的なエラーハンドリングパターン**を、シンプルで理解しやすいワークフローで実演します。

## 学習目標

このサンプルを学習することで、以下を理解できます：

1. **リトライメカニズム** - 失敗した処理を自動的にリトライする方法
2. **Catchブロック** - 特定のタイプのエラーを処理する方法
3. **エラールーティング** - 異なるエラーが異なる結果に導かれる仕組み
4. **ResultPath** - 元のデータと一緒にエラー情報を保持する方法

## 実演する主要パターン

### 1. ハッピーパス（エラーなし）
```
ProcessTransaction → NotifySuccess
```
すべてが正常に動作する通常のフロー。

### 2. 特定のエラーハンドリング
```
ProcessTransaction → [エラー: InsufficientFunds] → HandleInsufficientFunds
ProcessTransaction → [エラー: ValidationError] → HandleValidationError
```
異なるエラーが適切なハンドラにルーティングされる。

### 3. 包括的エラーハンドリング
```
ProcessTransaction → [エラー: その他] → HandleGeneralError
```
未知のエラーがフォールバックメカニズムで処理される。

### 4. 自動リトライ
```
ProcessTransaction → [失敗] → [リトライ] → ProcessTransaction → NotifySuccess
```
一時的なエラーが自動的にリトライされ、その後成功する。

## ワークフロー構造

**包括的エラーハンドリングを持つ単一タスク：**
- `ProcessTransaction` - リトライとキャッチ設定を持つメインビジネスロジック
- `NotifySuccess` - 成功時の結果
- `HandleInsufficientFunds` - 特定のエラーハンドラ
- `HandleValidationError` - 別の特定のエラーハンドラ
- `HandleGeneralError` - 包括的エラーハンドラ

## エラーハンドリング設定

### リトライブロック
```json
"Retry": [
  {
    "ErrorEquals": ["States.TaskFailed", "Lambda.ServiceException"],
    "IntervalSeconds": 1,
    "MaxAttempts": 2,
    "BackoffRate": 2.0
  }
]
```
- ネットワーク/サービスエラーを最大2回リトライ
- 初期間隔1秒、リトライごとに倍になる

### キャッチブロック
```json
"Catch": [
  {
    "ErrorEquals": ["InsufficientFundsError"],
    "Next": "HandleInsufficientFunds",
    "ResultPath": "$.error"
  },
  // ... その他の特定ハンドラ
  {
    "ErrorEquals": ["States.ALL"],
    "Next": "HandleGeneralError", 
    "ResultPath": "$.error"
  }
]
```
- 特定のエラーは特定のハンドラに送られる
- `States.ALL`は他のすべてをキャッチ
- `ResultPath: "$.error"`でエラー情報を保持

## テストの実行

```bash
# すべてのエラーハンドリングパターンをテスト
sfn-test run --suite test-suite.yaml

# カバレッジ付きで実行して全パスがテストされることを確認
sfn-test run --suite test-suite.yaml --cov

# 特定パターンをテスト
sfn-test run --input '{"transactionId": "test", "amount": -50}' # バリデーションエラー
```

## テストケースの説明

1. **成功する取引** - ハッピーパスをテスト
2. **資金不足エラー** - 特定のエラーハンドリングをテスト
3. **バリデーションエラー** - 別の特定エラーハンドリングをテスト
4. **予期しないエラー** - 包括的エラーハンドリングをテスト
5. **リトライ付き一時的失敗** - 自動リトライメカニズムをテスト

各テストは、実際のStep Functionsで使用するコアエラーハンドリングパターンを実演しています。