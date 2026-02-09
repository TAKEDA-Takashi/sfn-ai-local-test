/**
 * Application-wide default values
 *
 * These constants should be used throughout the application
 * instead of hardcoding values in multiple places.
 */

export const DEFAULT_CONFIG_FILE = './sfn-test.config.yaml'
export const DEFAULT_EXTRACTED_DIR = './.sfn-test/extracted'
export const DEFAULT_COVERAGE_DIR = './.sfn-test/coverage'
export const DEFAULT_MOCKS_DIR = './sfn-test/mocks'
export const DEFAULT_TEST_SUITES_DIR = './sfn-test/test-suites'
export const DEFAULT_TEST_DATA_DIR = './sfn-test/test-data'

export const DEFAULT_AI_MODEL = 'claude-sonnet-4-5-20250929'
export const DEFAULT_AI_MAX_TOKENS = 16_384

export const DEFAULT_AI_TIMEOUT_MS = 180000

export const DEFAULT_TEST_TIMEOUT_MS = 30_000
export const DEFAULT_AI_BASE_TIMEOUT_MS = 60_000
export const DEFAULT_AI_PER_STATE_TIMEOUT_MS = 2_000
export const MAX_AI_TIMEOUT_MS = 600_000
export const MILLISECONDS_PER_SECOND = 1_000

export const DEFAULT_TEST_REPORTER: 'default' | 'json' | 'junit' = 'default'

export const HTTP_STATUS_OK = 200

export const LARGE_STATE_COUNT_THRESHOLD = 20

export const FRIENDLY_FEEDBACK_ATTEMPT = 2 // フレンドリーなフィードバックを開始する試行回数
export const STRICT_FEEDBACK_ATTEMPT = 3 // 厳格なフィードバックに切り替える試行回数
export const STRICT_VALIDATION_THRESHOLD = 2 // 厳格な検証モードに移行する闾値
export const INITIAL_ERROR_DISPLAY_LIMIT = 3 // 初回試行時はAIを圧倒しないようエラー数を制限
export const WARNING_DISPLAY_LIMIT = 2 // 警告は重要度が低いため表示数を制限

export const DEFAULT_MOCK_FILENAME = 'sfn-test.mock.yaml'
export const DEFAULT_TEST_FILENAME = 'sfn-test.test.yaml'
export const DEFAULT_ASL_FILENAME = 'workflow.asl.json'

export const ASL_FILE_EXTENSION = '.asl.json'
export const MOCK_FILE_EXTENSION = '.mock.yaml'
export const TEST_FILE_EXTENSION = '.test.yaml'
export const METADATA_FILE_EXTENSION = '.metadata.json'

export const LAMBDA_VERSION_LATEST = '$LATEST'
