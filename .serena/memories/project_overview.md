# sfn-ai-local-test プロジェクト概要

## プロジェクトの目的
AWS Step Functions用のAI駆動型ローカルテストツール。ステートマシンのローカルテストとカバレッジ計測を実現するCLIツールです。

## 主要機能
- ASL JSONからステートマシンを実行・テスト
- CDKコードからステートマシン定義を抽出
- YAMLベースのモック設定（固定値、条件分岐、ステートフル）
- カバレッジ計測とレポート生成
- AI支援によるモック/テストケース自動生成
- JSONPath/JSONata両方のクエリ言語サポート

## 技術スタック
- **言語**: TypeScript (ES2022)
- **ビルドツール**: tsup（単一ファイルバンドル）
- **テストフレームワーク**: Vitest
- **Linter/Formatter**: Biome
- **CLI Framework**: Commander.js
- **AI**: Anthropic SDK / Claude CLI
- **パッケージマネージャ**: npm
- **Node.js**: v20.0.0以上

## 主要な依存関係
- @anthropic-ai/sdk: Claude AI連携
- commander: CLIコマンド管理
- jsonata: JSONataクエリ言語サポート
- jsonpath-plus: JSONPathクエリ言語サポート
- js-yaml: YAML設定ファイル処理
- chalk: ターミナル出力の色付け
- ora: プログレス表示
- inquirer: 対話的プロンプト

## CLIツール名
`sfn-test` - バイナリ名として登録されている