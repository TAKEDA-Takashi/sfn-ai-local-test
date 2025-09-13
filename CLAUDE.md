# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🚨 作業開始前の必須確認事項

**重要**: 作業を開始する前に、必ず以下を実行してください：

1. **メモリの確認**:
   ```
   mcp__serena__list_memories でメモリ一覧を確認
   mcp__serena__read_memory で関連メモリを読む
   ```

2. **特に重要なメモリ**:
   - `MUST_CHECK_BEFORE_WORK` - 作業前の必須確認事項
   - `zod-schema-and-embedded-types-sync` - スキーマ変更時の同期ルール
   - `task_completion_checklist` - 作業完了時のチェックリスト

3. **スキーマ変更時の必須同期**:
   - Zodスキーマ（test-schema.ts、mock-schema.ts、config-schema.ts）を変更したら
   - **必ず** `src/ai/agents/embedded-types.ts` も更新する
   - これを忘れるとAI生成機能が壊れる

## プロジェクト概要

**sfn-ai-local-test** - AWS Step Functions用のAI駆動型ローカルテストツール

ステートマシンのローカルテストとカバレッジ計測を実現するCLIツールです。Claude APIまたはClaude Code環境でのAI支援により、モックとテストケースの自動生成が可能です。

### 主要機能
- ASL JSONからステートマシンを実行・テスト
- CDKコードからステートマシン定義を抽出
- YAMLベースのモック設定（固定値、条件分岐、ステートフル）
- カバレッジ計測とレポート生成
- AI支援によるモック/テストケース自動生成
- JSONPath/JSONata両方のクエリ言語サポート

## 技術スタック

- **言語**: TypeScript
- **ビルド**: tsup（単一ファイルバンドル）
- **テスト**: Vitest
- **Linter/Formatter**: Biome
- **CLI Framework**: Commander.js
- **AI**: Anthropic SDK / Claude CLI
- **パッケージマネージャ**: npm

## 開発環境のセットアップ

```bash
# 依存関係のインストール
npm install

# 開発モードで実行
npm run dev

# CLIをグローバルにリンク（開発時）
npm link
```

## よく使うコマンド

### ビルド・テスト
```bash
# TypeScriptの型チェック（ビルドなし）
npm run typecheck

# ビルド（本番用）
npm run build

# テスト実行
npm test
npm test -- --coverage  # カバレッジ付き

# 開発モードでテスト
npm run test:watch
```

### 品質チェック（コミット前に必須）
```bash
# Biomeによるlint
npm run lint

# Biomeによる自動修正
npm run lint:fix

# フォーマット
npm run format

# すべての品質チェック
npm run check
```

### 🚨 作業完了前の必須チェックリスト
```bash
# これらのコマンドをすべて実行してエラーがないことを確認してから「完了」と報告すること

# 1. TypeScript型チェック（必須）
npm run typecheck

# 2. Lintチェック（必須）
npm run lint

# 3. テスト実行（必須）
npm test -- --run

# すべてOKの場合のみ「作業完了」と報告
```

### CLIコマンド
```bash
# プロジェクト初期化
sfn-test init

# CDKからASL抽出
sfn-test extract                                # 設定ファイルから全て抽出
sfn-test extract --cdk <path>                   # CDK synth出力から抽出
sfn-test extract --cdk-out <dir>                # CDKアウトディレクトリから抽出
sfn-test extract --name <name>                  # 特定のステートマシンを抽出

# モック生成（AI支援）
sfn-test generate mock --name <state-machine-name>
sfn-test generate mock --asl ./state-machine.json -o ./mock.yaml

# 再試行回数指定でモック生成
sfn-test generate mock --asl ./state-machine.json --max-attempts 3

# テストケース生成（AI支援）
sfn-test generate test --name <state-machine-name>
sfn-test generate test --asl ./state-machine.json --mock ./mock.yaml -o ./test.yaml

# 再試行回数指定でテスト生成
sfn-test generate test --asl ./state-machine.json --mock ./mock.yaml --max-attempts 3

# テスト実行
sfn-test run                                    # 全テスト実行（設定ファイル使用）
sfn-test run --name <state-machine-name>        # 特定のステートマシン
sfn-test run --suite ./test-suite.yaml          # テストスイート指定
sfn-test run --asl ./asl.json --mock ./mock.yaml  # ファイル直接指定

# カバレッジ付きテスト実行
sfn-test run --cov
sfn-test run --cov json  # JSON形式で出力
```

