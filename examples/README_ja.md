# sfn-ai-local-test サンプル集

Step Functions ローカルテストツールのサンプル集です。基本パターンから応用実装まで、段階的に学習できる包括的な例を提供しています。

## 📚 チュートリアル例（推奨学習順序）

### [01-simple](./01-simple/): 基本ワークフロー
- **学習内容**: Task、Pass、Succeed ステートの基礎
- **機能**: Lambda統合、ResultSelector、ResultPath
- **テスト**: 基本的な入出力検証、実行パス検証

### [02-choice](./02-choice/): 条件分岐
- **学習内容**: Choice ステートによる条件処理
- **機能**: 複合条件（And）、デフォルト処理、境界値テスト
- **テスト**: 完全なブランチパスカバレッジ

### [03-parallel](./03-parallel/): 並列処理
- **学習内容**: Parallel ステートによる同時実行
- **機能**: ブランチ処理、結果集約、複雑データフロー
- **テスト**: 並列実行検証、ブランチパス検証

### [04-map](./04-map/): 反復処理
- **学習内容**: Map ステートによる配列処理
- **機能**: ItemProcessor、MaxConcurrency、検証パターン
- **テスト**: 配列処理、混合検証シナリオ

### [05-distributed-map](./05-distributed-map/): 大規模分散処理
- **学習内容**: 大規模データセット用 Distributed Map
- **機能**: ItemReader、ItemBatcher、ResultWriter、障害許容性
- **テスト**: 大規模処理シナリオ、バッチ検証

## 🔧 応用例

### [06-error-handling](./06-error-handling/): エラー管理
- **学習内容**: Retry、Catch、エラー復旧パターン
- **機能**: トランザクション処理でのエラーシナリオ
- **テスト**: エラーハンドリング検証

### [07-variables](./07-variables/): 変数管理
- **学習内容**: 変数の定義と使用、スコープ管理
- **機能**: Assign、Variables、参照パターン
- **テスト**: 変数スコープ検証

### [08-jsonata](./08-jsonata/): JSONata式言語
- **学習内容**: JSONata構文、複雑なデータ変換
- **機能**: 高度なクエリ式、データ操作
- **テスト**: 式評価テスト

## 🏗️ 統合例

### [09-cdk-integration](./09-cdk-integration/): CDK統合
- **学習内容**: AWS CDKで定義したステートマシンのローカルテスト
- **機能**: CDK自動抽出、ItemProcessor/ItemSelector、100%カバレッジ
- **テスト**: 注文処理ワークフローの完全検証

## 🚀 クイックスタート

### 1. 個別例の実行
```bash
# 任意の例のディレクトリに移動
cd examples/01-simple

# テストスイートを実行
sfn-test run --suite ./test-suite.yaml
```

### 2. グローバルインストール（オプション）
```bash
# グローバルインストール
npm install -g sfn-ai-local-test

# 任意の例ディレクトリから実行
sfn-test run --suite ./test-suite.yaml
```

## 📖 学習パス

### 🟢 初心者パス
Step Functions やテストが初めての方はこちらから：
1. [01-simple](./01-simple/) - 基本ステートの理解
2. [02-choice](./02-choice/) - 条件ロジックの学習
3. [03-parallel](./03-parallel/) - 同時実行の把握

### 🟡 中級者パス
Step Functions の基礎に慣れた方向け：
1. [04-map](./04-map/) - 配列と反復処理
2. [05-distributed-map](./05-distributed-map/) - 大規模分散処理
3. [06-error-handling](./06-error-handling/) - 障害の適切な管理

### 🔴 上級者パス
本番システム構築経験者向け：
1. [07-variables](./07-variables/) - 変数とスコープ管理
2. [08-jsonata](./08-jsonata/) - 高度なデータ変換
3. [09-cdk-integration](./09-cdk-integration/) - Infrastructure as Code 統合
4. カスタムモックエンジン開発
5. 複雑なワークフローパターン

## 📄 詳細ドキュメント

詳細な技術情報は以下のドキュメントを参照してください：

- [🔧 モック設定ガイド](../docs/mock-guide.md) - モックタイプの詳細と使用方法
- [💡 ベストプラクティス](../docs/best-practices.md) - 効果的なテスト設計と実装パターン
- [🐛 トラブルシューティング](../docs/troubleshooting.md) - よくある問題と解決方法
- [📊 テストケース作成ガイド](../docs/test-case-guide.md) - テストスイートの作成方法
