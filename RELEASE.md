# リリースプロセス

## 概要
このプロジェクトは、GitHub Actionsを使用した自動リリースパイプラインを採用しています。

## リリースフロー

### 1. 自動リリース（推奨）

PRベースの自動リリースフローを使用します：

1. **PRを作成** - 変更をfeatureブランチからmainへのPRとして作成
2. **リリースラベルを付与** - PRに以下のいずれかのラベルを付与：
   - `release:major` - メジャーバージョンアップ (1.0.0 → 2.0.0)
   - `release:minor` - マイナーバージョンアップ (1.0.0 → 1.1.0)
   - `release:patch` - パッチバージョンアップ (1.0.0 → 1.0.1)
3. **PRをマージ** - マージすると自動的に：
   - package.jsonのバージョンが更新される
   - Gitタグが作成される
   - GitHub Releaseが作成される
   - npm publishがトリガーされる

### 2. 手動リリース

直接タグをプッシュすることでもリリース可能です：

```bash
# 1. package.jsonのバージョンを更新
npm version patch # または minor, major

# 2. タグをプッシュ
git push origin main --tags
```

## GitHub Actionsワークフロー

### release.yml
- **トリガー**: PRがmainにマージされた時
- **処理**:
  1. PRのラベルをチェック
  2. バージョンをバンプ
  3. タグを作成・プッシュ
  4. GitHub Releaseを作成

### publish.yml
- **トリガー**: `v*`形式のタグがプッシュされた時
- **処理**:
  1. 依存関係のインストール
  2. テスト・型チェック・Lintの実行
  3. ビルド（バージョン情報の注入）
  4. npmへのパブリッシュ

## セットアップ

### 必要なGitHub Secrets

1. **NPM_TOKEN**
   - npmjs.comでAccess Tokenを生成
   - Settings → Access Tokens → Generate New Token
   - Type: Automation（推奨）
   - GitHubリポジトリのSettings → Secrets → Actions → New repository secret

2. **RELEASE_PAT**（自動化に必要）
   - GitHub Personal Access Tokenを生成
   - https://github.com/settings/tokens/new
   - 必要なスコープ: `repo`, `workflow`
   - GitHubリポジトリのSettings → Secrets → Actions → New repository secret
   - **重要**: このトークンにより、Release ProcessワークフローがタグをプッシュしたときにPublish to npmワークフローが自動的にトリガーされます

### 必要なGitHubラベル

以下のラベルをリポジトリに作成：
- `release:major` (color: #ff0000)
- `release:minor` (color: #ffa500)
- `release:patch` (color: #00ff00)

```bash
# GitHub CLIでラベルを作成
gh label create "release:major" --color ff0000 --description "Major version release"
gh label create "release:minor" --color ffa500 --description "Minor version release"
gh label create "release:patch" --color 00ff00 --description "Patch version release"
```

## バージョン注入の仕組み

ビルド時にpackage.jsonの情報が自動的に注入されます：

1. **tsup.config.ts** - ビルド時にpackage.jsonを読み込み
2. **defineオプション** - `__VERSION__`と`__DESCRIPTION__`を定数として注入
3. **実行時** - ビルドされたコードには正しいバージョンが埋め込まれている

これにより：
- npm installされた後も正しいバージョンが表示される
- グローバルインストール後も正しく動作する
- GitHub Actionsでのビルドでも問題なく動作する

## トラブルシューティング

### バージョンの不整合
タグとpackage.jsonのバージョンが一致しない場合、publish.ymlが失敗します。
手動でタグを作成する場合は、必ず`npm version`コマンドを使用してください。

### npm publish失敗
- NPM_TOKENが正しく設定されているか確認
- パッケージ名が既に使用されていないか確認
- スコープ付きパッケージの場合は`--access public`が必要

### ビルドエラー
- Node.jsのバージョンが20以上であることを確認
- 依存関係が正しくインストールされているか確認（`npm ci`）