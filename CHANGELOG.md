# Changelog

## [Unreleased]

### ✨ 改善
- **ExecutionContext固定値化** - テストの再現性向上のため、Execution.Id、Execution.Name、Execution.StartTime等を固定値に変更
- **組み込み関数の固定値化** - States.UUID()、$uuid()、$now()、$millis()が決定論的な固定値を返すように実装（ADR-001準拠）
- **コンテキスト変数のサポート改善** - JSONPathモードで`$$.`プレフィックスのコンテキスト変数が適切に参照できるよう修正
- **JSONataモードの文字列評価** - Outputフィールドの文字列がJSONata式として正しく評価されるよう修正
- **固定値の定数化** - ExecutionContextとUUIDの固定値を`constants/execution-context.ts`に集約

### 📝 ドキュメント
- **ADR-001追加** - ExecutionContext固定値化の設計決定記録を追加
- **テストガイド更新** - 組み込み関数の固定値に関する説明を追加

## [1.3.0] - 2025-01-12

### 💥 Breaking Changes
- **pathMatchingモードの統合** - `sequence`モードを`includes`にリネーム（より直感的な名前）
- **不要なモードの削除** - 存在しない`partial`モードを削除

### 🐛 バグ修正
- **Choice stateモックフィールド名修正** - AI生成で誤った`nextState`を`Next`に修正
- **pathMatchingのデフォルト値修正** - 仕様通り`exact`をデフォルトに設定

### ✨ 改善
- **テスト結果のdiff表示改善** - DiffFormatterとPathDiffFormatterクラスを追加し、より見やすい差分表示を実現
- **pathMatchingモードの簡素化** - `exact`と`includes`の2モードに統合

## [1.1.1] - 2025-01-12

### 🐛 バグ修正
- **Map/DistributedMap実行パス記録の修正** - 実行パスの追跡精度を向上
- **JSONata関数のundefined戻り値の修正** - `$partition`等の関数がundefinedを返す場合の処理を改善
- **テストアサーションの改善** - より正確な期待値チェック機能

### ♻️ リファクタリング
- **型安全性の大幅改善** - コードベース全体で30+の型キャストを削除
- **hasIterator型ガードの追加** - レガシーIteratorフィールドの型ガード実装
- **JSON型ガードの追加** - `isJsonValue`, `isJsonObject`, `isJsonArray`型ガード実装
- **AIモジュール型キャスト除去** - 15ファイルで型キャストを削除
- **coreモジュール型キャスト除去** - 14ファイルで型キャストを削除

### 🧪 テスト
- **test-examples.shスクリプト追加** - 全サンプルテストの自動実行機能
- **全サンプルテスト通過** - 9/9のサンプルテストが成功

## [1.1.0] - 2025-01-09

### 🎯 新機能
- **動的フィールド検出器（DynamicFieldDetector）** - JSONPath/JSONata式を分析して動的フィールドを自動検出
- **AI生成精度の向上** - Lambda統合のPayloadラッピング要件を自動判定
- **カバレッジ追跡の改善** - ネストされたステート（Map/Parallel）の追跡精度向上

### 📈 改善
- AI生成プロンプトに動的フィールド検出を統合
- YAMLプロンプトルールを改善して生成精度向上  
- カバレッジレポートの詳細度を改善
- ChoiceステートのJSONataサポートを強化
- テスト実行のアサーション機能を拡張
- CLIコマンドのエラーハンドリングを改善

### 🧪 テスト
- 各機能のテストカバレッジを向上
- Parallel/Choiceステートの複雑なケースを検証
- エッジケースのテストを追加

### 📚 ドキュメント
- 設定リファレンスを更新（英語・日本語）
- 新機能の説明を追加

### 🔧 その他
- 不要なバリデーターテストファイルを削除
- コードの整理とリファクタリング

## [1.0.0] - 2025-01-08

### 初回リリース
- AWS Step Functions用のローカルテストツール
- AI支援によるモック/テストケース自動生成
- カバレッジ計測とレポート生成
- JSONPath/JSONataクエリ言語サポート
- YAMLベースのモック設定（固定値、条件分岐、ステートフル）
- CDKコードからのステートマシン定義抽出
