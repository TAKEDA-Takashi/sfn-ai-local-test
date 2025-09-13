# 🚨 作業開始前の必須確認事項

## 必ず最初に実行すること
1. **メモリ一覧の確認**: `list_memories`を実行
2. **関連メモリの読み込み**: 今回の作業に関係しそうなメモリをすべて読む

## スキーマ変更時の必須確認
- **Zodスキーマ変更時** → `zod-schema-and-embedded-types-sync`メモリを必ず確認
  - test-schema.ts、mock-schema.ts、config-schema.tsのいずれかを変更したら
  - embedded-types.tsも必ず更新する

## なぜ重要か
- コンテキストリセット後も、このメモリを見れば何を確認すべきかわかる
- 「メモリを確認する」という行為自体を思い出すためのメモリ

## チェックリスト
- [ ] `list_memories`を実行した
- [ ] 作業内容に関連するメモリを読んだ
- [ ] 特にスキーマ変更の場合は`zod-schema-and-embedded-types-sync`を確認した