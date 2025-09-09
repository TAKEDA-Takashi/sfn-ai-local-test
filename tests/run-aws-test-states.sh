#!/bin/bash

# AWS Test States API実行スクリプト
# 
# 使用方法:
#   ./tests/run-aws-test-states.sh                    # すべてのテストを実行
#   ./tests/run-aws-test-states.sh test-jsonata       # 特定のテストを実行

set -e

FIXTURES_DIR="tests/fixtures/aws-test-states"
SPECIFIC_TEST=""

# 引数解析
for arg in "$@"; do
    if [[ ! "$arg" =~ ^-- ]]; then
        SPECIFIC_TEST="$arg"
    fi
done

# 色付き出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 AWS Test States API Runner${NC}"
echo "=================================================="

# AWS CLIの確認
if ! command -v aws &> /dev/null; then
    echo -e "${RED}❌ AWS CLI is not installed${NC}"
    exit 1
fi

# AWS認証の確認
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}❌ AWS credentials not configured${NC}"
    exit 1
fi

echo -e "${GREEN}✅ AWS CLI configured${NC}"
echo

# テストファイルの取得
if [ -n "$SPECIFIC_TEST" ]; then
    TEST_FILES=$(find "$FIXTURES_DIR" -name "*${SPECIFIC_TEST}*.json" -not -name "*input*" | sort)
else
    TEST_FILES=$(find "$FIXTURES_DIR" -name "test-*.json" -not -name "*input*" | sort)
fi

if [ -z "$TEST_FILES" ]; then
    echo -e "${RED}❌ No test files found${NC}"
    exit 1
fi

# 結果カウンター
PASSED=0
FAILED=0
ERRORS=0
LOCAL_MISMATCH=0

