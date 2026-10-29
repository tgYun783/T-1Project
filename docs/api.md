# API 명세 (초안, 2026-10-29)

서버: NestJS, 3000번 포트에서 API(`/api/...`)와 프런트 정적 빌드를 함께 내준다. DB: MongoDB.
바탕: `docs/problem.yaml` features F1~F9, `docs/scenarios.yaml` S1~S6, `docs/interview-design.md`(모의면접 설계).
이 문서는 Agent(백엔드)가 쓴 기술 초안이다. 제품 결정이 아직 없는 곳은 「학생 답 대기」로 표시했다.

## 0. Agent가 정한 기술 선택 (바꾸려면 여기만 고치면 됨)

| 항목 | 선택 | 이유 |
| --- | --- | --- |
| 인증 | 로그인 시 서버 세션 + `HttpOnly` 쿠키. 토큰을 프런트 저장소에 두지 않음 | E2E가 쿠키만으로 로그인 유지 가능, 상대 경로 규칙과 충돌 없음 |
| 경로 | 모든 API는 `/api/` 아래, 상대 경로. `/__health`만 예외 | 주최 측 실행이 호스트 포트를 바꿔 끼움 |
| 이력서 | 사용자당 1개(항목 목록을 갈아 끼움) | F2 "내 이력서" 단수. 여러 개가 필요하면 학생 답 대기 |
| 자기소개서 | 사용자당 여러 개 | F4 학생 답 |
| ID | MongoDB ObjectId 문자열 | — |
| 시각 | ISO 8601 UTC 문자열 | — |
| 오류 형식 | `{ "error": { "code": "...", "message": "..." } }` | 프런트가 code로 분기, message는 그대로 표시 가능 |
| AI 호출 | 서버만 `AI_GATEWAY_API_KEY`로 Vercel AI Gateway 호출. 키 없음·실패 → 각 API의 실패 규칙대로 | 03-delivery 규칙 |
| 음성 | 전사·TTS도 서버 경유(`/api/speech/...`) | 키가 프런트에 나가지 않음 |

## 1. 공통