## プロジェクト構造

```
src/
├── cli/                    # CLIコマンド実装
│   ├── index.ts           # CLIエントリポイント
│   └── commands/          # 各コマンド実装
├── core/                   # コア機能
│   ├── interpreter/        # ASLインタープリタ
│   │   ├── states/        # 各ステート実装
│   │   ├── expressions/   # JSONPath/JSONata評価
│   │   └── executor.ts    # 実行エンジン
│   ├── coverage/          # カバレッジ計算
│   ├── mock/              # モックエンジン
│   └── parser/            # ASL/CDK解析
├── ai/                     # AI連携
│   ├── agents/            # AIエージェント実装
│   ├── generation/        # プロンプト生成・再試行管理
│   ├── validation/        # AI生成内容の検証
│   └── analysis/          # ステートマシン分析
├── config/                 # 設定管理
├── types/                  # 型定義
└── utils/                  # 汎用ユーティリティ
```

## モック設定ファイル仕様

```yaml
version: "1.0"
mocks:
  # 固定値モック
  - state: "GetUserData"
    type: "fixed"
    response:
      userId: "12345"
      name: "Test User"
  
  # 条件分岐モック
  - state: "CheckBalance"
    type: "conditional"
    conditions:
      - when: 
          input:  # inputフィールドが必須
            userId: "12345"
        response:
          balance: 1000
      - default:
          balance: 0
  
  # ステートフルモック（呼び出し回数で変化）
  - state: "RetryableTask"
    type: "stateful"
    responses:
      - { success: false, error: "Temporary failure" }
      - { success: true, data: "Processed" }
  
  # Choiceステートのモック（ASL準拠のNext field）
  - state: "DecisionPoint"
    type: "fixed"
    response:
      Next: "ForcedPath"  # Choice評価を上書き
```

## 開発ガイドライン

### 🚨 新機能実装前の必須確認事項

**重要**: 新しいユーティリティ関数、型ガード、バリデーター等を実装する前に、必ず以下を確認すること。これを怠ると重複実装やDRY原則違反につながる。

#### 1. 既存実装の検索（必須）
```bash
# 型ガードの検索
grep -r "export function is" src/types/
grep -r "type.*guard" src/

# バリデーターの検索  
find . -name "*validator*" -o -name "*validation*"

# ユーティリティの確認
ls -la src/utils/
ls -la src/types/
```

#### 2. 主要な既存ユーティリティ（必ず確認）
- **型ガード**: `/src/types/type-guards.ts`
  - `isJsonValue`, `isJsonObject`, `isJsonArray` - JSON型のガードのみ
  - **State型のガードは作らない** - StateClassのメソッドを使う
- **StateClassのメソッド**: 全てのStateインスタンスで利用可能
  - `state.isTask()`, `state.isMap()`, `state.isParallel()` など
  - `state.isJSONataState()`, `state.isDistributedMap()`
- **ASL型定義**: `/src/types/asl.ts`
- **ステートファクトリー**: `/src/types/state-factory.ts`
- **ステートクラス**: `/src/types/state-classes.ts`

#### 3. DRY原則の徹底
- **新規作成より既存活用を優先**
- **類似機能がある場合は拡張を検討**
- **重複実装は絶対に避ける**

### TDD（テスト駆動開発）の徹底

すべての実装変更は必ずTDDで行うこと：

1. **RED**: まずテストを書いて失敗を確認
2. **GREEN**: 最小限のコードでテストを通す
3. **REFACTOR**: コードを改善（テストは通ったまま）

