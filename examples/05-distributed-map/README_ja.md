# 05-distributed-map: Distributed Map による大規模処理

## 概要
Distributed Map ステートを使用して大規模データセットをスケールで処理する例です。
数百万のレコードを扱うシナリオにおいて、バッチ処理、エラーハンドリング、結果集約を含む分散処理パターンを紹介します。

## テストデータ

`test-data/` ディレクトリに外部テストデータファイルが含まれています：
- `products.json` - 基本的な商品データセット（10アイテム）
- `large-dataset.json` - 拡張データセット（50アイテム）
- `products.csv` - CSV形式の例

これらのファイルは、ItemReaderが異なるデータソースと形式を処理できることを示しています。

## 学習ポイント

### 1. Distributed Map vs 通常の Map
**通常の Map**:
- 単一実行内でアイテムを処理
- 実行履歴とメモリによって制限
- 10K未満のアイテムに最適

**Distributed Map**:
- 処理のために子実行を生成
- 数百万のアイテムを処理可能
- 障害許容性を備えた大規模スケール用

### 2. 主要コンポーネント

#### ItemReader
```json
"ItemReader": {
  "Resource": "arn:aws:states:::s3:getObject",
  "ReaderConfig": {
    "InputType": "JSON"
  },
  "Parameters": {
    "Bucket.$": "$.dataSource.bucket",
    "Key.$": "$.dataSource.key"
  }
}
```

#### ItemBatcher
```json
"ItemBatcher": {
  "MaxItemsPerBatch": 100,
  "BatchInput": {
    "batchMetadata": {
      "processingType": "distributed",
      "timestamp.$": "$$.State.EnteredTime"
    }
  }
}
```

#### ProcessorConfig
```json
"ProcessorConfig": {
  "Mode": "DISTRIBUTED",
  "ExecutionType": "EXPRESS"
}
```

#### ResultWriter
```json
"ResultWriter": {
  "Resource": "arn:aws:states:::s3:putObject",
  "Parameters": {
    "Bucket": "my-results-bucket",
    "Key.$": "States.Format('results/{}.json', $$.Execution.Name)"
  }
}
```

### 3. エラーハンドリング機能
- **ToleratedFailurePercentage**: 最大5%のバッチ失敗を許可
- **Retry ロジック**: 一時的な障害の自動再試行
- **Catch ブロック**: バッチ失敗の適切なエラーハンドリング

## ステートマシン アーキテクチャ

```
[開始]
   ↓
PrepareDataSource（処理パラメータの設定）
   ↓
ProcessLargeDataset（Distributed Map）
   ├─── ItemReader: S3から読み込み
   ├─── ItemBatcher: 100個ずつのバッチにグループ化
   ├─── ItemProcessor: 各バッチ（子実行）:
   │    ├─── ProcessBatch (Lambda)
   │    ├─── ValidateResults (Choice)
   │    ├─── LogSuccess / LogEmptyBatch
   │    └─── HandleBatchError（失敗時）
   ├─── ResultWriter: S3に結果を書き込み
   ↓
SummarizeResults（最終結果の集約）
   ↓
[終了]
```

## 処理フロー

### 1. データ取り込み
- **ItemReader** がS3から大規模データセットを読み込み（JSON形式）
- CSV、JSON、JSONL、Manifest 形式をサポート
- 任意のサイズのファイルを処理可能

### 2. バッチ処理
- **ItemBatcher** がアイテムを設定可能なバッチサイズにグループ化
- 各バッチが個別の子実行になる
- バッチは MaxConcurrency 制限まで並列実行

### 3. アイテム処理
- 各バッチが Lambda 関数によって処理される
- 一時的な障害に対する再試行ロジックを含む
- 処理結果とエラーをログ記録

### 4. 結果集約
- **ResultWriter** が結果をS3に保存
- 最終ステートが実行統計を要約
- 完了メトリクスとステータスを提供

## 設定オプション

### 並行性制御
```json
"MaxConcurrency": 1000  // 最大並列子実行数
```

### 障害許容性
```json
"ToleratedFailurePercentage": 5  // 5%のバッチ失敗を許可
```

### バッチ設定
```json
"ItemBatcher": {
  "MaxItemsPerBatch": 100,     // バッチあたりのアイテム数
  "MaxInputBytesPerBatch": 1048576  // オプション: バッチあたりの最大バイト数
}
```

