# クイックスタートガイド

このガイドでは、sfn-ai-local-testのインストールからテスト実行までの基本的な流れを説明します。

## インストール

```bash
# グローバルインストール（推奨）
npm install -g sfn-ai-local-test

# または、プロジェクトローカルにインストール
npm install --save-dev sfn-ai-local-test
```

## 環境設定

AI機能（モック/テスト自動生成）を使用する場合は、以下のいずれかを設定します：

### オプション1: Claude Code（推奨）
Claude Code環境で実行している場合は、自動的に認証が行われるため追加設定は不要です。

### オプション2: Claude API キー
Claude Code以外の環境では、APIキーを設定します：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

> 注: Claude Codeが利用可能な場合は自動的に優先されます。

## パターン1: 設定ファイルを使用する方法（推奨）

複数のステートマシンを管理する場合や、CDKプロジェクトで使用する場合に便利です。

### 1. プロジェクトの初期化

```bash
sfn-test init
```

実行すると以下が作成されます：
```
./
├── sfn-test.config.yaml      # プロジェクト設定ファイル
├── sfn-test/
│   ├── mocks/                # モック定義を配置
│   ├── test-suites/          # テストスイートを配置
│   └── test-data/            # テストデータを配置
└── .sfn-test/                # 自動生成される作業ディレクトリ
    ├── extracted/            # CDKから抽出されたASL
    └── coverage/             # カバレッジレポート
```

### 2. ステートマシンの登録

`sfn-test.config.yaml`を編集してステートマシンを登録：

```yaml
version: "1.0"
stateMachines:
  # CDKから抽出する場合
  - name: order-processing
    source:
      type: cdk
      path: ./cdk.out/MyStack.template.json
      stateMachineName: OrderProcessingStateMachine
  
  # ASLファイルを直接指定する場合
  - name: payment-workflow
    source:
      type: file
      path: ./state-machines/payment.asl.json
```

### 3. CDKからASLを抽出（CDK使用時のみ）

```bash
# CDKをビルド
npx cdk synth

# ASLを抽出（設定ファイルを使用）
sfn-test extract

# 特定のCDK出力から抽出
sfn-test extract --cdk cdk.out/MyStack.template.json

# CDKアウトディレクトリから抽出
sfn-test extract --cdk-out cdk.out

# 論理IDで特定のステートマシンを抽出
sfn-test extract --cdk-out cdk.out --cdk-state-machine MyStateMachine

# カスタム出力ディレクトリに抽出
sfn-test extract --output ./custom/extracted
```

抽出されたASLはデフォルトで `.sfn-test/extracted/` に保存されます。

### 4. モックの生成

```bash
# AI支援でモックを自動生成
sfn-test generate mock --name order-processing

# 手動で作成する場合は sfn-test/mocks/ にYAMLファイルを配置
```

生成されたモックは `sfn-test/mocks/order-processing.mock.yaml` に保存されます。

### 5. テストスイートの生成

```bash
# AI支援でテストスイートを自動生成
sfn-test generate test --name order-processing

# 手動で作成する場合は sfn-test/test-suites/ にYAMLファイルを配置
```

生成されたテストは `sfn-test/test-suites/order-processing.test.yaml` に保存されます。

### 6. テストの実行

```bash
# すべてのテストスイートを実行
sfn-test run

# 特定のステートマシンのテストのみ実行
sfn-test run --name order-processing

# 詳細な出力付き
sfn-test run --verbose
```

## パターン2: 設定ファイルなしで使用する方法

単一のステートマシンをテストする場合や、クイックに試したい場合に便利です。

### 1. ASLファイルの準備

ステートマシン定義（ASL）ファイルを用意します：
```
./state-machine.asl.json
```

### 2. モックの生成

```bash
# AI支援でモックを自動生成
sfn-test generate mock --asl ./state-machine.asl.json -o ./mock.yaml

# 手動で mock.yaml を作成することも可能
```

### 3. テストスイートの生成

```bash
# AI支援でテストスイートを自動生成
sfn-test generate test --asl ./state-machine.asl.json \
  --mock ./mock.yaml \
  -o ./test-suite.yaml

# 手動で test-suite.yaml を作成することも可能
```

### 4. テストの実行

```bash
# テストスイートを指定して実行
sfn-test run --suite ./test-suite.yaml

# ASLとモックを直接指定して実行（単発テスト用）
sfn-test run --asl ./state-machine.asl.json \
  --mock ./mock.yaml \
  --input '{"orderId": "test-001"}'
```

## 実行結果の確認

### テスト結果

```bash
✓ order-processing-workflow
  ✓ Test successful order (23ms)
  ✓ Test payment failure (15ms)
  ✓ Test inventory shortage (18ms)

Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
Time:        0.056s
```

### カバレッジレポート

```bash
# テスト実行後にカバレッジを表示
sfn-test run --name order-processing --cov

# JSONフォーマットで出力
sfn-test run --name order-processing --cov json

# 設定ファイルなしの場合
sfn-test run --suite ./test-suite.yaml --cov
```

カバレッジレポートは `.sfn-test/coverage/` に保存されます。

## ディレクトリ構造まとめ

### 設定ファイルあり（パターン1）
```
project-root/
├── sfn-test.config.yaml           # プロジェクト設定
├── sfn-test/
│   ├── mocks/                     # モック定義
│   │   └── order-processing.mock.yaml
│   ├── test-suites/               # テストスイート
│   │   └── order-processing.test.yaml
│   └── test-data/                 # テストデータ
│       └── sample-order.json
├── .sfn-test/                     # 自動生成（.gitignoreに追加推奨）
│   ├── extracted/                 # CDKから抽出したASL
│   │   └── order-processing.asl.json
│   └── coverage/                  # カバレッジレポート
│       └── coverage-summary.json
└── cdk.out/                       # CDK出力（CDK使用時）
    └── MyStack.template.json
```

### 設定ファイルなし（パターン2）
```
project-root/
├── state-machine.asl.json         # ステートマシン定義
├── mock.yaml                      # モック定義
├── test-suite.yaml                # テストスイート
└── .sfn-test/                     # 自動生成
    └── coverage/                  # カバレッジレポート
```