### コーディング規約
- Biomeの設定に従う（自動フォーマット）
- 関数は単一責任の原則に従う
- エラーハンドリングは明示的に行う
- 型定義を必ず行う（any禁止）

### コミット規約
```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: コードスタイル修正
refactor: リファクタリング
test: テスト追加・修正
chore: ビルド・設定変更
```

## Step Functions 実装の重要な知見

### ExecutionContext と組み込み関数の固定値化

テスト実行時、決定論的テストのため以下の固定値を使用します：

#### ExecutionContext変数

| コンテキスト変数 | 固定値 |
|-----------------|--------|
| `$$.Execution.Id` | `arn:aws:states:us-east-1:123456789012:execution:StateMachine:test-execution` |
| `$$.Execution.Name` | `test-execution` |
| `$$.Execution.StartTime` | `2024-01-01T00:00:00.000Z` |
| `$$.Execution.RoleArn` | `arn:aws:iam::123456789012:role/StepFunctionsRole` |
| `$$.State.EnteredTime` | `2024-01-01T00:00:00.000Z` |

#### 組み込み関数

| 関数 | 固定値 |
|------|--------|
| `States.UUID()` | `test-uuid-00000000-0000-4000-8000-000000000001` |
| `$uuid()` (JSONata) | `test-uuid-00000000-0000-4000-8000-000000000001` |
| `$now()` (JSONata) | `2024-01-01T00:00:00.000Z` |
| `$millis()` (JSONata) | `1704067200000` |

これにより：
- テストの再現性が保証される
- 時刻ベースのロジックをテスト可能
- CI/CDで安定したテスト実行
- UUID生成が予測可能

