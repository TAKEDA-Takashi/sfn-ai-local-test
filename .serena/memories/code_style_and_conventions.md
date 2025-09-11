# コードスタイルと規約

## TypeScript設定
- **ターゲット**: ES2022
- **モジュール**: ESNext
- **厳格モード**: strict: true
- **未使用変数チェック**: noUnusedLocals, noUnusedParameters有効
- **型定義**: 必須（any禁止）
- **モジュール解決**: bundler

## Biome設定（Linter/Formatter）

### フォーマット規則
- **インデント**: スペース2文字
- **行末**: LF
- **行幅**: 100文字
- **クォート**: シングルクォート（'）
- **セミコロン**: 必要時のみ（asNeeded）
- **末尾カンマ**: あり（trailingCommas: all）
- **ブラケットスペース**: あり
- **アロー関数の括弧**: 常に（arrowParentheses: always）

### Lintルール
- **推奨ルール**: 有効
- **noExplicitAny**: エラー（テストファイルでは無効）
- **noUnusedVariables**: エラー
- **noUnusedImports**: エラー
- **useConst**: エラー
- **useTemplate**: エラー（テンプレートリテラル使用）
- **useNodejsImportProtocol**: エラー（node:プレフィックス必須）
- **noNonNullAssertion**: 警告

### テストファイル例外
- `**/*.test.ts`, `**/*.spec.ts`ではnoExplicitAnyを無効化

## テスト設定（Vitest）
- **環境**: Node.js
- **グローバル**: 有効
- **カバレッジ閾値**: 80%（statements, branches, functions, lines）
- **タイムアウト**: 10秒
- **watchモード**: デフォルトで無効

## コーディング原則
- **単一責任の原則**: 各関数・モジュールは単一の責務
- **DRY原則**: コードの重複を避ける
- **YAGNI原則**: 必要のない機能は実装しない
- **KISS原則**: シンプルな解決策を選択
- **エラーハンドリング**: 明示的に行う

## コミット規約
```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: コードスタイル修正
refactor: リファクタリング
test: テスト追加・修正
chore: ビルド・設定変更
```

## 新機能実装前の必須確認
既存実装を必ず確認し、重複実装を避ける：
- 型ガード: `/src/types/type-guards.ts`
- StateClassメソッド: `state.isTask()`, `state.isMap()` など
- ASL型定義: `/src/types/asl.ts`
- ステートファクトリー: `/src/types/state-factory.ts`