### 実行モード
```json
"ProcessorConfig": {
  "Mode": "DISTRIBUTED",        // Distributed Map に必須
  "ExecutionType": "EXPRESS"    // 速度のため Express ワークフローを使用
}
```

## テストシナリオ

### 1. 大規模データセット処理
- 大規模商品カタログの処理をシミュレート
- バッチングによる分散処理をテスト
- パス実行とデータフローを検証

### 2. 小規模データセット処理
- より小さなデータセットで基本機能をテスト
- 適切な結果集約を保証
- 完了ステータスを検証

## テストの実行

```bash
# テスト実行
sfn-test run --suite ./test-suite.yaml

# 期待される結果
✅ Large dataset processing
✅ Small dataset processing

All tests passed!
```

## 実用的な使用例

Distributed Map が理想的なケース：

### 1. データ処理パイプライン
- **ETL オペレーション**: 数百万のレコードを変換
- **データ検証**: 大規模データセットの検証
- **形式変換**: スケールでのファイル形式変換

### 2. コンテンツ処理
- **画像処理**: 数百万の画像のリサイズ/変換
- **ドキュメント処理**: ドキュメントからのデータ抽出
- **メディア変換**: 音声/動画ファイルの変換

### 3. ビジネス オペレーション
- **レポート生成**: レポート用の大規模データセット処理
- **バッチ通知**: 数百万ユーザーへの通知送信
- **データ移行**: システム間のデータ移行

### 4. 機械学習
- **特徴エンジニアリング**: 訓練データセットの処理
- **バッチ予測**: 大規模データセットでの推論実行
- **モデル評価**: テストデータに対するモデル検証

## ベストプラクティス

### 1. バッチサイズの最適化
```json
// 以下の要因を考慮:
"MaxItemsPerBatch": 100,  // オーバーヘッドと処理時間のバランス
"MaxInputBytesPerBatch": 1048576  // 過大なバッチを防止
```

### 2. 障害の適切な処理
```json
"ToleratedFailurePercentage": 5,  // 一部の失敗を許可
"Retry": [
  {
    "ErrorEquals": ["Lambda.ServiceException"],
    "MaxAttempts": 3,
    "BackoffRate": 2.0
  }
]
```

### 3. 進行状況の監視
- CloudWatch メトリクスで実行を監視
- デバッグのため ItemProcessor でログを実装
- 失敗率のアラームを設定

### 4. コスト最適化
- ItemProcessor で Express ワークフローを使用
- バッチ設定を適切にサイジング
- Lambda 関数のパフォーマンスを監視・最適化

## トラブルシューティング

### Q: 子実行がタイムアウトで失敗する？
**A**: ItemProcessor のタイムアウトを延長するか、バッチサイズを削減してください。Express ワークフローには5分の制限があります。

### Q: 処理が遅すぎる？
**A**: MaxConcurrency を増加するか Lambda 関数のパフォーマンスを最適化してください。バッチサイズの調整も検討してください。

### Q: コストが高い？
**A**: オーバーヘッドを削減するためバッチサイズを最適化してください。Express ワークフローを使用し、Lambda 関数を適切にサイジングしてください。

### Q: ItemReader がデータを見つけない？
**A**: S3 バケット/キー パラメータを確認し、実行ロールの適切な IAM 権限を確保してください。

## 高度な機能

### 1. 複数の入力ソース
```json
"ItemReader": {
  "Resource": "arn:aws:states:::s3:listObjectsV2",
  "Parameters": {
    "Bucket": "my-bucket",
    "Prefix": "data/"
  }
}
```

### 2. カスタム結果処理
```json
"ResultWriter": {
  "Resource": "arn:aws:states:::lambda:invoke",
  "Parameters": {
    "FunctionName": "CustomResultProcessor",
    "Payload.$": "$"
  }
}
```

### 3. 動的設定
```json
"MaxConcurrency.$": "$.processingConfig.maxConcurrency",
"ToleratedFailurePercentage.$": "$.processingConfig.failureThreshold"
```

## 次のステップ
Distributed Map 処理をマスターしたら、[06-error-handling](../06-error-handling/)でエラーハンドリングパターンについて学びましょう。