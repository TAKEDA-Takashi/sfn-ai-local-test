# ADR-001: ExecutionContext の固定値化

## Status

Proposed

## Context

現在、Step Functions のローカルテスト実行時に `ExecutionContext`（`Execution.Id`、`Execution.Name`、`Execution.StartTime` など）がタイムスタンプベースで動的に生成されている。

### 現状の問題点

1. **テストの非決定性**
   - 実行のたびに異なる値が生成される
   - テストで「Execution.Nameが変数に設定されている」ことを検証できない
   
2. **時刻ベースのテストが困難**
   - 深夜バッチ処理や年末処理などの時刻依存ロジックのテストが書けない
   - タイムスタンプ比較を含むChoiceステートのテストが困難

3. **デバッグの困難性**
   - 実行結果が毎回異なるため、問題の再現が困難
   - CI/CDでの不安定なテスト（flaky test）の原因になる

## Decision

ExecutionContext のすべての時刻関連フィールドを予測可能な固定値にする。

### 基本方針

1. **デフォルトは固定値**
   ```typescript
   const defaultExecutionContext = {
     name: 'test-execution',
     startTime: '2024-01-01T00:00:00.000Z',
     accountId: '123456789012',
     region: 'us-east-1'
   }
   ```

2. **設定の優先順位**
   1. 各テストケース（最優先）
   2. テストスイート全体
   3. グローバル設定
   4. ハードコードされたデフォルト値

### 実装詳細

#### Execution.Id の形式
```typescript
`arn:aws:states:${region}:${accountId}:execution:${stateMachineName}:${executionName}`
```

#### 時刻関数の扱い
```typescript
// すべて固定値を返す
$now() => config.startTime
$millis() => new Date(config.startTime).getTime()
State.EnteredTime => config.startTime
States.UUID() => 'test-uuid-00000000-0000-4000-8000-000000000001'
```

#### 設定可能性
設定ファイル（グローバル設定、テストスイート、各テストケース）で上書き可能とする。

## Consequences

### 良い影響

1. **テストの決定性と再現性**
   - 同じ入力に対して常に同じ結果
   - CI/CDでの安定したテスト実行

2. **時刻ベースのテストが可能**
   - 深夜バッチ、年末処理などのテストシナリオ
   - タイムスタンプ比較ロジックの検証

3. **デバッグの容易性**
   - 問題の再現が簡単
   - テスト失敗時の原因特定が容易

4. **後方互換性**
   - デフォルト値により既存テストへの影響を最小化
   - 段階的な移行が可能

### 潜在的な課題

1. **実環境との差異**
   - 固定値のため、実際の動的な時刻進行とは異なる
   - → 必要な場合はモックで個別対応

2. **Map/Parallel での時刻進行**
   - 並列実行時の時刻進行の表現が困難
   - → すべて同じ時刻とし、必要になれば将来的に検討

3. **経過時間計算**
   - `$now() - StartTime` のような計算が固定値では意味をなさない
   - → 実際に問題になったら対応を検討

## 代替案

### 案1: 動的モードの提供
`mockTimeMode: 'dynamic'` オプションで実際の時刻を使用可能にする。

**却下理由**: テストの本質は再現性であり、動的な値はテストには不適切。

### 案2: State.EnteredTime の段階的増加
各ステートで時刻を1秒ずつ進める。

**却下理由**: Map/Parallelでの複雑性を考慮し、シンプルな固定値を採用。将来的に必要性が明確になった場合に再検討。

### 案3: 時刻関数の動的化オプション
`$now()` や `$millis()` を実際の現在時刻で返すオプション。

**却下理由**: テストの再現性が失われるため不採用。

## 参考資料

- [AWS Step Functions Context Object](https://docs.aws.amazon.com/step-functions/latest/dg/input-output-contextobject.html)

## 更新履歴

- 2025-09-12: 初版作成