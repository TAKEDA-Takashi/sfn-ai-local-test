# 設定ファイルリファレンス

このドキュメントでは、sfn-ai-local-testの設定ファイルについて詳しく説明します。

## 📋 目次

### プロジェクト設定（sfn-test.config.yaml）
1. [プロジェクト設定ファイル](#プロジェクト設定ファイル)
2. [stateMachines セクション](#statemachines-セクション)
3. [paths セクション](#paths-セクション)

### モック設定ファイル（mock.yaml）
4. [モックファイル構造](#モックファイル構造)
5. [モックタイプ仕様](#モックタイプ仕様)

### テストスイート設定（test-suite.yaml）
6. [テストスイート構造](#テストスイート構造)
7. [settings セクション](#settings-セクション)
8. [assertions セクション](#assertions-セクション)
9. [testCases セクション](#testcases-セクション)
10. [mockOverrides セクション](#mockoverrides-セクション)
11. [ItemReader対応](#itemreader対応)

### ファイル解決仕様
12. [自動ファイル名類推](#自動ファイル名類推)
13. [パス解決ルール](#パス解決ルール)

## プロジェクト設定ファイル

`sfn-test.config.yaml`は、プロジェクト全体の設定を管理するファイルです。このファイルは`sfn-test init`コマンドで自動生成されます。

### 基本構造

```yaml
version: '1.0'                    # 必須: 設定ファイルバージョン

# ディレクトリパス設定（任意）
paths:
  mocks: './sfn-test/mocks'            # モック設定ファイルの格納先
  testSuites: './sfn-test/test-suites' # テストスイートの格納先
  testData: './sfn-test/test-data'     # テストデータの格納先
  extracted: './.sfn-test/extracted'   # CDKから抽出したASLの保存先
  coverage: './.sfn-test/coverage'     # カバレッジレポートの保存先

# ステートマシン定義（必須）
stateMachines:
  - name: 'workflow1'                   # ステートマシンの識別名
    source:
      type: 'asl'                       # ASL JSONファイルの場合
      path: './workflow1.asl.json'      # ファイルパス
      
  - name: 'workflow2'
    source:
      type: 'cdk'                       # CDKテンプレートの場合
      path: './cdk.out/MyStack.template.json'
      stateMachineName: 'MyStateMachine' # リソース名（CDKの場合必須）
```

### 設定項目の詳細

| 項目 | 必須 | 説明 |
|------|------|------|
| `version` | ✅ | 設定ファイルのバージョン。現在は`'1.0'`のみサポート |
| `paths` | ❌ | ディレクトリパスのカスタマイズ。省略時はデフォルトパスを使用 |
| `stateMachines` | ✅ | ステートマシン定義の配列。最低1つ必要 |

## stateMachines セクション

プロジェクトで管理するステートマシンを定義します。

### ASL JSON形式の場合

```yaml
stateMachines:
  - name: 'payment-workflow'
    source:
      type: 'asl'
      path: './workflows/payment.asl.json'
```

### CDK CloudFormation形式の場合

```yaml
stateMachines:
  - name: 'order-processing'
    source:
      type: 'cdk'
      path: './cdk.out/OrderStack.template.json'
      stateMachineName: 'OrderProcessingStateMachine'
```

**重要**: `type: 'cdk'`の場合の動作：
- 初回実行時にCloudFormationテンプレートからASL定義を抽出して**自動保存**
- 保存先: `paths.extracted`ディレクトリ（デフォルト: `./.sfn-test/extracted/`）
- **スマートキャッシュ**: CDKテンプレートのタイムスタンプを監視
  - ソースが更新されていない場合はキャッシュを使用（高速）
  - ソースが更新された場合は再抽出して更新
- 事前の`extract`コマンド実行は不要（自動処理）

### 設定項目

| 項目 | 必須 | 説明 |
|------|------|------|
| `name` | ✅ | ステートマシンの識別名。テストスイートから参照時に使用 |
| `source.type` | ✅ | ソースタイプ。`'asl'`（ASL JSONファイル）または`'cdk'`（CloudFormationテンプレート） |
| `source.path` | ✅ | ソースファイルへのパス（相対パスまたは絶対パス） |
| `source.stateMachineName` | CDKのみ✅ | CloudFormationテンプレート内のリソース名 |

### ASL vs CDK の動作の違い

| タイプ | 動作 | パフォーマンス | 用途 |
|--------|------|---------------|------|
| `asl` | ASL JSONファイルを直接読み込み | 高速（JSONパース1回） | ASL JSONファイルが既にある場合 |
| `cdk` | 初回: 抽出して保存<br>2回目以降: キャッシュ使用 | 初回: やや遅い<br>2回目以降: 高速 | CDKプロジェクトで自動同期 |

### キャッシュの仕組み

CDKタイプでは以下のファイルが自動生成されます：

```
.sfn-test/extracted/
├── workflow-name.asl.json      # 抽出されたASL定義
└── workflow-name.metadata.json  # メタデータ（タイムスタンプ等）
```

**キャッシュの更新条件**：
- CloudFormationテンプレートが更新された場合（mtime比較）
- キャッシュファイルが存在しない場合
- メタデータファイルが破損している場合

### extractコマンドとの関係

`sfn-test extract`コマンドは以下の動作をします：

#### 引数なしの場合（推奨）
```bash
# 設定ファイルに基づいて自動抽出
sfn-test extract
```
- `sfn-test.config.yaml`の全CDKタイプステートマシンを抽出
- 設定で指定された`paths.extracted`に保存
- 通常のCDK開発ではこれで十分

#### 引数ありの場合（特殊ケース）
```bash
# 明示的にパスを指定して抽出（設定を上書き）
sfn-test extract --cdk cdk.out/Stack.template.json --output ./custom/path
```
- 設定ファイルを無視して独自のパスから抽出
- 以下のユースケースで有用：
  - 別環境のCDKテンプレートを検証
  - 特定バージョンのASLを固定保存
  - CI/CDパイプラインでの特殊処理

#### 抽出したASLを固定して使用
```yaml
# 抽出済みのASLファイルを参照
stateMachines:
  - name: 'extracted-workflow'
    source:
      type: 'asl'  # CDKではなくASLとして扱う
      path: './.sfn-test/extracted/workflow.asl.json'
```

この方法は、CDKテンプレートが頻繁に変更される場合や、特定バージョンのASLを固定したい場合に有用です。

### 複数ステートマシンの管理

```yaml
stateMachines:
  # ASL直接定義
  - name: 'simple-workflow'
    source:
      type: 'asl'
      path: './workflows/simple.asl.json'
      
  # CDKから抽出済みのASL
  - name: 'extracted-workflow'
    source:
      type: 'asl'
      path: './.sfn-test/extracted/workflow.asl.json'
      
  # CDKテンプレート直接参照
  - name: 'cdk-workflow'
    source:
      type: 'cdk'
      path: './cdk.out/AppStack.template.json'
      stateMachineName: 'MainStateMachine'
```

## paths セクション

プロジェクトのディレクトリ構造をカスタマイズできます。

### デフォルトパス

```yaml
# 省略時は以下のデフォルトパスが適用されます
paths:
  mocks: './sfn-test/mocks'
  testSuites: './sfn-test/test-suites'
  testData: './sfn-test/test-data'
  extracted: './.sfn-test/extracted'
  coverage: './.sfn-test/coverage'
```

### カスタマイズ例

```yaml
# モノレポ構成の例
paths:
  mocks: './tests/mocks'
  testSuites: './tests/suites'
  testData: './tests/data'
  extracted: './build/sfn'
  coverage: './reports/coverage'
```

### パス解決ルール

1. **相対パス**: プロジェクトルートからの相対パスとして解決
2. **絶対パス**: そのまま使用
3. **部分指定**: 指定しなかった項目はデフォルト値を使用

```yaml
# mocksとtestSuitesのみカスタマイズ
paths:
  mocks: './custom/mocks'
  testSuites: './custom/tests'
  # testData, extracted, coverageはデフォルトのまま
```

### ディレクトリの役割

| ディレクトリ | 用途 | Gitignore推奨 |
|-------------|------|---------------|
| `mocks` | モック設定ファイル（.mock.yaml） | ❌ |
| `testSuites` | テストスイートファイル（test-suite.yaml） | ❌ |
| `testData` | テストデータ（CSV、JSON等） | ❌ |
| `extracted` | CDKから抽出したASLファイル | ✅ |
| `coverage` | カバレッジレポート | ✅ |

## 名前解決の仕組み

### ステートマシンの参照

テストスイートやCLIコマンドでステートマシンを参照する際の解決順序：

1. **名前として解釈**: `sfn-test.config.yaml`の`stateMachines`から検索
2. **パスとして解釈**: ファイルパスとして直接読み込み

```yaml
# テストスイート内での参照例
stateMachine: "payment-workflow"  # 名前で参照（省略可能※）
# または
stateMachine: "./workflows/payment.asl.json"  # パスで直接指定

# ※ファイル名が payment-workflow.test.yaml の場合は省略可能
```

### モック・テストスイートの自動ファイル名生成

名前でステートマシンを参照した場合、関連ファイルは自動的に以下のパスで検索されます：

```yaml
# sfn-test.config.yaml
stateMachines:
  - name: 'payment-workflow'
    source:
      type: 'asl'
      path: './payment.asl.json'
```

この設定の場合：
- **モックファイル**: `sfn-test/mocks/payment-workflow.mock.yaml`
- **テストスイート**: `sfn-test/test-suites/payment-workflow.test.yaml`

```yaml
# テストスイート内で名前参照した場合
# ファイル名: payment-workflow.test.yaml
stateMachine: "payment-workflow"  # 省略可能（ファイル名から自動類推）
baseMock: "payment-workflow"      # → sfn-test/mocks/payment-workflow.mock.yaml を自動検索
```

## 設定ファイルの実例

### シンプルなプロジェクト

```yaml
version: '1.0'
stateMachines:
  - name: 'main'
    source:
      type: 'asl'
      path: './workflow.asl.json'
```

### CDKプロジェクト

```yaml
version: '1.0'
stateMachines:
  - name: 'api-workflow'
    source:
      type: 'cdk'
      path: './cdk.out/ApiStack.template.json'
      stateMachineName: 'ApiWorkflowStateMachine'
  - name: 'batch-workflow'
    source:
      type: 'cdk'
      path: './cdk.out/BatchStack.template.json'
      stateMachineName: 'BatchProcessingStateMachine'
```

### マルチワークフロープロジェクト

```yaml
version: '1.0'

paths:
  mocks: './tests/mocks'
  testSuites: './tests/suites'
  testData: './tests/fixtures'

stateMachines:
  # ユーザー管理ワークフロー
  - name: 'user-registration'
    source:
      type: 'asl'
      path: './workflows/user/registration.asl.json'
      
  - name: 'user-verification'
    source:
      type: 'asl'
      path: './workflows/user/verification.asl.json'
      
  # 注文処理ワークフロー
  - name: 'order-create'
    source:
      type: 'cdk'
      path: './cdk.out/OrderStack.template.json'
      stateMachineName: 'CreateOrderStateMachine'
      
  - name: 'order-fulfillment'
    source:
      type: 'cdk'
      path: './cdk.out/OrderStack.template.json'
      stateMachineName: 'FulfillmentStateMachine'
```


## 注意事項とベストプラクティス

### 1. 名前の一意性

ステートマシンの`name`はプロジェクト内で一意である必要があります：

```yaml
# ❌ 悪い例：名前が重複
stateMachines:
  - name: 'workflow'
    source:
      type: 'asl'
      path: './workflow1.asl.json'
  - name: 'workflow'  # エラー：名前の重複
    source:
      type: 'asl'
      path: './workflow2.asl.json'

# ❌ 悪い例：when条件でinputフィールドが欠如
conditions:
  - when:
      age: 20        # エラー：inputフィールドが必要
    response:
      valid: true
    
# ✅ 良い例：正しいwhen条件の記法
conditions:
  - when:
      input:         # 必須：inputフィールドを必ず記載
        age: 20
    response:
      valid: true
```

### 2. CDKリソース名の確認

CDKの`stateMachineName`はCloudFormationテンプレート内のリソース名と一致する必要があります。

CloudFormationテンプレートを直接確認するか、以下のコマンドで確認できます：

```bash
# CloudFormationテンプレート内のStep Functionsリソースを確認
jq '.Resources | to_entries[] | select(.value.Type == "AWS::StepFunctions::StateMachine") | .key' cdk.out/Stack.template.json
```

### 3. パスの正規化

相対パスはプロジェクトルートからの相対パスとして解決されます：

```yaml
# これらは同じファイルを指す
path: './workflow.asl.json'
path: 'workflow.asl.json'
```

### 4. ファイルの存在確認

設定ファイルで指定したパスのファイルが存在しない場合、実行時にエラーになります：

```bash
# エラー例
Error: State machine source file not found: ./workflow.asl.json
```

### 5. Gitignore推奨設定

```gitignore
# 作業用ディレクトリ
.sfn-test/

# CDK出力（必要に応じて）
cdk.out/

# カバレッジレポート（paths設定でカスタマイズした場合）
reports/coverage/
```

---

## モックファイル構造

モック設定ファイル（`.mock.yaml`）は、Step Functionsステートの実行をシミュレートするための設定を定義します。

### 基本構造

```yaml
version: "1.0"                    # 必須: ファイルバージョン
description: "Mock description"   # 任意: モック設定の説明
mocks:                            # 必須: モック定義の配列
  - state: "StateName"            # 必須: 対象ステート名
    type: "fixed"                 # 必須: モックタイプ
    response: { }                 # タイプに応じた応答設定
```

### モック定義のフィールド

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `state` | ✅ | モックを適用するステート名 |
| `type` | ✅ | モックタイプ（fixed, conditional, stateful, error, itemReader） |
| `response` | ※ | 応答データ（type: errorの場合は不要） |
| `responseFile` | ※ | 応答データのファイルパス（responseの代替、type: fixed） |
| `error` | ※ | エラー設定（type: errorの場合必須） |
| `probability` | ❌ | エラー発生確率（type: errorで使用、0-1の範囲） |
| `delay` | ❌ | 遅延時間（ミリ秒、すべてのモックタイプで使用可能） |
| `conditions` | ※ | 条件配列（type: conditionalの場合必須、各when条件でinputフィールド必須） |
| `responses` | ※ | 応答配列（type: statefulの場合必須） |
| `responsesFile` | ※ | 応答配列のファイルパス（responsesの代替、type: stateful） |
| `responseFormat` | ❌ | ファイル形式の明示指定（json, csv, jsonl, yaml。通常は自動判定） |
| `data` | ※ | インラインデータ配列（type: itemReaderの場合） |
| `dataFile` | ※ | データファイルパス（type: itemReaderの場合） |
| `dataFormat` | ❌ | データファイルの形式（json, csv, jsonl, yaml。通常は自動判定） |

## モックタイプ仕様

### type: "fixed" - 固定値応答

常に同じ値を返すシンプルなモック。

```yaml
mocks:
  - state: "ProcessData"
    type: "fixed"
    response:
      result: "success"
      data: { processed: true }
```

**responseFileを使用した場合**:
```yaml
mocks:
  - state: "LoadData"
    type: "fixed"
    responseFile: "data.json"  # test-dataディレクトリから読み込み
```

### type: "conditional" - 条件分岐

入力に基づいて異なる応答を返す。

```yaml
mocks:
  - state: "ValidateAge"
    type: "conditional"
    conditions:
      - when:
          input:
            age: 20               # 部分一致による条件判定
            category: "adult"
        response:
          valid: true
      - when:
          input:
            age: 15               # 別の条件
        response:
          valid: false
      - default:                  # すべての条件に一致しない場合
          error: "Invalid input"
```

**条件判定の仕組み**:
- **inputフィールド必須**: すべての`when`条件で`input:`フィールドの指定が必要
- **部分一致**: `when.input`のすべてのフィールドが実際の入力に含まれ、値が一致すれば条件成立
- **追加フィールド許容**: 入力に追加のフィールドがあっても問題なし
- **完全一致不要**: 条件で指定したフィールドのみチェック

**例**:
```yaml
# 条件
when:
  input:
    userId: "123"
    status: "active"

# これらの入力はすべてマッチ
input: { userId: "123", status: "active" }                    # ✅ 完全一致
input: { userId: "123", status: "active", extra: "data" }     # ✅ 追加フィールドOK
input: { userId: "123", status: "active", nested: {...} }     # ✅ ネストしたデータもOK

# これらはマッチしない
input: { userId: "456", status: "active" }     # ❌ userIdが不一致
input: { userId: "123" }                       # ❌ statusが欠落
```

### type: "stateful" - ステートフル応答

呼び出し回数に応じて異なる応答を返す。配列の最後まで到達すると、最初に戻ってループする。

```yaml
mocks:
  - state: "RetryableTask"
    type: "stateful"
    responses:
      - { error: "Temporary failure" }    # 1回目
      - { error: "Still failing" }        # 2回目
      - { success: true, data: "OK" }     # 3回目（4回目以降は1回目に戻ってループ）
```

**responsesFileを使用した場合**:
```yaml
mocks:
  - state: "ProgressTracker"
    type: "stateful"
    responsesFile: "progress-states.json"  # test-dataディレクトリから読み込み
```

**responsesFileのフォーマット例（JSON）**:
```json
[
  { "status": "starting", "progress": 0 },
  { "status": "processing", "progress": 50 },
  { "status": "completed", "progress": 100 }
]
```

**responsesFileのフォーマット例（JSONL）**:
```jsonl
{"status": "starting", "progress": 0}
{"status": "processing", "progress": 50}
{"status": "completed", "progress": 100}
```

### type: "error" - エラー発生

Step Functionsのエラーを発生させる。`probability`を指定した場合、エラーが発生しなかったときは空のオブジェクト `{}` を返す。

```yaml
mocks:
  - state: "ExternalAPI"
    type: "error"
    error:
      type: "States.TaskFailed"       # エラータイプ
      cause: "External service down"   # エラー原因
      message: "Connection timeout"    # エラーメッセージ（任意）
    probability: 0.5                  # エラー発生確率（任意、0-1の範囲。省略時は常にエラー）
                                       # エラーが発生しない場合は {} を返す
```

**標準エラータイプ**:
- `States.ALL`: すべてのエラー
- `States.TaskFailed`: タスク失敗
- `States.Permissions`: 権限エラー
- `States.Timeout`: タイムアウト
- `States.DataLimitExceeded`: データサイズ超過
- `Lambda.ServiceException`: Lambdaサービスエラー
- `Lambda.TooManyRequestsException`: レート制限


### 遅延（delay）フィールド

すべてのモックタイプで`delay`フィールドを使用して、応答を遅延させることができます。これにより、実際のAPIやサービスのレイテンシをシミュレートできます。

```yaml
mocks:
  # Fixed型モックでの遅延
  - state: "GetUserData"
    type: "fixed"
    delay: 1000  # 1秒遅延
    response:
      userId: "12345"

  # Error型モックでの遅延（エラーを投げる前に遅延）
  - state: "APICall"
    type: "error"
    delay: 2000  # 2秒後にエラー
    error:
      type: "States.TaskFailed"
      cause: "Timeout"

  # Conditional型モックでの遅延
  - state: "ProcessOrder"
    type: "conditional"
    delay: 500  # デフォルトで500ms遅延
    conditions:
      - when:
          input:
            priority: "high"
        delay: 100  # 高優先度は100ms遅延（モックレベルの設定を上書き）
        response:
          status: "processed"
      - when:
          input:
            priority: "low"
        delay: 3000  # 低優先度は3秒遅延
        response:
          status: "queued"
```

**注意**: Conditional型モックでは、条件レベルの`delay`がモックレベルの`delay`よりも優先されます。

### type: "itemReader" - Distributed Map用データソース

Distributed MapステートのItemReaderをモックするための専用タイプ。外部リソース（S3、DynamoDB等）から読み込むデータを提供する。

```yaml
mocks:
  # インラインデータ
  - state: "ProcessUsersMap"
    type: "itemReader"
    data:
      - { id: 1, name: "Alice", email: "alice@example.com" }
      - { id: 2, name: "Bob", email: "bob@example.com" }
      - { id: 3, name: "Charlie", email: "charlie@example.com" }

  # ファイルからデータを読み込み
  - state: "ProcessOrdersMap"
    type: "itemReader"
    dataFile: "orders.json"     # test-dataディレクトリから読み込み
    
  # CSVファイルの使用
  - state: "ProcessRecordsMap"
    type: "itemReader"
    dataFile: "records.csv"     # 拡張子から自動判定
    
  # フォーマットを明示指定（通常は不要）
  - state: "ProcessDataMap"
    type: "itemReader"
    dataFile: "data.txt"
    dataFormat: "jsonl"         # ファイル拡張子から判定できない場合に指定
```

**ItemReaderと通常のMap（ItemsPath）の違い**:
- **ItemReader**: 外部リソースからデータを読み込む → モックが必要
- **ItemsPath**: 入力データから配列を取得 → モック不要（入力で制御）

**dataFileのフォーマット例**:

JSON形式:
```json
[
  { "id": 1, "value": 100 },
  { "id": 2, "value": 200 }
]
```

CSV形式:
```csv
id,name,amount
1,Product A,100
2,Product B,200
```

JSONL形式:
```jsonl
{"id": 1, "status": "pending"}
{"id": 2, "status": "processing"}
{"id": 3, "status": "completed"}
```

---

## テストスイート構造

テストスイートファイル（`test-suite.yaml`）は、Step Functionsワークフローのテストケースを定義します。

### 基本構造

```yaml
version: "1.0"                    # 必須: 設定ファイルのバージョン
name: "Test Suite Name"           # 必須: テストスイート名
description: "Description"        # 任意: テストスイートの説明
stateMachine: "workflow-name"    # 必須※: ステートマシン名またはパス（※ファイル名から自動類推可能）
baseMock: "mock-name"            # 任意: モック設定（名前またはパス、省略時はステートマシン名から自動類推）

settings: { }                     # 任意: 実行設定
assertions: { }                   # 任意: アサーション設定
testCases: [ ]                    # 必須: テストケースの配列
```

## settings セクション

テスト実行時の動作を制御する設定です。

### 設定オプション一覧

| オプション | 型 | デフォルト | 説明 |
|----------|-----|----------|------|
| `timeout` | number | 10000 | **全体のデフォルトタイムアウト（ミリ秒）**<br>各テストケースの最大実行時間。個別のテストケースで上書き可能。 |
| `parallel` | boolean | false | **並列実行モード**<br>`true`: すべてのテストケースを同時実行<br>`false`: 順番に実行 |
| `verbose` | boolean | false | **詳細ログ出力**<br>`true`: 実行の詳細情報を出力<br>`false`: 最小限の出力 |
| `stopOnFailure` | boolean | false | **テストスイートの早期終了**<br>`true`: 最初のテストケース失敗で残りをスキップ<br>`false`: 失敗があっても全テストケースを実行<br>※個々のテスト内のステート実行には影響しない |

### 使用例

```yaml
settings:
  timeout: 10000           # 10秒のタイムアウト
  parallel: false          # 順次実行
  verbose: true            # 詳細ログ出力
  stopOnFailure: false     # 失敗しても続行
```

### 実行モードの違い

#### 並列実行 (`parallel: true`)
```
Test1 ──┐
Test2 ──┼── 同時実行 ──> 結果
Test3 ──┘
```
- **メリット**: 高速実行
- **デメリット**: デバッグが困難、リソース競合の可能性

#### 順次実行 (`parallel: false`)
```
Test1 ──> Test2 ──> Test3 ──> 結果
```
- **メリット**: デバッグが容易、エラー箇所の特定が簡単
- **デメリット**: 実行時間が長い

#### stopOnFailureの動作
`stopOnFailure`は**テストケース間**の制御です：

```yaml
# stopOnFailure: false（デフォルト）
TestCase1: ✅ Pass
TestCase2: ❌ Fail（Task3でエラー） → TestCase3も実行される
TestCase3: ✅ Pass
TestCase4: ❌ Fail → すべて実行完了

# stopOnFailure: true
TestCase1: ✅ Pass  
TestCase2: ❌ Fail（Task3でエラー） → ここで停止
TestCase3: ⏭️ Skip（実行されない）
TestCase4: ⏭️ Skip（実行されない）
```

**注意**: 各テストケース内でのステートマシン実行は通常通り動作します。タスクがエラーになった場合：
- Catchがあれば処理を継続
- Catchがなければそのテストケースは失敗として終了
- 次のテストケースに進むかは`stopOnFailure`次第

## assertions セクション

テスト結果の検証方法を制御する設定です。

### 設定オプション一覧

| オプション | 型 | デフォルト | 説明 |
|----------|-----|----------|------|
| `outputMatching` | string | "partial" | **出力の比較方式**（exact, partial） |
| `pathMatching` | string | "exact" | **実行パスの比較方式**（exact, includes, sequence） |

### outputMatching の詳細

#### `"exact"` - 完全一致
期待出力と実際の出力が完全に一致する必要があります。

#### `"partial"` - 部分一致
期待出力のフィールドが実際の出力に含まれていればOK。追加フィールドは無視されます。

### pathMatching の詳細

#### `"exact"` - 完全一致
パスが順序も含めて完全に一致する必要があります。

**Map/Distributed Mapステートの扱い**:
MapやDistributed Map自体は実行パスに記録されますが、内部で実行される個々のイテレーションのステートは記録されません。Map/Parallelステートの詳細な検証には専用のフィールド（`mapExpectations`、`parallelExpectations`）を使用してください。

```yaml
# ステートマシン構造：
# Start -> ProcessMap (Map) -> End
#           └─> InnerTask (各アイテムで実行)

# 実行パスの例：
expectedPath: ["Start", "ProcessMap", "End"]
# 注意: "InnerTask"は実行パスに含まれません
```

### expectedPath - 複数条件の指定

`expectedPath`は単一のパス条件だけでなく、複数のパス条件を指定できます。複数指定した場合はすべての条件を満たす必要があります（AND条件）。

#### 単一条件
```yaml
expectedPath: ["Start", "Process", "End"]  # このパスと完全一致
```

#### 複数条件（AND条件、sequenceモードで有効）
```yaml
# sequenceモードでは、複数のシーケンスがすべて含まれることを検証
assertions:
  pathMatching: "sequence"  # 各条件はsequenceとして評価
expectedPath:
  - ["Task1", "Task2"]     # Task1→Task2が連続して存在
  - ["Task3", "Task4"]     # かつ、Task3→Task4も連続して存在
  # 実行パスに両方のシーケンスが含まれる必要がある
```

#### 実用例：複雑なフローの検証
```yaml
testCases:
  - name: "複雑な分岐フローのテスト"
    input: { type: "complex" }
    assertions:
      pathMatching: "sequence"
    expectedPath:
      # 初期処理が実行される
      - ["Initialize", "Validate"]
      # メイン処理が実行される
      - ["ProcessMain", "Transform", "Store"]
      # 後処理が実行される
      - ["Cleanup", "Notify"]
    # これらすべてのシーケンスが順番に含まれることを検証
```

#### `"includes"` - 要素が含まれる
期待するステートがすべて含まれていればOK（順序は問わない）。

```yaml
# 例：
expectedPath: ["Task2", "Task3"]
actualPath: ["Task1", "Task2", "Task3", "Task4"]  # ✅ OK - Task2とTask3が両方含まれる
actualPath: ["Task1", "Task3", "Task2", "Task4"]  # ✅ OK - 順序は違うが両方含まれる
actualPath: ["Task3", "Task1", "Task2", "Task4"]  # ✅ OK - 順序は違うが両方含まれる
actualPath: ["Task1", "Task2", "Task4", "Task5"]  # ❌ NG - Task3が含まれない
```

#### `"sequence"` - 連続したシーケンス
期待するステートが連続した順序で含まれていればOK。

```yaml
# 例：
expectedPath: ["Task2", "Task3"]
actualPath: ["Task1", "Task2", "Task3", "Task4"]  # ✅ OK - Task2→Task3が連続して存在
actualPath: ["Task2", "Task3", "Task1", "Task4"]  # ✅ OK - Task2→Task3が連続して存在
actualPath: ["Task1", "Task3", "Task2", "Task4"]  # ❌ NG - Task2→Task3の順序が違う
actualPath: ["Task2", "Task1", "Task3", "Task4"]  # ❌ NG - Task2とTask3が連続していない
```

### stateMatching の詳細

#### `"exact"` - 完全一致
ステートの入出力と変数が完全に一致する必要があります。

#### `"partial"` - 部分一致
期待値のフィールドが実際の値に含まれていればOK。追加フィールドは無視されます。

### 使用例

```yaml
assertions:
  outputMatching: "partial"      # 部分一致で検証
  pathMatching: "exact"          # パスは完全一致
  stateMatching: "partial"       # ステート検証は部分一致
```

## testCases セクション

個別のテストケースの設定です。

### テストケースのオプション

| オプション | 型 | 必須 | 説明 |
|----------|-----|-----|------|
| `name` | string | ✅ | テストケース名 |
| `description` | string | ❌ | テストケースの説明 |
| `input` | any | ✅ | ステートマシンへの入力 |
| `expectedOutput` | any | ❌ | 期待する出力 |
| `expectedPath` | string[] \| string[][] | ❌ | 期待する実行パス（複数条件可） |
| `expectedError` | object/string | ❌ | 期待するエラー |
| `stateExpectations` | StateExpectation[] | ❌ | ステートレベルの検証 |
| `timeout` | number | ❌ | このテストケースのタイムアウト |
| `skip` | boolean | ❌ | テストをスキップ |
| `only` | boolean | ❌ | このテストのみ実行 |
| `mockOverrides` | MockOverride[] | ❌ | テスト固有のモック設定 |
| `mapExpectations` | MapExpectation[] | ❌ | Mapステート専用の検証 |
| `parallelExpectations` | ParallelExpectation[] | ❌ | Parallelステート専用の検証 |


### stateExpectations - ステートレベルの検証

個々のステートの入出力や変数を検証できます。

#### 基本構造
```yaml
stateExpectations:
  - state: "ProcessData"        # ステート名
    input: { data: "raw" }       # 期待する入力
    output: { data: "processed" } # 期待する出力
    variables:                   # 期待する変数値（実行後）
      counter: 1
      status: "active"
```

#### ドット記法とブラケット記法
Map/Parallelの内部ステートを指定する場合：

```yaml
stateExpectations:
  # ドット記法
  - state: "MapState.0"           # 0番目のイテレーション
    input: { item: 1 }
    output: { result: 2 }
    
  - state: "MapState.0.InnerTask" # 内部のステート
    output: { processed: true }
    
  # ブラケット記法
  - state: "MapState[2]"          # 2番目のイテレーション
    input: { item: 3 }
    
  # 混在も可能
  - state: "MapState[0].InnerTask"
    output: { success: true }
    
  # Parallelステート
  - state: "ParallelProcess[0]"   # ブランチ0
    output: { branchResult: "A" }
    
  - state: "ParallelProcess[1].SubTask"  # ブランチ1の内部ステート
    input: { branchData: "B" }
```

#### 部分検証
大量データの場合、特定のインデックスのみ検証：

```yaml
stateExpectations:
  # Map全体の入出力
  - state: "ProcessLargeData"
    input: { items: [/* 1000 items */] }
    output: { processedCount: 1000 }
    
  # 特定のインデックスのみチェック
  - state: "ProcessLargeData[0]"    # 最初
    output: { index: 0, success: true }
    
  - state: "ProcessLargeData[999]"  # 最後
    output: { index: 999, success: true }
    
  # 中間はスキップ（効率的な検証）
```

#### 変数の検証
Assignステートで設定された変数を検証：

```yaml
stateExpectations:
  - state: "SetVariables"
    variables:               # このステート実行後の変数値
      userId: "12345"
      timestamp: 1234567890
      
  - state: "UseVariables"
    input:                   # 変数が入力に反映されているか
      user: "12345"
      time: 1234567890
```

### mapExpectations - Mapステート専用の検証

Mapステートの実行フロー（イテレーション数、各イテレーションの実行パス）を検証します。

#### 基本構造
```yaml
mapExpectations:
  - state: "ProcessItems"            # Mapステート名
    iterationCount: 5                # 期待するイテレーション数
    iterationPaths:                  # イテレーションのパス検証
      pathMatching: "exact"           # パス比較方式（exact, includes, sequence）
      # allとsamplesは独立して使用（同時使用も可能だが要注意）
      all:                            # すべてのイテレーションが通るパス（共通パスの場合のみ）
        - "ValidateItem"
        - "TransformItem"  
        - "SaveItem"
      # または
      samples:                        # 特定イテレーションのパス（個別検証）
        0: ["ValidateItem", "TransformItem", "SaveItem"]  # 最初
        4: ["ValidateItem", "HandleError", "SaveItem"]    # 最後（エラー処理経由）
```

#### 使用例1: イテレーション数の検証
```yaml
# 入力配列の長さと一致することを確認
mapExpectations:
  - state: "ProcessArray"
    iterationCount: 10    # 10個のアイテムが処理されることを検証
```

#### 使用例2: 全イテレーションの共通パス検証
```yaml
mapExpectations:
  - state: "MapState"
    iterationPaths:
      pathMatching: "sequence"  # 順序を保証
      all: ["Validate", "Process"]  # すべてがこの順序で実行
```

#### 使用例3: 個別パスの検証（エラー処理など）
```yaml
mapExpectations:
  - state: "ProcessWithErrors"
    iterationCount: 3
    iterationPaths:
      # allは指定しない（パスが統一でないため）
      samples:  # 各イテレーションを個別に検証
        0: ["Task", "Success"]      # 最初は成功
        1: ["Task", "ErrorHandler"] # 2番目はエラー
        2: ["Task", "Success"]      # 3番目は成功
```

#### 使用例4: 共通パスと特定パスの組み合わせ
```yaml
mapExpectations:
  - state: "ProcessWithValidation"
    iterationPaths:
      pathMatching: "includes"  # 部分一致で検証
      all: ["ValidateItem"]     # すべてが検証ステップを含む
      samples:
        0: ["ValidateItem", "TransformItem", "SaveItem"]  # 詳細パスも確認
```

### parallelExpectations - Parallelステート専用の検証

Parallelステートの実行フロー（ブランチ数、各ブランチの実行パス）を検証します。

#### 基本構造
```yaml
parallelExpectations:
  - state: "ParallelProcessing"      # Parallelステート名
    branchCount: 3                   # 期待するブランチ数
    branchPaths:                     # 各ブランチのパス検証
      pathMatching: "exact"           # パス比較方式
      0: ["BranchA_Task1", "BranchA_Task2"]  # ブランチ0のパス
      1: ["BranchB_Task1", "BranchB_Task2"]  # ブランチ1のパス
      2: ["BranchC_Task1", "BranchC_Task2"]  # ブランチ2のパス
```

#### 使用例1: ブランチ数の検証
```yaml
parallelExpectations:
  - state: "ParallelValidation"
    branchCount: 2    # 2つのブランチが並列実行
```

#### 使用例2: 各ブランチの実行パス検証
```yaml
parallelExpectations:
  - state: "DataProcessing"
    branchPaths:
      pathMatching: "includes"   # 部分一致
      0: ["ValidateData"]        # ブランチ0は検証を含む
      1: ["TransformData"]       # ブランチ1は変換を含む
      2: ["StoreData"]           # ブランチ2は保存を含む
```

#### 使用例3: 条件分岐があるブランチ
```yaml
parallelExpectations:
  - state: "ComplexParallel"
    branchPaths:
      pathMatching: "sequence"
      0: ["Check", "ProcessA"]    # 条件に応じたパス
      1: ["Check", "ProcessB"]    # 別の条件パス
```

### Map/Parallel検証の使い分け

| 検証項目 | stateExpectations | mapExpectations | parallelExpectations |
|---------|------------------|-----------------|---------------------|
| **個々のデータ検証** | ✅ 入出力、変数の詳細検証 | ❌ | ❌ |
| **実行フロー検証** | ❌ | ✅ イテレーション制御フロー | ✅ ブランチ制御フロー |
| **カウント検証** | ❌ | ✅ イテレーション数 | ✅ ブランチ数 |
| **パス検証** | ❌ | ✅ 各イテレーションのパス | ✅ 各ブランチのパス |

#### 組み合わせ例
```yaml
# データとフローの両方を検証
testCases:
  - name: "Map完全検証"
    input: { items: [1, 2, 3] }
    
    # データ検証（特定イテレーション）
    stateExpectations:
      - state: "ProcessMap[0]"
        input: { item: 1 }
        output: { result: 2 }
    
    # フロー検証（全体）
    mapExpectations:
      - state: "ProcessMap"
        iterationCount: 3
        iterationPaths:
          all: ["Double", "Save"]
```

### skip と only の使い方

```yaml
testCases:
  - name: "通常のテスト"
    input: { }
    
  - name: "一時的に無効化"
    skip: true              # このテストはスキップされる
    input: { }
    
  - name: "デバッグ中のテスト"
    only: true              # このテストのみ実行される
    input: { }
```

### expectedError の詳細

エラーの期待値を文字列またはオブジェクトで指定できます。

```yaml
testCases:
  # 文字列での指定（エラー型のみ）
  - name: "エラーテスト1"
    input: { invalid: true }
    expectedError: "ValidationError"
  
  # オブジェクトでの詳細指定
  - name: "エラーテスト2"
    input: { invalid: true }
    expectedError:
      type: "ValidationError"
      cause: "Invalid input format"
      message: "Validation failed"
```

## mockOverrides セクション

テストケース固有のモック設定で、ベースモックを上書きします。

### モックタイプ

#### `type: "fixed"` - 固定値
```yaml
mockOverrides:
  - state: "ProcessData"
    type: "fixed"
    response:
      result: "processed"
      status: "success"
```

#### `type: "conditional"` - 条件分岐
```yaml
mockOverrides:
  - state: "ValidateInput"
    type: "conditional"
    conditions:
      - when:
          input:
            age: 20  # 部分一致による条件
        response:
          valid: true
          category: "adult"
      - default:
          valid: false
```

#### `type: "stateful"` - ステートフル（呼び出し回数で変化）
```yaml
mockOverrides:
  - state: "RetryableTask"
    type: "stateful"
    responses:
      - { error: "Temporary failure" }  # 1回目
      - { error: "Still failing" }      # 2回目
      - { success: true, data: "OK" }   # 3回目（4回目以降はループ）
```

#### `type: "error"` - エラー発生
```yaml
mockOverrides:
  - state: "ExternalAPI"
    type: "error"
    error:
      type: "ServiceException"
      cause: "External service is down"
```


#### `type: "itemReader"` - Distributed Map用データソース
```yaml
mockOverrides:
  - state: "ProcessBatchMap"
    type: "itemReader"
    data:
      - { batchId: 1, status: "pending" }
      - { batchId: 2, status: "processing" }
```

## ファイルパスの解決ルール

モックファイルでファイルパスを指定する際の解決ルール：

1. **単純なファイル名・パス** (`items.csv`, `subdir/items.csv`)
   - `sfn-test/test-data/` ディレクトリを基準に解決
   - サブディレクトリも自動的にtest-data内を参照

2. **明示的な相対パス** (`./data/items.csv`, `../shared/data.json`)
   - `./` または `../` で始まる場合のみ
   - プロジェクトルートからの相対パスとして解決

3. **絶対パス** (`/absolute/path/to/file.csv`)
   - そのまま使用

## 完全な設定例

```yaml
version: "1.0"
name: "Comprehensive Test Suite"
description: "All configuration options example"
stateMachine: "workflow"  # sfn-test.config.yaml から名前解決
baseMock: "workflow"      # sfn-test/mocks/workflow.mock.yaml を自動解決

# 実行設定
settings:
  timeout: 10000           # 10秒のデフォルトタイムアウト
  parallel: false          # 順次実行でデバッグしやすく
  verbose: true            # 詳細ログ出力
  stopOnFailure: false     # すべてのテストを実行

# 検証設定
assertions:
  outputMatching: "partial"      # 部分一致（必要な項目のみ検証）
  pathMatching: "exact"          # パスは厳密に検証

# テストケース
testCases:
  # 基本的なテスト
  - name: "Normal flow"
    description: "Standard execution path"
    input:
      userId: "user123"
      amount: 100
    expectedOutput:
      status: "completed"
      userId: "user123"
    expectedPath:
      - "ValidateInput"
      - "ProcessPayment"
      - "SendNotification"


  # タイムアウト設定付き
  - name: "Slow process test"
    input:
      processType: "heavy"
    timeout: 20000         # このテストのみ20秒
    mockOverrides:
      - state: "HeavyProcess"
        type: "fixed"
        delay: 5000   # 5秒遅延
        response:
          result: "completed"

  # エラーケース
  - name: "Error handling"
    input:
      userId: "invalid"
    expectedError:
      type: "ValidationError"
      cause: "User not found"
    mockOverrides:
      - state: "ValidateUser"
        type: "error"
        error:
          type: "ValidationError"
          cause: "User not found"

  # デバッグ用（一時スキップ）
  - name: "Work in progress"
    skip: true             # 開発中のため一時的にスキップ
    input:
      experimental: true
```


## CLIコマンドリファレンス

### sfn-test extract

CDK/CloudFormationテンプレートからStep Functionsステートマシンを抽出します。

```bash
sfn-test extract [options]
```

#### オプション

| オプション | 説明 |
|-----------|------|
| `-c, --cdk <path>` | CDK synth出力ファイルへのパス |
| `-d, --cdk-out <dir>` | CDKアウトディレクトリのパス（例: cdk.out） |
| `--cdk-state-machine <id>` | CDKテンプレート内のステートマシンの論理ID |
| `-o, --output <dir>` | 抽出ファイルの出力ディレクトリ（デフォルト: ./.sfn-test/extracted） |
| `--name <name>` | 設定から特定のステートマシンを抽出 |

#### 使用例

```bash
# 設定ファイルを使用
sfn-test extract

# 特定のCDK出力から抽出
sfn-test extract --cdk cdk.out/MyStack.template.json

# CDKディレクトリから特定のステートマシンを抽出
sfn-test extract --cdk-out cdk.out --cdk-state-machine OrderProcessing

# カスタムディレクトリへ抽出
sfn-test extract --output ./extracted-asls
```

### sfn-test generate

AI支援でモックまたはテストファイルを生成します。

```bash
sfn-test generate <type> [options]
```

#### 引数

- `type`: `mock` または `test`

#### オプション

| オプション | 説明 | デフォルト |
|-----------|------|------------|
| `-n, --name <name>` | 設定内のステートマシン名 | - |
| `-a, --asl <path>` | ASL JSONファイルへのパス | - |
| `-c, --cdk <path>` | CDK synth出力へのパス | - |
| `--cdk-state-machine <name>` | CDKテンプレート内のステートマシンの論理ID | - |
| `-o, --output <path>` | 出力ファイルパス | 自動生成 |
| `-m, --mock <path>` | モックファイルへのパス（テスト生成用） | - |
| `--ai-model <model>` | 使用するAIモデル | claude-sonnet-4-20250522 |
| `--timeout <ms>` | AI生成タイムアウト（ミリ秒） | 60000 + 複雑度ベース |
| `--max-attempts <number>` | 検証フィードバック付き最大生成試行回数 | 2 |
| `--concurrency <number>` | 最大同時AI操作数 | 1 |
| `--verbose` | 生成中の詳細出力を有効化 | false |

#### 使用例

```bash
# 設定を使用してモック生成
sfn-test generate mock --name order-processing

# ASLファイルからモック生成
sfn-test generate mock --asl ./workflow.asl.json -o ./mock.yaml

# 再試行回数を指定してテスト生成
sfn-test generate test --name order-processing --max-attempts 3

# カスタムAIモデルで生成
sfn-test generate mock --name workflow --ai-model claude-sonnet
```

### sfn-test run

ステートマシンのテストまたはテストスイートを実行します。

```bash
sfn-test run [options]
```

#### オプション

| オプション | 説明 | デフォルト |
|-----------|------|------------|
| `-n, --name <name>` | 設定内のステートマシン名 | - |
| `-a, --asl <path>` | ASL JSONファイルへのパス | - |
| `-c, --cdk <path>` | CDK synth出力へのパス | - |
| `--cdk-state-machine <name>` | CDKテンプレート内のステートマシンの論理ID | - |
| `-m, --mock <path>` | モック設定ファイルへのパス | - |
| `-i, --input <json>` | ステートマシンへの入力JSON | - |
| `-s, --suite <path>` | テストスイートYAMLファイルへのパス | - |
| `-r, --reporter <type>` | テストレポーター（default\|json\|junit） | default |
| `-o, --output <path>` | 出力ファイルパス（json/junitレポーター用） | - |
| `--bail` | 最初の失敗で停止 | false |
| `--verbose` | 詳細出力を有効化 | false |
| `--quiet` | 最小限の出力 | false |
| `--cov [format]` | 実行後にカバレッジを表示。形式：text（フラグ使用時のデフォルト）\|json\|html。このフラグなしではカバレッジは表示されません。 | - |

#### 使用例

```bash
# すべてのテストを実行
sfn-test run

# 特定のステートマシンのテストを実行
sfn-test run --name order-processing

# カバレッジ付きで実行（テキスト形式がデフォルト）
sfn-test run --cov

# 特定の形式でカバレッジを表示
sfn-test run --cov json
sfn-test run --cov html

# JSONレポーターで特定のテストスイートを実行
sfn-test run --suite ./test-suite.yaml --reporter json -o results.json

# ASLとモックを直接指定して実行
sfn-test run --asl ./workflow.asl.json --mock ./mock.yaml --input '{"id": 123}'
```

### 環境変数

| 変数 | 説明 | デフォルト |
|------|------|------------|
| `ANTHROPIC_API_KEY` | Claude APIキー（Claude Code環境では不要） | - |
| `DEBUG_OUTPUT_PATH` | 詳細なモックマッチングログを有効化 | false |
| `AI_MODEL` | 生成用のデフォルトAIモデル | claude-sonnet-4-20250522 |
