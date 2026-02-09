# トラブルシューティングガイド

## 概要

sfn-ai-local-testを使用する際によく発生する問題と解決方法をまとめています。

## よくある問題と解決方法

### モック関連

#### Q: モック条件がマッチしない

**症状:** モックが期待通りに動作せず、デフォルトレスポンスやエラーが返される。

**原因と解決方法:**

1. **Lambda統合でPayloadラッパーを忘れている**
   ```yaml
   # ❌ 間違い
   when:
     orderId: "123"
   
   # ✅ 正しい（Lambda統合の場合）
   when:
     Payload:
       orderId: "123"
   ```

2. **条件の構造が入力と一致していない**
   ```bash
   # 実際の入力を確認
   sfn-test run --verbose | grep "State input:"
   ```

3. **部分マッチを理解していない**
   ```yaml
   # 条件は入力のサブセットでOK
   when:
     Payload:
       orderId: "123"  # 他のフィールドは無視される
   ```

#### Q: ステートフルモックが期待通りに動作しない

**症状:** ステートフルモックの応答順序が期待と異なる。

**解決方法:**
- 各テストケースごとに新しいMockEngineインスタンスが作成されるため、ステートフルモックのカウンターは各テストケースの開始時に0にリセットされます
- 同一テストケース内では、呼び出しごとにカウンターが進みます
- Map内での使用時は、各イテレーションでカウンターが進みます

```yaml
# Map内で使用する場合の例
- state: "ProcessItem"  # Map内のステート名のみ（親のMap名は不要）
  type: "stateful"
  responses:
    - Payload: { status: "processing" }  # 1個目のアイテム
    - Payload: { status: "completed" }   # 2個目のアイテム
    - Payload: { status: "completed" }   # 3個目以降
```

### ResultSelector関連

#### Q: ResultSelectorが動作しない

**症状:** ResultSelectorで指定したフィールドが出力に含まれない。

**原因と解決方法:**

1. **フィールド名に`.$`サフィックスを忘れている**
   ```json
   // ❌ 間違い
   "ResultSelector": {
     "data": "$.Payload.result"
   }
   
   // ✅ 正しい
   "ResultSelector": {
     "data.$": "$.Payload.result"
   }
   ```

2. **参照パスが間違っている**
   ```json
   // ResultSelectorの$はタスクの結果を指す
   "ResultSelector": {
     "data.$": "$.Payload.data",  // Payload.dataを抽出
     "status.$": "$.StatusCode"   // StatusCodeを抽出
   }
   ```

### Lambda統合パターン

#### Q: Lambda呼び出しの結果形式が予期しない

**症状:** Lambda関数の戻り値が期待と異なる形式で返される。

**解決方法:**

統合パターンを確認してください：

```json
// 最適化された統合（Payloadラッパーあり）
"Resource": "arn:aws:states:::lambda:invoke"
// レスポンス: { "Payload": {...}, "StatusCode": 200, ... }

// 直接ARN指定（Payloadラッパーなし）
"Resource": "arn:aws:lambda:us-east-1:123456789012:function:MyFunction"
// レスポンス: {...}  // 直接返される
```

### Map/Parallel実行

#### Q: Map内のステートがモックされない

**症状:** Mapステート内の子ステートのモックが効かない。

**解決方法:**

Map内のステートは、**親のMap名を付けずに**ステート名のみで指定します：

```yaml
# ✅ 正しい: ステート名のみ
- state: "ValidateItem"
  type: "fixed"
  response:
    Payload: { valid: true }

# ❌ 間違い: 親のMap名を含む
# - state: "ProcessItems.ValidateItem"
```

**理由:** Map内のステートは独立したステートマシンとして実行されるため、親のMap名による修飾は不要です。

#### Q: Parallelブランチの実行順序が予測できない

**症状:** Parallelステートのブランチが期待する順序で実行されない。

**解決方法:**

Parallelブランチは同時実行されるため、順序は保証されません。順序に依存しないテストを書きましょう：

```yaml
parallelExpectations:
  - state: "ParallelProcessing"
    branchCount: 2
    branchPaths:
      0: ["ProcessA"]  # ブランチ0のパス
      1: ["ProcessB"]  # ブランチ1のパス
    # 順序は問わない
```

### Choice条件

#### Q: Choice条件が期待通りに評価されない

**症状:** Choiceステートが予期しないブランチを選択する。

**デバッグ方法:**

```bash
# 詳細ログで条件評価を確認
sfn-test run --verbose | grep "Choice evaluation:"
```

**一般的な問題:**

1. **数値比較での型の不一致**
   ```json
   // 文字列として比較されている可能性
   {
     "Variable": "$.amount",
     "NumericGreaterThan": 100  // $.amountが数値であることを確認
   }
   ```