# 各テストファイルを実行
for TEST_FILE in $TEST_FILES; do
    TEST_NAME=$(basename "$TEST_FILE" .json)
    echo -e "${YELLOW}▶️  Running: $TEST_NAME${NC}"
    
    # すべてのテストがインライン値を使用
    INPUT_JSON='{}'
    echo "   📝 Using inline test values"
    
    # AWS test-states APIを実行（レート制限対策のため少し待機）
    sleep 0.5
    
    OUTPUT_FILE="/tmp/${TEST_NAME}-output.json"
    ERROR_FILE="/tmp/${TEST_NAME}-error.txt"
    
    if aws stepfunctions test-state \
        --definition "file://$TEST_FILE" \
        --input "$INPUT_JSON" \
        --output json > "$OUTPUT_FILE" 2> "$ERROR_FILE"; then
        
        # 成功
        RESULT=$(cat "$OUTPUT_FILE")
        STATUS=$(echo "$RESULT" | jq -r '.status')
        
        if [ "$STATUS" = "SUCCEEDED" ]; then
            echo -e "   ${GREEN}✅ AWS PASSED${NC}"
            ((PASSED++))
            
            # ローカル実行と比較
            echo -n "   🔄 Comparing with local execution... "
            
            # ローカル実行（エラーをキャプチャ）
            LOCAL_OUTPUT=""
            LOCAL_ERROR=""
            
            # 入力ファイルがある場合はそれを使用、無い場合は一時ファイルを作成
            TEMP_INPUT_FILE=""
            if [ -n "$INPUT_FILE" ]; then
                TEMP_INPUT_FILE="$INPUT_FILE"
            else
                TEMP_INPUT_FILE="/tmp/test-input-$$.json"
                echo "$INPUT_JSON" > "$TEMP_INPUT_FILE"
            fi
            
            if LOCAL_RESULT=$(npx tsx tests/run-local-test.mjs "$TEST_FILE" "$TEMP_INPUT_FILE" 2>&1); then
                LOCAL_OUTPUT="$LOCAL_RESULT"
            else
                LOCAL_ERROR="$LOCAL_RESULT"
            fi
            
            # 一時ファイルを削除
            if [ "$TEMP_INPUT_FILE" = "/tmp/test-input-$$.json" ]; then
                rm -f "$TEMP_INPUT_FILE"
            fi
            
            AWS_OUTPUT=$(echo "$RESULT" | jq '.output')
            
            if [ -n "$LOCAL_ERROR" ]; then
                echo -e "${RED}Local execution failed${NC}"
                echo "   ${RED}Error: $(echo "$LOCAL_ERROR" | grep ERROR: | sed 's/ERROR://')${NC}"
                ((LOCAL_MISMATCH++))
            else
                # Normalize JSON for comparison
                # AWS output might be a JSON string or a JSON object
                if echo "$AWS_OUTPUT" | jq -e 'type == "string"' > /dev/null 2>&1; then
                    # If it's a string, parse it as JSON and sort keys
                    AWS_OUTPUT_NORMALIZED=$(echo "$AWS_OUTPUT" | jq -r '.' | jq -S -c '.')
                else
                    # If it's already an object, sort keys and compact it
                    AWS_OUTPUT_NORMALIZED=$(echo "$AWS_OUTPUT" | jq -S -c '.')
                fi
                LOCAL_OUTPUT_NORMALIZED=$(echo "$LOCAL_OUTPUT" | jq -S -c '.')
                
                # Special handling for tests with random/UUID values
                NEEDS_SPECIAL_CHECK=false
                if echo "$TEST_NAME" | grep -qE "random|uuid"; then
                    NEEDS_SPECIAL_CHECK=true
                fi
                
                if [ "$NEEDS_SPECIAL_CHECK" = true ]; then
                    # For random/UUID tests, check structure and data types instead of exact values
                    AWS_KEYS=$(echo "$AWS_OUTPUT" | jq -r '.' | jq -r 'keys | .[]' 2>/dev/null | sort)
                    LOCAL_KEYS=$(echo "$LOCAL_OUTPUT" | jq -r 'keys | .[]' 2>/dev/null | sort)
                    
                    if [ "$AWS_KEYS" = "$LOCAL_KEYS" ]; then
                        # Check if values have the expected format
                        VALID=true
                        
                        if echo "$TEST_NAME" | grep -q "uuid"; then
                            # Check if all values are valid UUIDs (36 chars with hyphens)
                            for key in $(echo "$LOCAL_OUTPUT" | jq -r 'keys | .[]'); do
                                VALUE=$(echo "$LOCAL_OUTPUT" | jq -r ".$key")
                                if ! echo "$VALUE" | grep -qE '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'; then
                                    VALID=false
                                    break
                                fi
                            done
                        elif echo "$TEST_NAME" | grep -q "random"; then
                            # Check if all values are numbers within expected ranges
                            for key in $(echo "$LOCAL_OUTPUT" | jq -r 'keys | .[]'); do
                                VALUE=$(echo "$LOCAL_OUTPUT" | jq ".$key")
                                # Check if it's a number
                                if ! echo "$VALUE" | jq -e 'type == "number"' > /dev/null 2>&1; then
                                    VALID=false
                                    break
                                fi
                            done
                        fi
                        
                        if [ "$VALID" = true ]; then
                            echo -e "${GREEN}✅ Match (structure & format)${NC}"
                        else
                            echo -e "${YELLOW}⚠️  Format mismatch${NC}"
                            ((LOCAL_MISMATCH++))
                        fi
                    else
                        echo -e "${YELLOW}⚠️  Structure mismatch${NC}"
                        ((LOCAL_MISMATCH++))
                    fi
                elif [ "$LOCAL_OUTPUT_NORMALIZED" = "$AWS_OUTPUT_NORMALIZED" ]; then
                    echo -e "${GREEN}✅ Match${NC}"
                else
                    echo -e "${YELLOW}⚠️  Mismatch${NC}"
                    echo "   AWS:   $AWS_OUTPUT"
                    echo "   Local: $LOCAL_OUTPUT"
                    ((LOCAL_MISMATCH++))
                fi
            fi
        else
            echo -e "   ${RED}❌ FAILED - Status: $STATUS${NC}"
            ((FAILED++))
            echo "$RESULT" | jq '.error' 2>/dev/null || echo "$RESULT"
        fi
    else
        # エラー
        echo -e "   ${RED}❌ ERROR${NC}"
        ((ERRORS++))
        cat "$ERROR_FILE"
    fi
    
    echo
done

# サマリー
echo "=================================================="
echo -e "${BLUE}📊 Test Summary${NC}"
echo "--------------------------------------------------"
echo -e "${GREEN}✅ AWS Passed: $PASSED${NC}"
echo -e "${RED}❌ AWS Failed: $FAILED${NC}"
if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}💥 AWS Errors: $ERRORS${NC}"
fi
if [ $LOCAL_MISMATCH -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Local Mismatches: $LOCAL_MISMATCH${NC}"
fi

TOTAL=$((PASSED + FAILED + ERRORS))
echo -e "${BLUE}📈 AWS Success Rate: $((PASSED * 100 / TOTAL))%${NC}"

if [ $PASSED -gt 0 ]; then
    LOCAL_MATCH=$((PASSED - LOCAL_MISMATCH))
    echo -e "${BLUE}🔄 Local Match Rate: $((LOCAL_MATCH * 100 / PASSED))%${NC}"
fi

# 終了コード
if [ $FAILED -gt 0 ] || [ $ERRORS -gt 0 ] || [ $LOCAL_MISMATCH -gt 0 ]; then
    exit 1
fi

echo -e "\n${GREEN}✨ All tests passed and matched!${NC}"