- 인증 필요 API에 세션 없음 → `401 { code: "UNAUTHENTICATED" }`.
- 남의 자원 → `404 { code: "NOT_FOUND" }` (존재 여부를 숨김).
- 검증 실패 → `400 { code: "VALIDATION", message, details?: [{ field, reason }] }`.
- AI 실패 → `502 { code: "AI_UNAVAILABLE" }` (키 없음 포함). 앱은 키가 비어도 기동한다.
- 없는 경로 → `404` (500 아님). API 외 경로는 프런트 `index.html`로 보내되, `/api/*`·`/__health`는 제외.
- 오류 코드 목록: `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION`, `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `AI_UNAVAILABLE`, `INTERVIEW_FINISHED`, `INTERVIEW_LIMIT`, `EMPTY_TRANSCRIPT`, `COVER_LETTER_NOT_FINAL`, `SUGGESTION_STALE`.

## 2. 상태 확인

### `GET /__health`
인증·리다이렉트 없음. `Cache-Control: no-store`.
```json
200 { "releaseId": "<빌드 인자 RELEASE_ID 전체 SHA>" }
```
DB 연결 여부와 무관하게 서버가 떠 있으면 200. (DB 상태는 `GET /api/health/db`로 따로 봄, 선택.)

## 3. 인증 (F1)

### `POST /api/auth/signup`
```json
요청 { "email": "a@b.com", "password": "8자 이상" }
201  { "user": { "id", "email", "role": "취준생", "createdAt" } }   // 세션 쿠키 발급(가입 즉시 로그인)
400  VALIDATION / 409 EMAIL_TAKEN
```
### `POST /api/auth/login`
```json
요청 { "email", "password" }
200  { "user": {...} }           // 세션 쿠키 발급
401  INVALID_CREDENTIALS
```
### `POST /api/auth/logout` → `204`, 쿠키 삭제.
### `GET /api/auth/me` → `200 { "user": {...} }` / `401`.

시드 계정: 기동 시 `SEED_USER_EMAIL`/`SEED_USER_PASSWORD`로 취준생 1명을 만든다(이미 있으면 건너뜀). 비밀번호는 해시 저장.

## 4. 이력서 (F2)

이력서 = **기본 텍스트** 하나(가진 이력서 내용을 텍스트 폼에 입력, 필수). 9개 항목은 이력서 입력이 아니라 **자소서 생성 때 문항 선택**에 쓴다. (학생 답 2026-10-30)

템플릿 항목 키(고정 9개): `intro_1min`, `job_success`, `job_preparation`, `motivation`, `aspiration`, `personality`, `crisis`, `growth`, `teamwork`.
한글 이름: 1분 자기소개 / 직무 관련 성공경험 / 직무를 위해 준비한 사항 / 지원동기 / 입사 후 포부 / 성격의 장단점 / 위기 극복 경험 / 성장과정 / 팀워크 및 협업경험.

### `GET /api/resume/template`
```json
200 { "items": [ { "key": "intro_1min", "label": "1분 자기소개" }, ... 9개 ] }
```
### `GET /api/resume`
```json
200 { "resume": { "id", "baseText", "updatedAt" } | null }
```
### `PUT /api/resume`
```json
요청 { "baseText": "가진 이력서 내용" }
200  { "resume": {...} }
400  VALIDATION — baseText가 빈 문자열(공백만)
```
F2 완료 조건: 다시 접속해도 같은 기본 텍스트. 빈 저장은 경고(400)로 막힘.

## 5. 자기소개서 (F3, F4)

흐름(학생 답 2026-10-30): 9개 항목 중 고른 것마다 AI가 문항을 생성 → 수정 가능한 폼에서 **직접 수정 / AI 다듬기 / 완료**. 완료(`final`)된 자소서만 모의면접에 쓸 수 있다(Agent 기본값).
```json
CoverLetter {
  "id", "title",                      // title 없으면 "자기소개서 N"
  "status": "draft" | "final",
  "source": "generated" | "uploaded",
  "sections": [ { "key": "job_success", "label": "직무 관련 성공경험", "body": "..." } ],   // uploaded는 key "uploaded" 하나
  "resumeSnapshot": { "baseText" } | null,
  "revisions": [ { "at", "kind": "edit"|"refine"|"suggestion", "sectionKey"?, "before", "after" } ],
  "createdAt", "updatedAt"
}
```
### `GET /api/cover-letters` → `200 { "coverLetters": [ { id, title, source, createdAt, updatedAt } ] }` (최신순)
### `POST /api/cover-letters` (F4 등록)
```json
요청 { "title"?: string, "body": string }
201  { "coverLetter": { ..., "status": "final", "source": "uploaded", "sections": [ { "key": "uploaded", "label": "자기소개서", "body" } ] } }
400  VALIDATION — body가 비었거나 공백만
```
### `POST /api/cover-letters/generate` (F3 문항별 초안 생성)
```json
요청 { "title"?: string, "keys": ["job_success", "teamwork"] }     // 9개 템플릿 키 중 고른 것, 1개 이상
201  { "coverLetter": { ..., "status": "draft", "source": "generated", "sections": [고른 키마다 1개] } }
400  VALIDATION — keys 비었음·모르는 키·중복 / 이력서 없음·baseText 비었음
502  AI_UNAVAILABLE — 생성 실패. 저장하지 않음
```
AI 호출 1회로 고른 문항 전부를 받는다. 이력서에 없는 경험·성과는 넣지 않는다(프롬프트 `server/src/ai/prompts/cover-letter-draft.prompt.ts`).
### `PATCH /api/cover-letters/:id` (직접 수정)
```json
요청 { "title"?: string, "sections"?: [ { "key": "job_success", "body": "고친 글" } ] }
200  { "coverLetter": {...} }        // revisions에 edit 추가. final이었으면 draft로 돌아감
400  없는 key / 빈 body
```
### `POST /api/cover-letters/:id/refine` (AI 다듬기, 저장 안 함)
```json
요청 { "sectionKey": "job_success", "instruction"?: "200자 이내 지시(없으면 기본: 더 구체적이고 읽기 쉽게)" }
200  { "sectionKey", "before", "after" }   // 사용자가 적용하면 PATCH로 저장, 취소하면 버림
400  없는 sectionKey / instruction 200자 초과
502  AI_UNAVAILABLE
```
새 경험·수치를 만들어 내지 않는다(프롬프트 `cover-letter-refine.prompt.ts`).
### `POST /api/cover-letters/:id/finalize` (완료)
```json
200  { "coverLetter": { ..., "status": "final" } }
400  VALIDATION — 비어 있는 문항이 있음(details에 key)
```
### `GET /api/cover-letters/:id` → `200 { "coverLetter": {...} }` / `404`
### `DELETE /api/cover-letters/:id` → `204` (면접 세션이 참조하면 세션은 스냅샷을 가지므로 영향 없음). 필요 여부는 학생 답 대기.

## 6. 모의면접 (F5~F7)

```json
InterviewSession {
  "id", "coverLetterId", "coverLetterSnapshot": { title, body },
  "status": "in_progress" | "finished",
  "startedAt", "finishedAt" | null,
  "endReason": null | "user_end" | "question_limit" | "time_limit" | "all_done",
  "usedFallbackQuestions": false,          // 본질문 생성 실패 → 기본 템플릿 사용
  "limits": { "maxQuestions": 12, "maxMinutes": 12, "maxFollowUpsPerMain": 2 },
  "mainQuestions": [ { "id", "interviewer": "practical"|"executive", "order": 0..3, "purpose", "basisSentence", "text" } ],
  "turns": [ Turn ],                        // 질문·답변 기록(순서대로)
  "currentQuestion": Question | null        // in_progress일 때만
}
Question { "id", "kind": "main"|"follow_up", "mainQuestionId", "interviewer", "interviewerLabel": "실무 면접관"|"임원 면접관", "purpose", "text", "askedAt" }
Turn     { "question": Question, "answer": { "id", "text", "inputMode": "voice"|"text", "transcriptRaw"?: string, "answeredAt" } | null,
           "skipped": false, "checkState": "explained"|"needs_more"|"unknown"|null }