2. **境界値の扱い**
   ```json
   // GreaterThanとGreaterThanEqualsの違いに注意
   {
     "Variable": "$.value",
     "NumericGreaterThanEquals": 100  // 100を含む
   }
   ```

### 変数とスコープ

#### Q: 変数が参照できない

**症状:** 変数参照が`undefined`や`null`になる。

**原因と解決方法:**

1. **変数のスコープを確認**
   - Parallel/Map内で定義した変数は外部から参照不可
   - 外部の変数は内部から参照可能（Distributed Map除く）

2. **変数名の確認**
   ```json
   // Assignで定義
   "Assign": {
     "myVar.$": "$.result"
   }
   
   // 参照時
   "Parameters": {
     "value.$": "$myVar"  // $プレフィックスが必要
   }
   ```

### CDK統合

#### Q: CDKからステートマシンが抽出されない

**症状:** `sfn-test extract`が失敗またはステートマシンを見つけられない。

**解決方法:**

1. **CDK synthを実行**
   ```bash
   npx cdk synth
   ```

2. **正しいテンプレートパスを指定**
   ```yaml
   # sfn-test.config.yaml
   stateMachines:
     - name: my-workflow
       source:
         type: cdk
         path: ./cdk.out/MyStack.template.json  # 正しいスタック名
         stateMachineName: MyStateMachine123ABC  # 論理ID
   ```

3. **CloudFormationテンプレートを確認**
   ```bash
   # ステートマシンリソースを検索
   grep -r "AWS::StepFunctions::StateMachine" cdk.out/
   ```

### テスト実行

#### Q: テストがタイムアウトする

**症状:** テストが完了せずにタイムアウトエラーになる。

**解決方法:**

1. **タイムアウト値を増やす**
   ```yaml
   settings:
     timeout: 60000  # 60秒に増やす
   ```

2. **Waitステートの時間を短縮（テスト用）**
   ```yaml
   mockOverrides:
     - state: "WaitForApproval"
       type: "wait"
       seconds: 0  # テストでは待機をスキップ
   ```

#### Q: カバレッジが正しく計算されない

**症状:** 実行したはずのステートがカバレッジに含まれない。

**確認事項:**

1. **ネストしたステートの確認**
   ```bash
   # カバレッジ詳細を確認
   cat .sfn-test/coverage/coverage-*.json | jq .nestedStates
   ```

2. **条件分岐の確認**
   - すべてのChoiceブランチをテストしているか
   - デフォルトブランチも含まれているか

### パフォーマンス

#### Q: テスト実行が遅い

**最適化方法:**

1. **並列実行を有効化**
   ```yaml
   settings:
     parallel: true
     maxWorkers: 4
   ```

2. **不要なWaitステートをスキップ**
   ```yaml
   # テスト環境では待機時間を0に
   mockOverrides:
     - state: ".*Wait.*"
       type: "wait"
       seconds: 0
   ```

3. **大規模データは外部ファイル化**
   ```yaml
   # インラインではなくファイル参照
   - state: "GetLargeData"
     type: "file"
     path: "./test-data/large.json"
   ```

### AI生成関連

#### Q: AI生成がタイムアウトする

**症状:** モックやテストケースの生成がタイムアウトエラーになる。

**解決方法:**

1. **自動タイムアウト調整を活用**
   ```bash
   # ツールが自動的に複雑度に応じたタイムアウトを設定
   sfn-test generate mock --name my-workflow
   ```

2. **手動でタイムアウトを延長**
   ```bash
   # 10分（600秒）に設定
   sfn-test generate mock --name my-workflow --timeout 600000
   ```

3. **再試行回数を増やす**
   ```bash
   # 最大3回まで再試行（デフォルトは2回）
   sfn-test generate mock --name my-workflow --max-attempts 3
   ```

#### Q: AI生成の品質が低い

**症状:** 生成されたモックやテストが不完全または不正確。

**解決方法:**

1. **再試行機能（GenerationRetryManager）を活用**
   - 自動的に検証と再生成が行われます
   - 段階的なフィードバックで品質が向上

2. **手動修正後の再生成**
   ```bash
   # 一部手動修正後、残りを再生成
   sfn-test generate test --name my-workflow --mock ./sfn-test/mocks/my-workflow.mock.yaml
   ```

3. **Claude Code環境の利用**
   - Claude Code環境では認証が自動化され、より安定した生成が可能

#### Q: Lambda統合のモック生成で問題が発生

**症状:** Lambda統合のモックでPayload構造が正しくない。

**原因:** Lambda統合パターンによってPayloadラッパーの有無が異なる。

**解決方法:**

