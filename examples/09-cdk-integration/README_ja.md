# CDK統合サンプル

このサンプルは、AWS CDKプロジェクトでsfn-ai-local-testを統合し、CDK TypeScriptコードで定義されたAWS Step Functions ステートマシンをテストする方法を示します。CDK定義からローカルテストまでの完全なワークフローを、100%のステート及びブランチカバレッジで実現します。

## 概要

このサンプルでは注文処理ワークフローを通じて以下の機能を紹介します：

- **CDK統合**: AWS CDKを使用したステートマシン定義
- **JSONPath式**: 複雑なデータ変換とルーティングロジック
- **複数ステートタイプ**: Pass、Task、Choice、Map、Wait、Parallel、Succeed、Failステート
- **エラーハンドリング**: リトライポリシーとエラーキャッチング
- **条件分岐**: 注文金額ベースの割引計算
- **並列処理**: 注文処理とメール送信の同時実行
- **ローカルテスト**: 完全なテストカバレッジとモック機能

## ステートマシンアーキテクチャ

注文処理ワークフローは以下の構成です：

1. **PrepareOrder** (Pass) - タイムスタンプ付きで注文データを初期化
2. **ValidateOrder** (Task) - 注文データ検証用Lambda関数
3. **CheckOrderAmount** (Choice) - 注文合計金額による分岐
4. **CalculateDiscount** (Task) - 大口注文（5,000ドル超）の割引適用
5. **ProcessItems** (Map) - 各商品の処理（モダンなItemProcessorとItemSelectorを使用）
6. **WaitForProcessing** (Wait) - 3秒間の処理待機
7. **ParallelProcessing** (Parallel) - 以下の並列実行：
   - **ProcessOrder** (Task) - 注文処理の最終化
   - **SendOrderEmail** (Task) - 確認メール送信
8. **OrderComplete** (Succeed) - 正常完了
9. **OrderFailed** (Fail) - エラーハンドリング終点

## 前提条件

- Node.js 18+ with npm
- AWS CDK CLI (`npm install -g aws-cdk`)
- sfn-ai-local-test CLIのグローバルインストール (`npm install -g sfn-ai-local-test`)

## セットアップ

1. **依存関係のインストール:**
   ```bash
   # プロジェクト依存関係のインストール
   npm install
   
   # sfn-ai-local-testのグローバルインストール（未インストールの場合）
   npm install -g sfn-ai-local-test
   ```

2. **AWS認証情報の設定**（CDKデプロイ用、テストのみの場合はオプション）:
   ```bash
   aws configure
   ```

3. **CDKからステートマシン定義を抽出:**
   ```bash
   # CDKスタックを合成してASL JSONを抽出
   npx cdk synth
   sfn-test extract
   
   # これにより作成されます: .sfn-test/extracted/order-processing-workflow.asl.json
   ```

4. **ローカルテストの実行:**
   ```bash
   # 完全なテストスイートをカバレッジ付きで実行
   sfn-test run
   
   # 期待される出力:
   # ✅ 5/5 テスト成功 (100.0% 成功率)
   # 📊 カバレッジ: 100.0% ステート、100.0% ブランチ
   ```

## プロジェクト構造

```
├── bin/
│   └── app.ts                           # CDKアプリのエントリポイント
├── lib/
│   └── order-processing-stack.ts        # 注文処理ステートマシンスタック
├── sfn-test/
│   ├── mocks/
│   │   └── order-processing-workflow.mock.yaml  # Lambda関数モック
│   ├── test-suites/
│   │   └── order-processing-workflow.test.yaml  # 100%カバレッジのテストケース
│   └── test-data/                       # テストデータ（オプション）
├── .sfn-test/
│   ├── coverage/                        # カバレッジレポート（自動生成）
│   └── extracted/
│       └── order-processing-workflow.asl.json  # 抽出されたステートマシン
├── cdk.out/                            # CDK合成結果（自動生成）
│   └── OrderProcessingStack.template.json
├── sfn-test.config.yaml                # sfn-test設定ファイル
├── cdk.json                            # CDK設定
├── package.json                        # Node.js依存関係
└── tsconfig.json                       # TypeScript設定
```

## テストケースとカバレッジ

このサンプルには**100%のステート及びブランチカバレッジ**を達成する包括的なテストケースが含まれています：

### テストケース1：標準注文（割引なし）
- 注文合計：$5000
- パス：PrepareOrder → ValidateOrder → CheckOrderAmount → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- テスト対象：Map反復（2アイテム）、Parallel分岐、通常フロー