設定ファイルでExecutionContext値を上書き可能です。詳細は[configuration-reference.md](./docs/configuration-reference.md#executioncontext-セクション)を参照。

### JSONPath vs JSONata モードの違い

#### JSONPathモード（デフォルト）
- **処理順序**: InputPath → Parameters → ResultSelector → ResultPath → OutputPath
- **変数参照**: `$.fieldName` 形式
- **組み込み関数**: `States.Array`, `States.Format` など全てサポート

#### JSONataモード（QueryLanguage: "JSONata"）
- **処理順序**: Arguments → (Task実行) → Assign/Output（並列処理）
- **変数参照**: `$states.input`, `$states.result`, `$states.context`
- **組み込み関数**: 使用不可（JSONata関数を使用）

### Lambda統合パターンの違い

#### 最適化された統合
```json
"Resource": "arn:aws:states:::lambda:invoke"
```
- 結果は`Payload`フィールドに包まれる
- ResultSelectorで`$.Payload`でアクセス

#### 直接ARN指定
```json
"Resource": "arn:aws:lambda:region:account-id:function:name"
```
- 結果は直接返される（Payloadラッピングなし）

### モックエンジンの動作

1. **条件マッチング**: 部分一致（partial deep equal）で評価
2. **Lambda統合**: Payloadラッパーを含める必要あり
3. **Choice状態**: ASL準拠の`Next`フィールドで次の状態を指定
4. **Map/Parallel**: 子ステートは親の名前なしで指定

## AIアーキテクチャ

### 主要コンポーネント

#### PromptBuilder
ステートマシンの複雑度を分析し、最適なプロンプトを生成します。
- ステート階層の分析（StateHierarchyAnalyzerを利用）
- Lambda/Map/Choiceステートの特別な処理
- データフローとエラーハンドリングの検出

#### GenerationRetryManager
AI生成の再試行と検証を管理します。
- 段階的フィードバック機能
- 自動検証と修正提案
- タイムアウト自動調整（TimeoutCalculatorを利用）

#### StateMachineValidator
生成されたモックやテストの妥当性を検証します。
- ステートの存在確認
- LambdaステートのPayload構造検証
- Map/DistributedMapの配列返却確認

#### DataFlowMockGenerator
データフローを分析して適切なモックを生成します。
- 入出力パスの追跡
- 条件分岐の分析
- エラーパスの検出

## トラブルシューティング

### AI生成の詳細設定

#### タイムアウトの自動調整
ツールは自動でステートマシンの複雑度を分析し、適切なタイムアウトを設定します。

**タイムアウト算出ロジック**:
```
基本時間: 60秒 + (状態数 × 2秒)
複雑度係数:
  - Map状態: × 1.5 (最大3個まで累乗)
  - DistributedMap状態: × 2.0 (最大2個まで累乗)  
  - Parallel状態: × 1.3 (最大3個まで累乗)
  - JSONata使用: × 1.3
  - Variables使用: × 1.2
  - 深いネスト(4層以上): × 1.5
上限: 10分
```

#### 再試行機能（GenerationRetryManager）
AIが生成した内容は自動で検証され、問題がある場合は段階的フィードバックで再生成されます。

```bash
# デフォルト: 2回まで試行
sfn-test generate mock --asl ./state-machine.json

# 最大試行回数を変更
sfn-test generate mock --asl ./state-machine.json --max-attempts 3

# 手動タイムアウト指定（自動算出を無効化）
sfn-test generate mock --asl ./state-machine.json --timeout 600000
```

**段階的フィードバック**:
- 1回目失敗: 友好的で簡潔な修正提案
- 2回目失敗: より詳細で強調された修正提案  
- 3回目以降: 厳重モードで全エラーを詳細表示

### デバッグ
```bash
# 詳細ログ
sfn-test run --verbose

# モックエンジンの内部デバッグ
export DEBUG_OUTPUT_PATH=true
sfn-test run
```

## 環境変数

- `ANTHROPIC_API_KEY`: Claude API キー（Claude Code環境では不要）
- `DEBUG_OUTPUT_PATH`: モックマッチングの詳細ログ出力
- `AI_MODEL`: 使用するAIモデル（デフォルト: claude-sonnet-4-20250522）

## 既知の制限事項

### サポートされていない機能
- `.waitForTaskToken` パターン
- `.sync` パターン

### サポート済み機能
- 全ての標準的な組み込み関数

### 制限事項
- メモリ制限: Node.jsのヒープサイズに依存
- 並列度: CPUコア数に依存

## リリースプロセス（重要）

### リリースPRの作成手順

このプロジェクトでは、リリース時に以下の手順を必ず守ってください：

1. **リリースブランチを作成**
   ```bash
   git checkout -b release/vX.Y.Z
   ```

2. **バージョンを手動で更新**（重要：両方とも更新する）
   - `package.json`のversionフィールドを更新
   - `CHANGELOG.md`の`[Unreleased]`を`[X.Y.Z] - YYYY-MM-DD`に変更

3. **変更をコミット**
   ```bash
   git add package.json CHANGELOG.md
   git commit -m "chore: prepare release vX.Y.Z"
   ```

4. **PRを作成**
   - タイトル: `Release vX.Y.Z`
   - 本文にCHANGELOGの内容を含める
   - **リリースラベルは不要**（package.jsonの変更で自動検出）

5. **マージ後の自動処理**
   - CIがpackage.jsonの変更を検出
   - 自動的にタグ作成・GitHub Release作成・npm publish

### ⚠️ 注意事項
- **package.jsonとCHANGELOG.mdは必ず両方更新する**
- **CIは自動バージョンアップを行わない**（手動更新が必要）
- **リリースラベル（release:major等）は使用しない**

詳細は[RELEASE.md](./RELEASE.md)を参照してください。

## 関連ドキュメント

- [リリースプロセス](./RELEASE.md) - 詳細なリリース手順
- [クイックスタートガイド](./docs/quick-start-guide.md) - インストールから実行まで
- [テストガイド](./docs/testing-guide.md) - 詳細なテスト作成方法
- [トラブルシューティング](./docs/troubleshooting.md) - 問題解決ガイド
- [設定リファレンス](./docs/configuration-reference.md) - 設定オプション詳細