最適化された統合（`arn:aws:states:::lambda:invoke`）の場合：
```yaml
# 自動生成で正しく処理されるはずだが、手動修正が必要な場合：
- state: "InvokeLambda"
  type: "conditional"
  conditions:
    - when:
        input:
          Payload:  # 必須：Payloadラッパー
            userId: "123"
      response:
        Payload:     # 必須：Payloadラッパー
          result: "success"
        StatusCode: 200
        ExecutedVersion: "$LATEST"
```

## デバッグ手法

### 詳細ログの活用

```bash
# 最大詳細度でログ出力
sfn-test run --verbose

# 特定のステートのみログ出力
sfn-test run --verbose | grep "StateName"
```

### 実行トレースの確認

```bash
# 最新の実行結果を確認
ls -lt .sfn-test/coverage/execution-*.json | head -1

# 実行パスを確認
cat .sfn-test/coverage/execution-*.json | jq .executionPath
```

### モックマッチングの確認

```bash
# モック評価ログを確認
sfn-test run --verbose 2>&1 | grep -A 5 "Mock evaluation"
```

### AI生成がタイムアウトする

**症状:** モック/テスト生成時に「Claude CLI timed out」エラーが発生する。

**原因:** 複雑なステートマシンの解析に時間がかかっている。

**解決方法:**

```bash
# デフォルト: 180秒（3分）
sfn-test generate mock --asl ./state-machine.json

# タイムアウトを10分に延長
sfn-test generate mock --asl ./state-machine.json --timeout 600000

# 複雑なステートマシンの場合は15分に
sfn-test generate test --asl ./state-machine.json --timeout 900000
```

**その他の対処法:**
1. ステートマシンを簡略化して部分的に生成
2. Claude CLIを使用（環境により高速な場合がある）
3. ネットワーク接続を確認

## エラーメッセージ一覧

### `Mock not found for state: XXX`
指定されたステートのモックが定義されていません。モック設定を確認してください。

### `Invalid JSONPath expression: XXX`
JSONPath式が不正です。`$.`で始まることを確認してください。

### `State machine definition not found`
ASLファイルが見つからないか、CDKからの抽出に失敗しています。

### `Circular reference detected in state: XXX`
ステートマシンに循環参照があります。Next指定を確認してください。

### `Maximum iterations exceeded in Map state`
Mapステートの反復回数が上限を超えました。入力データを確認してください。

## 高度な機能

### 自動ファイル名類推

#### stateMachineフィールドの自動類推

テストスイートファイル名が特定のパターンに従う場合、`stateMachine`フィールドを省略可能：

**類推パターン**: `{state-machine-name}.test.yaml` または `{state-machine-name}.test.yml`

**例**:
- `payment-workflow.test.yaml` → `payment-workflow`
- `order-processor.test.yml` → `order-processor`

#### baseMockフィールドの解決

```yaml
# 名前による参照
baseMock: "payment-workflow"
# → sfn-test/mocks/payment-workflow.mock.yaml

# 相対パスによる参照  
baseMock: "./custom/mocks/special.mock.yaml"
```

### パス解決ルール

#### responseFileの解決

```yaml
mocks:
  - state: "TaskA"
    type: "fixed"
    responseFile: "response.json"  # → test-data/response.json
    
  - state: "ProcessOrder"
    type: "fixed"
    responseFile: "ProcessOrder.json"  # → test-data/ProcessOrder.json
```

#### パス解決の優先順位

1. **絶対パス**: そのまま使用
2. **相対パス** (`./`や`../`で始まる): プロジェクトルートからの相対パス
3. **単純なファイル名**: `test-data`ディレクトリ内を検索

## 環境変数

### ANTHROPIC_API_KEY
Claude APIキー（AI機能使用時に必須）
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### AI_MODEL
生成用のデフォルトAIモデル（オプション）
```bash
export AI_MODEL="claude-sonnet-4-5-20250929"  # デフォルト値
```

### 設定ファイルのパス指定
CLIの`--config`オプションで設定ファイルのパスを指定可能（デフォルト: `./sfn-test.config.yaml`）
```bash
sfn-test run --config ./custom-config.yaml
```

### DEBUG_OUTPUT_PATH
モックエンジンの内部デバッグログを有効化
```bash
export DEBUG_OUTPUT_PATH=true
```

モックマッチングの詳細（どのモックが見つかったか、入力データ、条件評価結果など）をコンソールに出力します。`--verbose`オプションとは別の、より低レベルなデバッグ情報です。

## 既知の制限事項

### サポートされていない機能
- `.waitForTaskToken` パターン（タスクトークンによるコールバック待機）
- `.sync` パターン（同期的なサービス統合）

### 制限事項
- メモリ制限: Node.jsのヒープサイズに依存
- 並列度: CPUコア数に依存