### テストケース2：大口注文（割引あり）  
- 注文合計：$6000
- パス：PrepareOrder → ValidateOrder → CheckOrderAmount → **CalculateDiscount** → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- テスト対象：割引計算分岐、高額注文処理

### テストケース3：完全フロー（Waitとパラレル）
- 注文合計：$3000
- パス：PrepareOrder → ValidateOrder → CheckOrderAmount → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- テスト対象：完全な処理フロー、Wait状態、並列実行

### テストケース4：高額注文の完全フロー
- 注文合計：$6000
- パス：PrepareOrder → ValidateOrder → CheckOrderAmount → CalculateDiscount → ProcessItems → WaitForProcessing → ParallelProcessing → OrderComplete
- テスト対象：割引適用を含む完全フロー

### テストケース5：検証失敗
- 不正な注文（空のアイテム）
- パス：PrepareOrder → ValidateOrder → **OrderFailed**
- テスト対象：エラーハンドリング、Catchブロック実行

## モック設定

モック設定（`sfn-test/mocks/order-processing-workflow.mock.yaml`）は以下を実証しています：

- **条件付きモック**: 注文IDに基づく異なるレスポンス
- **Lambda統合**: Lambda invoke パターンの適切なPayloadラッピング
- **エラーシミュレーション**: 検証失敗シナリオ
- **リアルなデータ**: 実際のアイテム計算を伴う注文処理

## 主要機能の実演

### 1. CDK TypeScript統合
- `lib/order-processing-stack.ts`で定義されたステートマシン
- AWS CDKコンストラクトを使用した完全なTypeScriptタイピング
- 適切なLambda関数ARN参照
- モダンなASL構文（Iterator/Parametersの代わりにItemProcessor/ItemSelectorを使用）

**CDK Map State例（モダン構文）:**
```typescript
const processItems = new sfn.Map(this, 'ProcessItems', {
  itemsPath: '$.items',
  maxConcurrency: 5,
  resultPath: '$.processedItems',
  // データ変換のためのモダンなItemSelector
  itemSelector: {
    'itemId.$': '$.itemId',
    'quantity.$': '$.quantity',
    'price.$': '$.price',
    'status': 'processed',
  },
}).itemProcessor(
  // シンプルなPassステートを持つItemProcessor
  new sfn.Pass(this, 'ProcessItem')
);
```

**生成されたASL（モダン構文）:**
```json
"ProcessItems": {
  "Type": "Map",
  "ItemsPath": "$.items",
  "ItemSelector": {
    "itemId.$": "$.itemId",
    "quantity.$": "$.quantity",
    "price.$": "$.price",
    "status": "processed"
  },
  "ItemProcessor": {
    "ProcessorConfig": { "Mode": "INLINE" },
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Pass",
        "End": true
      }
    }
  },
  "MaxConcurrency": 5,
  "ResultPath": "$.processedItems"
}
```

### 2. 高度なJSONPath使用
- コンテキストフィールドアクセス（`$$.State.EnteredTime`）
- 複雑なパラメータマッピングと結果パス
- ItemSelectorによるデータ変換

### 3. プロフェッショナルなテストカバレッジ
- **100%ステートカバレッジ**: すべてのステートが最低一度実行
- **100%ブランチカバレッジ**: すべてのChoice条件とエラーパスをテスト
- **Map検証**: 反復回数とパス追跡（ItemProcessor/Iterator両方サポート）
- **Parallel検証**: ブランチ数と同時実行パス
- **ネストカバレッジ**: Map ItemProcessorとParallelブランチ内のステートの完全追跡

## 使用方法

### 1. CDK統合によるステートマシン自動抽出

sfn-ai-local-testは、CDKテンプレートから直接ステートマシン定義を自動抽出します：

```bash
# CDK設定でtype: cdkを指定すると、初回実行時に自動的にASLを抽出
# キャッシュ機能により、2回目以降は高速実行
```

**自動抽出の仕組み:**
- 初回実行時：CloudFormationテンプレートからASL定義を抽出して`.sfn-test/extracted/`に保存
- 2回目以降：CDKテンプレートのタイムスタンプを監視してキャッシュ利用
- CDKファイルが更新された場合：自動的に再抽出して更新

### 2. モックとテストファイルの生成（オプション）

スクラッチから始める場合は、自動生成を使用：

```bash
# モック設定を生成
sfn-test generate mock --name order-processing-workflow

# テストケースを生成
sfn-test generate test --name order-processing-workflow
```

### 3. テスト実行とカバレッジ表示

```bash
# 設定されたすべてのテストを実行
sfn-test run

# 詳細出力付きで実行
sfn-test run --verbose

# カバレッジ付きでテスト実行
sfn-test run --cov
```

### 4. 開発ワークフロー

