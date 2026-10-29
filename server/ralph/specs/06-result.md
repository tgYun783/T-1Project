# 명세 06 — 면접 결과·자기소개서 보완 F8, 시드 (단계 6)
바탕: docs/api.md 8·10절, interview-design.md 7절.

## 결정
- 결과 생성: 세션이 finished가 되는 순간 AiModule 1회로 (2) clarifiedExperiences (3) openItems ≤3 (4) suggestions를 만들어 세션에 저장. 실패 → `resultStatus:"partial"`, (1) transcript만.
- **프롬프트 분리**: 결과 생성 프롬프트는 `server/src/ai/prompts/interview-result.prompt.ts`(04 규칙과 같음).
- 수정 제안 승인: 자소서 `body`에서 `original`을 `proposed`로 1회 치환. 원문 없으면 409 `SUGGESTION_STALE`. 자소서에 수정 이력 `revisions:[{suggestionId, before, after, at}]`.

## 완료 기준
- [ ] C6-1: `GET /api/interviews/:id/result` → finished면 200 Result(api.md 8절 필드, 종합 점수 필드 없음), in_progress면 409.
- [ ] C6-2: 종료 시 결과 생성이 AI 실패여도 세션은 finished이고 result는 transcript + `suggestions:[]` + `resultStatus:"partial"`.
- [ ] C6-3: `POST .../suggestions/:sid/accept` → 자소서 본문 치환·revisions 추가·suggestion `accepted`, 응답에 바뀐 coverLetter. 원문이 본문에 없으면 409. `reject` → `rejected`, 본문 불변. 남의 세션 → 404.
- [ ] C6-4: 시드(1단계 C1-6 확장): 취준생 계정에 이력서 1개(`job_success`,`teamwork`), 자소서 1개(제목 "시드 자기소개서", `source:uploaded`, 본문에 제안 원문 문장 포함), 끝난 면접 1개(`endReason:user_end`, 본질문 4·답변 2, suggestions 1개 pending, 원문이 시드 자소서에 실제로 있음). 두 번 기동해도 1세트. docker 기동 뒤 `GET /api/interviews`(시드 로그인)에 1건이 보인다(테스트는 메모리 Mongo).
