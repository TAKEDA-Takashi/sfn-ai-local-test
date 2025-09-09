# 01-simple: 最もシンプルなステートマシン

## 概要
Task → Pass → Succeed という最も基本的なステートマシンの例です。
Step Functions の基本概念を理解するための出発点となります。

## 学習ポイント

### 1. 基本的なステートタイプ
- **Task**: 外部サービス（Lambda）を呼び出す
- **Pass**: データを変換・整形する
- **Succeed**: 成功で終了する

### 2. データフローの理解
- `Parameters`: ステートへの入力を構成
- `ResultPath`: タスクの結果を保存する場所を指定
- `$`: 現在の入力データを参照
- `$$`: コンテキスト変数（システム情報）を参照

## ステートマシンの構成

```
[開始]
   ↓
GetUserInfo (Task)
   - Lambda関数を呼び出してユーザー情報を取得
   - 結果を $.user に保存
   ↓
FormatOutput (Pass)  
   - ユーザー名とタイムスタンプを抽出
   - 新しい形式に整形
   ↓
Complete (Succeed)
   - 成功で終了
[終了]
```

## テストの実行

```bash
# テスト実行
sfn-test run --suite ./test-suite.yaml

# 期待される出力
✓ 基本的な実行フロー
✓ ステートレベルの検証

All tests passed!
```

## モック設定のポイント

`mock.yaml`では、Lambda関数の応答を固定値でモックしています：

```yaml
response:
  Payload:      # Lambda関数の実際の戻り値
    id: "user-123"
    name: "山田太郎"
    email: "yamada@example.com"
  StatusCode: 200  # Lambda実行のメタデータ
```

## テスト設定のポイント

### 基本的なアサーション
- `expectedOutput`: 最終的な出力を検証
- `expectedPath`: 実行経路を検証

### ステートレベルの検証
`stateExpectations`を使用して、各ステートの入出力を詳細に検証できます：

```yaml
stateExpectations:
  - state: "GetUserInfo"
    input: { ... }   # ステートへの入力
    output: { ... }  # ステート実行後の出力
```

### 部分一致の使用
タイムスタンプなど動的な値が含まれる場合は、`outputMatching: "partial"`を使用：

```yaml
assertions:
  outputMatching: "partial"
```

## 次のステップ
基本を理解したら、[02-choice](../02-choice/)で条件分岐について学びましょう。