# 開発コマンド一覧

## 品質チェック（作業完了前に必須）
```bash
# TypeScript型チェック（必須）
npm run typecheck

# Lintチェック（必須）
npm run lint

# テスト実行（必須）
npm test -- --run

# すべての品質チェック
npm run check
```

## テスト関連
```bash
# テスト実行（watchモード無効）
npm test
npm test -- --run

# カバレッジ付きテスト
npm test -- --coverage
npm run test:coverage

# Watchモードでテスト（開発時）
npm run test:watch

# AWS Test Statesテスト
npm run test:test-states
```

## ビルド・開発
```bash
# 開発モード（ファイル監視）
npm run dev

# ビルド（本番用）
npm run build

# CLIをグローバルにリンク（開発時）
npm link
```

## Linter・Formatter
```bash
# Biomeによるlintチェック
npm run lint

# Biomeによる自動修正
npm run lint:fix

# コードフォーマット
npm run format
```

## CLIコマンド（sfn-test）
```bash
# プロジェクト初期化
sfn-test init

# CDKからASL抽出
sfn-test extract
sfn-test extract --cdk <path>
sfn-test extract --name <name>

# モック生成（AI支援）
sfn-test generate mock --name <state-machine-name>
sfn-test generate mock --asl ./state-machine.json -o ./mock.yaml

# テストケース生成（AI支援）
sfn-test generate test --name <state-machine-name>
sfn-test generate test --asl ./state-machine.json --mock ./mock.yaml -o ./test.yaml

# テスト実行
sfn-test run
sfn-test run --name <state-machine-name>
sfn-test run --cov
```

## Git関連（Darwin/macOS）
```bash
# ステータス確認
git status

# 差分確認
git diff

# コミット履歴
git log --oneline -10

# ブランチ操作
git branch
git checkout <branch>

# ファイル検索
find . -name "*.ts" -type f
grep -r "pattern" src/
```