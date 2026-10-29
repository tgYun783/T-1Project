# 명세 05 — 모의면접 F5·F6(글자)·F7 (단계 5)
바탕: docs/api.md 6절, docs/interview-design.md 2~6절. 기본값: 답변 판단 실패 → 답변 저장 + 502(재시도 가능).

## 결정
- 모델 `InterviewSession`(api.md 6절 구조 그대로). 한도는 설정 `INTERVIEW_MAX_QUESTIONS=12`, `INTERVIEW_MAX_MINUTES=12`, `INTERVIEW_MAX_FOLLOWUPS=2`.
- 본질문 생성: AiModule 1회 호출, JSON 응답을 zod로 검증(4개, 실무 2·임원 2, purpose·basisSentence·text). 실패·형식 오류 → `server/src/interview/fallback-questions.ts`의 기본 4개 + `usedFallbackQuestions:true`.
- 답변 판단: AiModule 1회, 응답 `{decision, interviewer, reason, basis_answer_id, target_field, question}` zod 검증. 서버 검사: 꼬리질문 수·전체 수·시간·답변 id 존재. 위반이면 AI 판단을 무시하고 다음 본질문으로.
- 질문 순서는 세션 생성 때 셔플해 저장(새로고침 불변).
- **프롬프트 분리**: 본질문 생성·답변 판단 프롬프트는 `server/src/ai/prompts/interview-questions.prompt.ts`, `interview-judge.prompt.ts`에 둔다(04 규칙과 같음). 응답 JSON 형식 지시도 프롬프트 파일 안에.

## 완료 기준
- [ ] C5-1: `POST /api/interviews` {coverLetterId} → 201, `mainQuestions` 4개(실무 2·임원 2), `currentQuestion`이 첫 본질문, `status:in_progress`. 남의 자소서 → 404. AI 실패 시 fallback 4개 + `usedFallbackQuestions:true`로 201.
- [ ] C5-2: `GET /api/interviews/:id`를 두 번 불러도 질문·순서가 같다. `GET /api/interviews`는 내 세션 목록(최신순, 필드 api.md).
- [ ] C5-3: `POST /api/interviews/:id/answers` {questionId,text,inputMode} → 답변 저장, AI 판단 결과에 따라 `next.action`이 `follow_up`(꼬리질문이 currentQuestion, 같은 면접관) 또는 `next_main`. questionId ≠ currentQuestion → 400. text 공백 → 400. finished 세션 → 409 INTERVIEW_FINISHED.
- [ ] C5-4: 한도 검사 — 본질문당 꼬리질문 2개를 썼으면 AI가 follow_up을 내도 next_main. 전체 질문 12개 또는 시작 후 12분 도달 → `finished`, `endReason` `question_limit`/`time_limit`. 마지막 본질문 끝 → `all_done`. 테스트는 시간을 주입(clock mock).
- [ ] C5-5: `POST /api/interviews/:id/skip` → 현재 본질문 주제를 닫고 next_main(마지막이면 finished). `POST /api/interviews/:id/end` → `finished`, `endReason:"user_end"`, 응답에 `result`(6단계 전까지는 transcript만).
- [ ] C5-6: 답변 판단 AI 실패 → 답변은 저장되고 502 AI_UNAVAILABLE. 같은 questionId로 다시 보내면 중복 저장 없이 재판단한다.