```bash
# 1. lib/でCDKコードを修正
vim lib/order-processing-stack.ts

# 2. CDKを再合成
npx cdk synth

# 3. 必要に応じてテストを更新
vim sfn-test/test-suites/order-processing-workflow.test.yaml

# 4. 変更を検証
sfn-test run

# 5. AWSにデプロイ（オプション）
npx cdk deploy
```

## 設定のハイライト

### sfn-test.config.yaml
```yaml
version: '1.0'

# ステートマシン定義
stateMachines:
  - name: order-processing-workflow
    source:
      type: cdk
      path: ./cdk.out/OrderProcessingStack.template.json
      stateMachineName: OrderProcessingStateMachineD268D63F
```

### 主要設定機能
- **名前ベース参照**: ファイルパスの代わりに論理名を使用
- **自動パス解決**: 相対パスと絶対パスの両方をサポート
- **モック自動検出**: テスト生成時にモックファイルを自動発見
- **カバレッジ追跡**: `.sfn-test/coverage/`での一元的なカバレッジレポート

## 実証されたベストプラクティス

### 1. CDK統合
- ✅ 型安全なステートマシン定義
- ✅ ARN解決を伴う適切なLambda関数統合
- ✅ CI/CDパイプライン用の標準化された抽出スクリプト
- ✅ インフラとテストコードの明確な分離

### 2. テスト設計  
- ✅ エラーシナリオを含む包括的なパスカバレッジ
- ✅ 本番ユースケースを模倣したリアルなテストデータ
- ✅ 実際のLambda invokeパターンにマッチするモック条件
- ✅ 複雑なステート動作の検証（Map、Parallel、Choice）

### 3. モックエンジニアリング
- ✅ 入力バリエーションに基づく条件付きレスポンス
- ✅ ネガティブテストケース用の適切なエラーシミュレーション
- ✅ Lambda Payloadラッピングの正しい処理
- ✅ 信頼性の高いテスト実行のためのステートレスモック設計

### 4. 品質保証
- ✅ すべてのコードパスがテストされる100%ステートカバレッジ
- ✅ すべての条件ロジックを含む100%ブランチカバレッジ
- ✅ 堅牢な実装のためのテスト駆動開発アプローチ
- ✅ 自動化されたカバレッジレポートと検証

## このアプローチの利点

### 開発効率
- **🚀 高速ローカルテスト**: AWSデプロイなしでの即座のフィードバック
- **💰 コスト最適化**: 開発中のAWS実行コストゼロ
- **🔍 豊富なデバッグ**: 詳細な実行ログとステート遷移追跡
- **⚡ TDDワークフロー**: 即座の検証を伴うテスト駆動開発

### 品質保証  
- **📊 完全なカバレッジ**: ステートとブランチカバレッジの自動測定
- **🎯 自動テスト生成**: 包括的なテストケースとモック作成
- **🔄 リグレッション防止**: ステートマシン動作の継続的検証
- **📈 カバレッジメトリクス**: 定量的な品質評価

### CI/CD統合
- **🏗️ パイプライン対応**: ビルドとデプロイワークフローへの簡単統合
- **📋 標準化されたテスト**: CDKプロジェクト全体での一貫したテストパターン
- **🔐 デプロイ前検証**: AWSデプロイ前の問題検出
- **📝 自動レポート**: コードレビュープロセス用のカバレッジレポート

## 次のステップ

1. **テストケースの拡張**: より複雑なシナリオとエッジケースの追加
2. **統合テスト**: 実際のLambda関数テストとの組み合わせ
3. **パフォーマンステスト**: 実行時間とリソース使用量の検証
4. **本番デプロイ**: ローカル検証後の`npx cdk deploy`使用
5. **監視設定**: 本番ワークフロー用のAWS CloudWatch設定

## トラブルシューティング

### よくある問題

**CDK Synthの失敗**
```bash
# AWS認証情報をチェック
aws sts get-caller-identity

# CDKブートストラップを確認
npx cdk bootstrap
```

**テンプレート解析エラー**  
```bash
# CloudFormationテンプレートが正しく生成されているか確認
ls -la cdk.out/*.template.json

# CDKを再度合成
npx cdk synth
```

**テスト失敗**
```bash
# 詳細ログ付きで実行
sfn-test run --verbose

# モック条件が実際の入力とマッチするかチェック
cat .sfn-test/coverage/execution-*.json
```

**カバレッジ問題**
```bash
# カバレッジ付きでテストを実行して詳細を確認
sfn-test run --cov

# 不足しているブランチをカバーするためテストケースを更新
vim sfn-test/test-suites/order-processing-workflow.test.yaml
```
