# リリースプロセス

## 概要
このプロジェクトは、GitHub Actionsを使用した自動リリースパイプラインを採用しています。

## リリースフロー

### 1. リリースPRの作成

リリース時は専用のリリースPRを作成します：

1. **リリースブランチを作成** - `release/vX.Y.Z`形式のブランチを作成
2. **バージョンを更新**:
   - package.jsonのバージョンを更新
   - CHANGELOG.mdの`[Unreleased]`セクションを`[X.Y.Z]`に変更し、日付を追加
3. **PRを作成** - mainブランチへのPRを作成
4. **PRをマージ** - マージすると自動的に：
   - Gitタグが作成される
   - GitHub Releaseが作成される
   - pnpm publishがトリガーされる

### 2. 手動リリース

直接タグをプッシュすることでもリリース可能です：

```bash
# 1. package.jsonのバージョンを更新
pnpm version patch # または minor, major

# 2. タグをプッシュ
git push origin main --tags
```

## GitHub Actionsワークフロー

### release.yml
- **トリガー**: PRがmainにマージされた時
- **処理**:
  1. package.jsonのバージョン変更を検出
  2. 変更があればタグを作成・プッシュ
  3. GitHub Releaseを作成

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


## バージョン注入の仕組み

ビルド時にpackage.jsonの情報が自動的に注入されます：

1. **tsup.config.ts** - ビルド時にpackage.jsonを読み込み
2. **defineオプション** - `__VERSION__`と`__DESCRIPTION__`を定数として注入
3. **実行時** - ビルドされたコードには正しいバージョンが埋め込まれている

これにより：
- pnpm installされた後も正しいバージョンが表示される
- グローバルインストール後も正しく動作する
- GitHub Actionsでのビルドでも問題なく動作する

## トラブルシューティング

### バージョンの不整合
タグとpackage.jsonのバージョンが一致しない場合、publish.ymlが失敗します。
手動でタグを作成する場合は、必ず`pnpm version`コマンドを使用してください。

### pnpm publish失敗
- NPM_TOKENが正しく設定されているか確認
- パッケージ名が既に使用されていないか確認
- スコープ付きパッケージの場合は`--access public`が必要

### ビルドエラー
- Node.jsのバージョンが20以上であることを確認
- 依存関係が正しくインストールされているか確認（`pnpm install --frozen-lockfile`）