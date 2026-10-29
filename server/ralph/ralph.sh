#!/usr/bin/env bash
# 백엔드 역할 분리 랄프 루프. 저장소 루트에서 실행된다. 사용법: server/ralph/ralph.sh [최대 반복 수]
set -u
cd "$(dirname "$0")/../.." || exit 1
R=server/ralph
CLAIMS=$(node $R/check.mjs count)
DEFAULT_MAX=$(( CLAIMS * 4 + 2 ))              # 위키 관찰: 상한은 주장 수 × 3보다 크게
MAX="${1:-$DEFAULT_MAX}"
mkdir -p $R/logs $R/reviews $R/confirms
# 역할별 모델. verify·fix·sweep은 opus, confirm(diff 대조)은 sonnet. 바꾸려면 환경변수로: VERIFY_MODEL=fable server/ralph/ralph.sh
VERIFY_MODEL="${VERIFY_MODEL:-opus}"; FIX_MODEL="${FIX_MODEL:-opus}"; CONFIRM_MODEL="${CONFIRM_MODEL:-sonnet}"; SWEEP_MODEL="${SWEEP_MODEL:-opus}"
echo "주장 ${CLAIMS}개, 최대 반복 ${MAX}"

# npm은 저장소 루트에서 `npm --prefix server ...` 또는 `cd server && npm ...` 형태만 허용(규칙은 명령 앞부분 일치).
COMMON=(Read Glob Grep "Bash(ls:*)" "Bash(cat:*)" "Bash(npm --prefix server:*)" "Bash(cd server && npm:*)" "Bash(npm run:*)" "Bash(npm test:*)" "Bash(npm ci:*)" "Bash(npm install:*)" "Bash(git status:*)" "Bash(git diff:*)" "Bash(git log:*)" "Bash(git show:*)")
VERIFY_TOOLS=("${COMMON[@]}" "Edit($R/reviews/*)" "Bash(docker compose:*)" "Bash(curl:*)" "Bash(sleep:*)")
FIX_TOOLS=("${COMMON[@]}" Write Edit "Bash(npx nest:*)" "Bash(cd server && npx:*)" "Bash(mkdir:*)" "Bash(git add:*)" "Bash(git commit:*)")
FIX_DENY=("Edit($R/**)" "Edit(docs/**)" "Edit(frontend/**)" "Edit(e2e/**)" WebSearch WebFetch)
CONFIRM_TOOLS=("${COMMON[@]}" "Edit($R/confirms/*)")

for i in $(seq 1 "$MAX"); do
  NEXT=$(node $R/check.mjs next)
  case "$NEXT" in
    COMPLETE) echo "=== 모든 주장 pass. $((i-1))회에서 끝. ==="; node $R/check.mjs status; exit 0 ;;
    BLOCKED)  echo "=== BLOCKED.md 확인 후 사람이 판단하세요. ==="; exit 1 ;;
  esac
  ROLE=${NEXT%% *}; CID=${NEXT##* }
  if [ "$ROLE" = sweep ]; then
    start=$(date +%s)
    STAGE=$(node -e "const l=require('./$R/ledger.json');console.log(l.stage)")
    CLAIMS_JSON=$(node -e "const l=require('./$R/ledger.json');console.log(JSON.stringify(l.claims.filter(c=>c.spec===l.stage).map(c=>({id:c.id,title:c.title,docker:c.docker}))))")
    echo ""; echo "=== 반복 $i/$MAX  역할=sweep(단계 끝 재검증)  명세=$STAGE  ($(date +%H:%M:%S)) ==="
    PROMPT="$(cat $R/prompts/sweep.md)

## 이번 단계의 주장 전부
$CLAIMS_JSON

## 읽을 파일(이 순서로)
1. $R/AGENT.md
2. $R/specs/$STAGE
3. docs/api.md (해당 절만)"
    claude -p "$PROMPT" --model "$SWEEP_MODEL" --permission-mode default --allowedTools "${VERIFY_TOOLS[@]}" 2>&1 | tee "$R/logs/$i-sweep.log"
    if grep -qiE "requested permissions|permission (was )?denied|denied for approval|haven.t granted" "$R/logs/$i-sweep.log"; then echo "=== 권한 거부로 멈춤: $R/logs/$i-sweep.log ==="; exit 4; fi
    RESULT=$(node $R/check.mjs after sweep ALL)
    secs=$(( $(date +%s) - start ))
    echo "--- $RESULT | ${secs}초"; echo "$i,sweep,$STAGE,\"$RESULT\",$secs" >> $R/logs/summary.csv
    continue
  fi
  SPEC=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').spec)")
  CLAIM=$(node -e "const l=require('./$R/ledger.json');const c=l.claims.find(c=>c.id==='$CID');console.log(JSON.stringify(c))")
  start=$(date +%s)
  echo ""; echo "=== 반복 $i/$MAX  역할=$ROLE  주장=$CID  ($(date +%H:%M:%S)) ==="

  PROMPT="$(cat $R/prompts/$ROLE.md)

## 이번 주장
$CLAIM

## 읽을 파일(이 순서로)
1. $R/AGENT.md
2. $R/specs/$SPEC
3. docs/api.md (해당 절만)"

  case "$ROLE" in
    verify)
      claude -p "$PROMPT" --model "$VERIFY_MODEL" --permission-mode default --allowedTools "${VERIFY_TOOLS[@]}" 2>&1 | tee "$R/logs/$i-verify-$CID.log" ;;
    fix)
      node $R/check.mjs before fix "$CID" >/dev/null
      PROMPT="$PROMPT