```
### `POST /api/interviews` (F5 시작)
```json
요청 { "coverLetterId" }                  // status가 final인 자소서만
201  { "interview": InterviewSession }     // currentQuestion = 첫 본질문. 질문 순서는 이때 랜덤으로 정해 저장
404  coverLetterId 없음
409  COVER_LETTER_NOT_FINAL — 아직 완료하지 않은 초안
```
처리: AI 호출 1회로 본질문 4개(실무 2·임원 2) 생성 → 실패 시 기본 질문 템플릿 4개 + `usedFallbackQuestions: true`(201로 정상 진행). 응답 시간 목표 10초 이내.
### `GET /api/interviews` → `200 { "interviews": [ { id, coverLetterTitle, status, startedAt, finishedAt, endReason } ] }` (F8 지난 결과 목록)
### `GET /api/interviews/:id` → `200 { "interview": InterviewSession }` (새로고침해도 같은 질문·순서)
### `POST /api/interviews/:id/answers` (F6 답변 제출)
```json
요청 { "questionId", "text": "확인·수정이 끝난 답변 글", "inputMode": "voice"|"text", "transcriptRaw"?: "전사 원문" }
200  { "interview": InterviewSession, "next": { "action": "follow_up"|"next_main"|"finished", "reason": "..." } }
400  VALIDATION — text 비었음 / questionId가 currentQuestion이 아님
409  INTERVIEW_FINISHED
```
처리(설계 6절): 답변 저장 → AI 호출 1회로 `{ decision, interviewer, reason, basis_answer_id, target_field, question }` 받음 → 서버 검사(꼬리질문 본질문당 ≤2, 전체 질문 ≤12, 존재하는 답변 ID) → 꼬리질문 생성 또는 다음 본질문 → 한도(12개·12분) 도달 시 `finished`.
AI 판단 실패 시 동작은 **학생 답 대기**(후보를 정하지 않음). 그때까지 서버는 `502 AI_UNAVAILABLE`로 답하고 답변은 저장해 둔다(재시도 가능).
### `POST /api/interviews/:id/skip` (F7 건너뛰기)
```json
요청 { "questionId" }
200  { "interview", "next": { "action": "next_main"|"finished" } }   // 현재 본질문 주제를 닫고 다음 본질문으로
```
### `POST /api/interviews/:id/end` (F7 종료)
```json
200  { "interview": { ..., "status": "finished", "endReason": "user_end" }, "result": Result }
```
질문 다시 듣기·전사 재시도는 서버 상태를 바꾸지 않으며 질문 수에 넣지 않는다.

## 7. 음성 (F6 전사, F5 TTS)

### `POST /api/speech/transcribe`
`multipart/form-data`: `audio` (webm/ogg/wav, 최대 25MB·최대 길이는 3단계에서 정함), `interviewId`(소유 검사용).
```json
200  { "text": "전사 결과" }
400  EMPTY_TRANSCRIPT — 전사 결과가 비었음 → 프런트는 "다시 말하기" 안내(F6 학생 답)
502  AI_UNAVAILABLE
```
Gateway의 OpenAI 전사 모델 사용. 모델 이름은 Gateway 목록 확인 뒤 설정값으로(코드에 박지 않음). 오디오는 저장하지 않는다(전사 원문만 `transcriptRaw`로 저장).
### `GET /api/speech/tts?interviewId=&questionId=`
질문 글을 음성으로. `200 audio/mpeg`(스트리밍). 실패 시 `502` — 프런트는 글자 질문만 보여 주고 진행(테스트 브라우저에는 소리가 없음).

## 8. 면접 결과와 자기소개서 보완 (F8)

```json
Result {
  "interviewId",
  "transcript": [ Turn ],                                   // (1) 질문·답변 기록(면접관·목적 포함)
  "clarifiedExperiences": [ { "field": "role"|"reason"|"result", "text", "basisAnswerId" } ],   // (2)
  "openItems": [ { "text", "basisQuestionId" } ],          // (3) 최대 3개
  "suggestions": [ { "id", "original": "자소서 문장", "proposed": "바꿀 문장", "why", "status": "pending"|"accepted"|"rejected" } ]  // (4)
}
```
종합 점수 필드는 없다.
### `GET /api/interviews/:id/result` → `200 { "result": Result }` (finished일 때. in_progress면 `409`)
결과 생성: 종료 시 AI 호출 1회로 (2)(3)(4)를 만들어 저장. 실패하면 (1)만 있고 `suggestions: []`, `resultStatus: "partial"`로 저장(결과 화면은 열림).
### `POST /api/interviews/:id/suggestions/:sid/accept`
```json
200  { "suggestion": { ..., "status": "accepted" }, "coverLetter": { ...바뀐 본문 } }
```
처리: 해당 자기소개서 본문에서 `original` 문장을 `proposed`로 바꿔 저장(원문이 더 이상 없으면 `409`와 안내). 수정 이력에 남김.
### `POST /api/interviews/:id/suggestions/:sid/reject` → `200 { "suggestion": { "status": "rejected" } }` 본문은 그대로.

## 9. 카메라 (F9)
서버 API 없음. 프런트가 `getUserMedia`로 미리보기만 보여 주고, 권한 거부·장치 없음이면 검은 화면.

## 10. 시드 데이터 (docker 첫 기동)

취준생 계정 1개(`SEED_USER_EMAIL`/`SEED_USER_PASSWORD`) → 이력서 1개(`job_success`, `teamwork` 2항목) → 자기소개서 1개(`source: uploaded`, 제목 "시드 자기소개서") → 끝난 면접 세션 1개(`endReason: user_end`, 본질문 4·답변 2, `suggestions` 1개 `pending`, 원문 문장은 시드 자기소개서에 실제로 있는 문장). S2~S6이 이 데이터만으로 돈다. 이미 있으면 다시 만들지 않는다.

## 11. 흐름 ↔ API 대응

| 흐름 | 호출 순서 |
| --- | --- |
| S1 | `POST /api/auth/signup` |
| S2 | `PUT /api/resume` → `GET /api/resume` |
| S3 | `GET /api/resume/template` → `POST /api/cover-letters/generate` → `PATCH /api/cover-letters/:id`(직접 수정) → `POST .../finalize` → `GET /api/cover-letters` |
| S4 | `POST /api/cover-letters` → `GET /api/cover-letters` → `GET /api/cover-letters/:id` |
| S5 | `GET /api/cover-letters` → `POST /api/interviews` → `POST /api/interviews/:id/answers`(text) → `POST /api/interviews/:id/end` → `GET /api/interviews/:id/result` |
| S6 | `GET /api/interviews` → `GET /api/interviews/:id/result` → `POST .../suggestions/:sid/accept` → `GET /api/cover-letters/:id` |

## 12. 비용 메모 (팀 예산 $10)

면접 1회 = 본질문 생성 1 + 답변마다 1(최대 12) + 결과 1 = 최대 14회 LLM 호출 + 전사·TTS. 호출마다 대화 전체 대신 확인 상태와 최근 답변만 넘긴다(설계 9절). E2E는 S3·S5에서만 AI를 부르고 S5는 답변 1회로 끝낸다.
