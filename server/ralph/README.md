# 백엔드 랄프 루프 (역할 분리)

위키 「ralph-루프-설계-지침」(2026-10-20) 8절대로, 한 반복에 **주장(C) 하나 × 역할 하나**만 돈다.
역할은 서로 다른 `claude -p` 프로세스이고 권한은 `--allowedTools`로 막는다.

| 역할 | 하는 일 | 쓸 수 있는 파일 | 산출물 |
| --- | --- | --- | --- |
| verify | 명세의 주장 하나를 코드·테스트로 판정. 틀리면 수정 제안만 | `ralph/reviews/` | `reviews/<C>.md` 첫 줄 `VERDICT: PASS` 또는 `FAIL` |
| fix | 제안만 코드에 반영하고 커밋. 검색·명세 수정 금지 | `server/src`, `server/test`, `server/package*.json`, `server/Dockerfile`, 루트 `docker-compose.yml`, `deploy/`, `README.md` | git 커밋 `ralph(fix C..): ...` |
| confirm | 수정 전 스냅샷과 diff해 제안·명세와 맞는지 검사. 수정 금지 | `ralph/confirms/` | `confirms/<C>-<n>.md` 첫 줄 `CONFIRM: OK` 또는 `REJECT` |

다음 역할은 `check.mjs`가 ledger 상태로 고른다(fix > confirm > verify). 상태 흐름:
`todo → (verify) pass | fail → (fix) fixed → (confirm) OK→todo(재검증) | REJECT→fail(fixCount+1)`. fixCount > 3 → `blocked`, `BLOCKED.md` 작성 후 멈춤.

## 모델
기본은 세 역할 모두 `opus`(사용량 한도 보호). 바꾸려면 `VERIFY_MODEL=fable server/ralph/ralph.sh`처럼 환경변수로. 사용량 한도·인증 오류가 로그에 보이면 루프는 ledger를 건드리지 않고 멈춘다(exit 3). 한도가 풀리면 같은 명령으로 다시 돌린다.

## 흐름(2단계부터)
`todo → verify → fail → fix → fixed → confirm(Sonnet) → OK면 pass`. 단계의 모든 주장이 pass면 **스윕**(새 세션 Opus가 그 단계 주장 전부 재검증, 최대 2회) → FAIL만 다시 fix → confirm. 검사와 docker 확인은 스윕에서 한 번만.

## 돌리는 법 (저장소 루트에서)
```bash
node server/ralph/check.mjs load 01        # 명세 01의 주장을 ledger에 적재(이미 있으면 건너뜀)
server/ralph/ralph.sh                      # 상한 = 주장 수 × 4 + 2. 인자로 바꿀 수 있음: ralph.sh 30
node server/ralph/check.mjs status         # 현재 상태 표
```
끝나면 `logs/summary.csv`와 `reviews/`를 보고 PR을 올린다. `BLOCKED.md`가 생기면 사람이 읽고 명세·표지판을 고친 뒤 `node check.mjs unblock C1-3`로 다시 연다.

## 여러 단계 이어 돌리기
`server/ralph/run-stages.sh 02 03 04 05 06 07` — 단계마다 적재 → 루프. 하나라도 멈추면(BLOCKED·권한·한도·상한) 거기서 끝난다. 단계는 서로 의존하므로 병렬로 돌리지 않는다(같은 ledger·git, 위키 지침 20번).

## 사람이 하는 일
- 명세(`specs/`)와 결정은 루프 전에 끝낸다. 루프 중 제품 결정이 필요하면 verify가 FAIL 사유에 "결정 필요"라고 쓰고, 사람이 명세를 고친다.
- 실패 패턴이 보이면 `AGENT.md`에 규칙 한 줄을 더한다(표지판). 상태 보고는 적지 않는다.
- 비싼 검증(docker build)은 주장에 `docker: true`가 붙은 것만 verify가 돌린다.
