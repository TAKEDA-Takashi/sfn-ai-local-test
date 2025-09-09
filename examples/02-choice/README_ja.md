# 02-choice: Choice stateによる条件分岐

## 概要
Choice stateを使用して、年齢とメンバータイプに基づいて異なる処理パスに分岐する例です。
単一条件、複合条件（And）、デフォルト処理など、Choice stateの様々な機能を学習できます。

## 学習ポイント

### 1. Choice stateの基本構造
```json
"CheckAge": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.userData.age",
      "NumericGreaterThanEquals": 65,
      "Next": "SeniorProcess"
    }
  ],
  "Default": "UnknownAge"
}
```

### 2. 複合条件（And）の使用
複数の条件をAND演算子で組み合わせる：

```json
{
  "And": [
    {
      "Variable": "$.userData.age",
      "NumericGreaterThanEquals": 65
    },
    {
      "Variable": "$.userData.memberType",
      "StringEquals": "premium"
    }
  ],
  "Next": "PremiumSeniorProcess"
}
```

### 3. ResultSelectorの活用
Lambda統合でPayloadの中身を抽出：

```json
"ResultSelector": {
  "age.$": "$.Payload.age",
  "name.$": "$.Payload.name",
  "memberType.$": "$.Payload.memberType"
}
```

## ステートマシンの構成

```
[開始]
   ↓
GetUserAge (Task)
   - Lambda統合でユーザー情報取得
   - ResultSelectorでPayloadから必要な情報を抽出
   ↓
CheckAge (Choice)
   ├─[age >= 65 AND memberType == "premium"]─→ PremiumSeniorProcess (50%割引 + 特典)
   ├─[age >= 65]─────────────────────────────→ SeniorProcess (30%割引)
   ├─[age >= 20]─────────────────────────────→ AdultProcess (割引なし)
   ├─[age < 20]──────────────────────────────→ ChildProcess (50%割引 + 保護者設定)
   └─[Default]───────────────────────────────→ UnknownAge (エラー処理)
```

## 条件の評価順序の重要性

Choicesは上から順番に評価されます：

1. **プレミアムシニア条件**（最も具体的）を最初に配置
2. **通常シニア条件**（プレミアムでないシニア）
3. **成人条件**
4. **子供条件**
5. **デフォルト**（どの条件にも合致しない場合）

より具体的な条件を上に配置することで、正しい分岐が実現されます。

## モック設定のポイント

### conditional モックタイプ
入力に応じて異なる応答を返す：

```yaml
conditions:
  - when:
      input:
        Payload:
          userId: "senior-premium-001"
    response:
      Payload:
        age: 70
        name: "佐藤花子"
        memberType: "premium"
      StatusCode: 200
```

入力の部分一致でマッチングされるため、Payload構造も含めて指定します。

## テストケースの設計

### 1. 複合条件のテスト
- プレミアムシニア（65歳以上 AND premium）
- 通常シニア（65歳以上、standardメンバー）

### 2. 境界値テスト
- ちょうど65歳 → シニアとして処理
- ちょうど20歳 → 成人として処理
- 19歳 → 子供として処理

### 3. デフォルト処理
- 年齢データなし → UnknownAgeへ分岐

## テストの実行

```bash
# テストスイート実行
sfn-test run --suite ./test-suite.yaml

# 期待される出力
✓ プレミアムシニア判定（65歳以上 AND premium）
✓ 通常シニア判定（65歳以上、standardメンバー）
✓ 成人判定（20歳以上65歳未満）
✓ 子供判定（20歳未満）
✓ 未知の年齢（デフォルト処理）

All tests passed!
```

## トラブルシューティング

### Q: 複合条件が期待通りに評価されない
A: And条件内の全ての条件が真である必要があります。一つでも偽なら、その条件全体がスキップされます。

### Q: ResultSelectorで値が取得できない
A: JSONPathの構文と、キー名の`.$`サフィックスを確認してください。

### Q: conditional モックがマッチしない
A: 入力の構造（Payload含む）が正しいか確認してください。部分一致で評価されます。

## 次のステップ
条件分岐を理解したら、[03-parallel](../03-parallel/)で並列処理について学びましょう。