# プロジェクトアーキテクチャ

## ディレクトリ構造

```
src/
├── cli/                    # CLIコマンド実装
│   ├── index.ts           # CLIエントリポイント（Commander.js）
│   └── commands/          # 各コマンド実装
│       ├── init.ts        # プロジェクト初期化
│       ├── extract.ts     # CDKからASL抽出
│       ├── generate.ts    # AI支援での生成
│       └── run.ts         # テスト実行
│
├── core/                   # コア機能
│   ├── interpreter/        # ASLインタープリタ
│   │   ├── states/        # 各ステート実装
│   │   ├── expressions/   # JSONPath/JSONata評価
│   │   └── executor.ts    # 実行エンジン
│   ├── coverage/          # カバレッジ計算
│   ├── mock/              # モックエンジン
│   ├── parser/            # ASL/CDK解析
│   └── test/              # テスト実行管理
│
├── ai/                     # AI連携
│   ├── agents/            # AIエージェント実装
│   ├── generation/        # プロンプト生成・再試行管理
│   ├── validation/        # AI生成内容の検証
│   ├── analysis/          # ステートマシン分析
│   ├── prompts/           # プロンプトテンプレート
│   └── utils/             # AI関連ユーティリティ
│
├── config/                 # 設定管理
│   └── loader.ts          # 設定ファイル読み込み
│
├── types/                  # 型定義
│   ├── asl.ts             # ASL型定義
│   ├── state-classes.ts   # ステートクラス
│   ├── state-factory.ts   # ステートファクトリー
│   └── type-guards.ts     # 型ガード関数
│
├── constants/              # 定数定義
│   └── defaults.ts        # デフォルト値
│
└── utils/                  # 汎用ユーティリティ
```

## 主要コンポーネント

### CLIレイヤー
- Commander.jsベースのCLI実装
- コマンドごとに独立したモジュール
- 設定ファイル（sfn-test.config.yml）サポート

### コアレイヤー
- **Interpreter**: ASL実行エンジン
- **Mock Engine**: 条件付き・ステートフルモック
- **Coverage**: ステート・パスカバレッジ計算
- **Parser**: CDK/ASL解析

### AIレイヤー
- **PromptBuilder**: ステートマシン複雑度分析
- **GenerationRetryManager**: 再試行と検証管理
- **StateMachineValidator**: 生成内容の妥当性検証
- **DataFlowMockGenerator**: データフロー分析
- **TimeoutCalculator**: 複雑度ベースのタイムアウト計算

## データフロー
1. CDK/ASLからステートマシン定義を抽出
2. AI支援でモック・テストケース生成
3. モックエンジンでスタブ化
4. インタープリタでステートマシン実行
5. カバレッジ計測・レポート生成

## 設定ファイル
- `sfn-test.config.yml`: プロジェクト設定
- `*.mock.yaml`: モック定義
- `*.test.yaml`: テストケース定義

## ビルドシステム
- tsup: TypeScriptバンドラー
- 単一ファイル（dist/index.js）出力
- ESModuleとしてビルド
- 型定義ファイル生成