4. $R/reviews/$CID.md (반영할 제안)"
      claude -p "$PROMPT" --model "$FIX_MODEL" --permission-mode acceptEdits --allowedTools "${FIX_TOOLS[@]}" --disallowedTools "${FIX_DENY[@]}" 2>&1 | tee "$R/logs/$i-fix-$CID.log" ;;
    confirm)
      SNAP=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').snapshot)")
      N=$(node -e "const l=require('./$R/ledger.json');console.log(l.claims.find(c=>c.id==='$CID').fixCount+1)")
      PROMPT="$PROMPT
4. $R/reviews/$CID.md (제안)
5. 수정 전 스냅샷 commit: $SNAP — 'git diff $SNAP..HEAD -- server docker-compose.yml deploy README.md'로 변경을 본다
6. 결과 파일 이름: $R/confirms/$CID-$N.md"
      claude -p "$PROMPT" --model "$CONFIRM_MODEL" --permission-mode default --allowedTools "${CONFIRM_TOOLS[@]}" 2>&1 | tee "$R/logs/$i-confirm-$CID.log" ;;
  esac

  # 권한 거부는 도구 설정 문제다. ledger를 건드리지 않고 멈춘다(허용 규칙을 고친 뒤 다시 실행).
  if grep -qiE "requested permissions|permission (was )?denied|denied for approval|haven.t granted" "$R/logs/$i-$ROLE-$CID.log"; then
    echo "=== 권한 거부가 있어 멈춥니다. 로그: $R/logs/$i-$ROLE-$CID.log. ralph.sh의 허용 규칙을 고친 뒤 다시 실행하세요. ==="
    exit 4
  fi
  # verify·confirm이 판정 파일을 안 썼으면 도구 문제로 보고 멈춘다(코드 실패로 세지 않음).
  if [ "$ROLE" = verify ] && ! head -1 "$R/reviews/$CID.md" 2>/dev/null | grep -q "^VERDICT: "; then
    echo "=== verify가 $R/reviews/$CID.md 첫 줄에 VERDICT를 쓰지 않았어요. 로그를 보고 프롬프트·권한을 고친 뒤 다시 실행하세요. ==="
    exit 5
  fi
  if [ "$ROLE" = confirm ] && ! head -1 "$R/confirms/$CID-$N.md" 2>/dev/null | grep -q "^CONFIRM: "; then
    echo "=== confirm이 $R/confirms/$CID-$N.md 첫 줄에 CONFIRM을 쓰지 않았어요. 로그를 보고 프롬프트·권한을 고친 뒤 다시 실행하세요. ==="
    exit 5
  fi
  # 사용량 한도·인증 오류는 작업 실패가 아니다. ledger를 건드리지 않고 멈춘다(사람이 나중에 다시 실행).
  if grep -qiE "usage limit|rate limit|limit reached|out of.*(quota|credits)|429|not logged in|authentication" "$R/logs/$i-$ROLE-$CID.log"; then
    echo "=== 사용량 한도 또는 인증 오류로 보여 멈춥니다. 로그: $R/logs/$i-$ROLE-$CID.log. 한도가 풀리면 같은 명령으로 다시 실행하세요. ==="
    exit 3
  fi
  RESULT=$(node $R/check.mjs after "$ROLE" "$CID")
  secs=$(( $(date +%s) - start ))
  echo "--- $RESULT | ${secs}초"
  echo "$i,$ROLE,$CID,\"$RESULT\",$secs" >> $R/logs/summary.csv
done
echo "=== 최대 반복 수($MAX) 도달. check.mjs status로 남은 주장을 보세요. ==="
node $R/check.mjs status
exit 1
