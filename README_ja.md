# sfn-ai-local-test

> AI-powered local testing tool for AWS Step Functions

AWS Step Functionsのステートマシンをローカルで実行・テストできる強力なツールです。

## ✨ 主要機能

- 🚀 **高速実行**: TypeScript製のステートマシンインタープリタ
- 🤖 **AI支援**: Claude APIによるモック/テストケース自動生成
- 🧪 **包括的テスト**: YAMLベースのリグレッションテストスイート
- 📊 **カバレッジ計測**: 実行パスカバレッジの自動計算と可視化
- 🔄 **完全サポート**: JSONPath/JSONata両対応、全ステートタイプ対応
- 🏗️ **CDK統合**: CDK出力からの自動ASL抽出

## 📦 インストール

```bash
npm install -g sfn-test
```

## 🚀 クイックスタート

1. **プロジェクト初期化**
   ```bash
   # Claude API キーを設定
   export ANTHROPIC_API_KEY="your-api-key"
   
   # プロジェクト初期化
   sfn-test init
   ```

2. **CDKからASL抽出**（CDKプロジェクトの場合）
   ```bash
   sfn-test extract
   ```

3. **モック・テスト生成**（AI支援）
   ```bash
   sfn-test generate mock --name my-workflow
   sfn-test generate test --name my-workflow
   ```

4. **テスト実行**
   ```bash
   # 全テスト実行
   sfn-test run
   
   # カバレッジ付き実行
   sfn-test run --cov
   ```

## 🛠️ 基本コマンド

| コマンド | 説明 |
|----------|------|
| `sfn-test init` | プロジェクト初期化（対話式） |
| `sfn-test extract` | CDK/CloudFormationからASL定義を抽出 |
| `sfn-test extract --cdk <path>` | 特定のCDK synth出力から抽出 |
| `sfn-test extract --cdk-out <dir>` | CDKアウトディレクトリから抽出 |
| `sfn-test generate mock --name <name>` | AIでモック設定生成 |
| `sfn-test generate mock --max-attempts 3` | 再試行回数を指定してモック生成 |
| `sfn-test generate test --name <name>` | AIでテストケース生成 |
| `sfn-test generate test --max-attempts 3` | 再試行回数を指定してテスト生成 |
| `sfn-test run` | 全テストスイート実行 |
| `sfn-test run --name <name>` | 単一ステートマシン実行 |
| `sfn-test run --suite <path>` | 特定テストスイートファイル実行 |
| `sfn-test run --cov` | カバレッジ計測付き実行 |

## 📚 ドキュメント

### 📖 詳細ガイド
- **[クイックスタートガイド](./docs/quick-start-guide.md)** - インストールから実行まで
- **[テストガイド](./docs/testing-guide.md)** - 詳細なテスト作成方法
- **[設定リファレンス](./docs/configuration-reference.md)** - 全設定オプションの詳細説明
- **[トラブルシューティング](./docs/troubleshooting.md)** - 問題解決ガイド

### 🔧 実用例とサンプル
- **[基本例](./examples/01-simple/)** - シンプルなワークフローとテスト
- **[Choice分岐](./examples/02-choice/)** - 条件分岐の処理とテスト
- **[並列処理](./examples/03-parallel/)** - Parallelステートの活用
- **[Map処理](./examples/04-map/)** - 配列データの一括処理
- **[Distributed Map](./examples/05-distributed-map/)** - 大規模データ処理
- **[エラーハンドリング](./examples/06-error-handling/)** - リトライ・キャッチ処理
- **[変数とスコープ](./examples/07-variables/)** - 変数の受け渡しとスコープ管理
- **[JSONata活用](./examples/08-jsonata/)** - JSONata式言語の活用法
- **[CDK統合](./examples/09-cdk-integration/)** - CDKプロジェクトでの使用方法

## ⚙️ 開発者向け

```bash
# 依存関係インストール
npm install

# 開発モード
npm run dev

# 品質チェック
npm run check

# テスト実行
npm test
```

## 🔍 対応機能

### ✅ サポートされているステートタイプ
- **Task** - Lambda統合の最適化パターン対応
- **Choice** - 条件分岐
- **Wait** - 待機処理
- **Succeed/Fail** - 終了状態
- **Pass** - データ変換
- **Parallel** - 並列処理
- **Map** - 配列処理
- **Distributed Map** - 大規模データ処理（ItemReader/ItemBatcher/ResultWriter対応）
- **Retry/Catch** - エラーハンドリング

### 🎯 主要機能
- **JSONPath/JSONata両対応** - 式言語の完全サポート
- **モック設定** - 固定値・条件分岐・ステートフル・エラーシミュレーション
- **外部データ連携** - JSON/CSV/JSONL/YAMLファイルからのデータ読み込み
- **実行パス検証** - 複雑な分岐パスの検証
- **カバレッジ計測** - 実行パスカバレッジの自動計算
- **レポート出力** - コンソール/JSON/JUnit形式での結果出力

### 🤖 AI生成機能の詳細

#### 自動タイムアウト調整
ステートマシンの複雑度を自動分析し、適切なタイムアウト値を設定します。

**算出ロジック**:
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
AI生成内容は自動検証され、問題があれば段階的フィードバックで再生成されます。

- **1回目失敗**: 簡潔で友好的な修正提案
- **2回目失敗**: より詳細で強調された修正提案  
- **3回目以降**: 厳重モードで全エラーを詳細表示

```bash
# デフォルト: 2回まで試行
sfn-test generate mock --asl ./state-machine.json

# 最大試行回数を変更
sfn-test generate mock --asl ./state-machine.json --max-attempts 3

# 手動タイムアウト指定（自動算出を無効化）
sfn-test generate mock --asl ./state-machine.json --timeout 600000
```

## 🤝 コントリビューション

Issue や Pull Request は大歓迎です！

## 📞 サポート

- **[Issues](https://github.com/TAKEDA-Takashi/sfn-ai-local-test/issues)** - バグ報告・機能要望
- **[Discussions](https://github.com/TAKEDA-Takashi/sfn-ai-local-test/discussions)** - 質問・議論

## 📄 ライセンス

MIT
