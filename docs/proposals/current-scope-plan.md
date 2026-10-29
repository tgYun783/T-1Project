# 현재 범위 구현 계획 — 제안 (2026-10-30)

> **상태: 제안.** 담당자 확인 전이다. 기존 계획 문서(`README.md` 구현 설계, `docs/api.md`, `docs/develope/screen-spec.md`, `docs/backend-plan.md`, `server/ralph/specs/`, `frontend/`)는 **수정하지 않았다.**
> 랄프 루프가 읽는 계획서에 반영하는 일은 담당자와 조율한 뒤 한다.
> 모의면접(해법 3)은 보류/선택 유지 **결정 대기**다(`docs/scope-open-items.md` A). 이 문서는 모의면접을 넣지도 빼지도 않고, 현재 구현 범위만 다룬다.

## 0. 기준

- 현재 구현 범위: 경험 발굴·사실 확정 → 경험 기반 자소서 작성·등록 → 제출 전 점검(학생 답 2026-10-30)
- 제출 전 점검은 해법 2(자소서 빌더)의 확인 단계다(새 해법 아님).
- 근거: `docs/problem.yaml`의 `functional_spec` R1~R13·C1~C5. **`features`는 동결 중이라 이 계획과 대응하지 않는다**(확인사항 B, 미해결).

## 1. 요구사항 ↔ 계획 대응

| 요구사항 | 이름 | 화면(제안) | API(제안) | 흐름(제안) |
| --- | --- | --- | --- | --- |
| R1 | 회원가입·로그인 | `/signup`, `/login` (기존 화면 명세 2절) | 기존 `api.md` 3절 | S1 |
| R2 | 경험 등록(단서 선택) | `/experiences/new` | `POST /api/experiences` | S2 |
| R3 | 대화로 경험 꺼내기 | `/experiences/:id/chat` | `POST /api/experiences/:id/messages` | S2 |
| R4·R5 | 사실 확정·출처 표시 | `/experiences/:id/facts` | `POST /api/experiences/:id/fact-candidates`, `PUT /api/experiences/:id/facts` | S3 |
| R6 | 경험 카드 관리 | `/experiences`, `/experiences/:id` | `GET /api/experiences`, `GET/PATCH /api/experiences/:id` | S3 |
| R7 | 자기소개서 등록 | `/cover-letters/new` (기존 화면 명세 4-3) | 기존 `api.md` 5절 `POST /api/cover-letters` | S4 |
| R8 | 경험 기반 자소서 작성 | `/cover-letters/compose` | `POST /api/cover-letters/compose` | S5 |
| R13 | 문항별 응답과 근거 카드 | `/cover-letters/:id` | `POST /api/cover-letters/:id/items/:itemId/regenerate` | S6 |
| R9 | 주장 문장 고르기 | `/cover-letters/:id/check` | `POST /api/cover-letters/:id/checks` | S7 |
| R10·R11 | 문장 근거 묻기·문장별 결과 | `/checks/:checkId` | `POST /api/checks/:checkId/sentences/:sentenceId/answers` | S7 |
| R12 | 점검 사실을 경험 카드에 저장 | `/checks/:checkId` 결과 영역 | `POST /api/checks/:checkId/facts` | S8 |

제약: C1(확인하지 않은 AI 내용은 사실로 저장하지 않음), C2(AI 실패 시 에러·저장 안 함·재시도 버튼), C3(로그인 전에는 소개 페이지만), C4(점검 결과로 문장을 자동 수정하지 않음), C5(가설: 점검 때문에 준비 시간이 늘면 안 됨).

## 2. 사용자 흐름 전체

```
경험 등록(단서 선택) → 대화로 경험 꺼내기(항목 상태 실시간) → 사실 후보 확인·수정·삭제 → 경험 카드 저장
   → (A) 기존 자소서 등록  또는  (B) 경험 카드로 문항별 응답 작성 → 근거 카드 확인 → 카드 제외·보강 후 다시 만들기
   → 주장 문장 고르기 → 문장마다 근거 질문(흐리면 최대 3번 더) → 문장별 상태
   → 점검에서 나온 사실 확인 → 경험 카드에 추가
```

## 3. API 제안 (`docs/api.md` 1절 공통 규칙을 따름)

공통: 로그인 필요(없으면 `401 UNAUTHENTICATED`), 남의 자원은 `404 NOT_FOUND`, 검증 실패 `400 VALIDATION`, AI 실패 `502 AI_UNAVAILABLE`(C2: 저장하지 않음, 같은 요청을 다시 보내면 재시도).

### 3-1. 경험 (R2~R6)
- `POST /api/experiences` `{ title, period, clues?: [{ type: "text"|"award"|"photo"|"document", text?, fileId? }] }` → `201 { experience }`
- `GET /api/experiences` → 카드 목록(최신순). `GET /api/experiences/:id` → 카드·대화·사실.
- `POST /api/experiences/:id/messages` `{ text }` → AI 1회 → `200 { reply, itemStatus: { situation, role, action, result, meaning: "explained"|"needs_more"|"unknown" } }` (R3: 질문 상한 없음, 사용자가 멈춤)
- `POST /api/experiences/:id/fact-candidates` → AI 1회 → `200 { candidates: [{ id, field, text, source: "said"|"material"|"ai_suggested" }] }` (저장 안 함)
- `PUT /api/experiences/:id/facts` `{ facts: [{ field, text, source }] }` → 사용자가 확정한 것만 저장(C1). `ai_suggested`(미확인)는 저장하되 근거 사용 금지 표시(R5).
- `PATCH /api/experiences/:id` → 카드 수정(R6).

### 3-2. 자기소개서 (R7·R8·R13)
- 등록: 기존 `POST /api/cover-letters`(R7).
- `POST /api/cover-letters/compose` `{ company: { preferred, talent }, questions: [string], experienceIds: [id] }` → AI 1회 → `201 { coverLetter: { id, items: [{ itemId, question, answer, basisFactIds }] } }` (R8: 확정 사실만 사용, 카드에 없는 수치 금지)
- `POST /api/cover-letters/:id/items/:itemId/regenerate` `{ excludeExperienceIds?: [id] }` → AI 1회 → 해당 문항만 다시 만듦(R13, C4: 사용자가 요청할 때만)
- `PATCH /api/cover-letters/:id/items/:itemId` `{ answer }` → 사용자가 고친 응답 저장

### 3-3. 제출 전 점검 (R9~R12)
- `POST /api/cover-letters/:id/checks` → AI 1회 → `201 { check: { id, sentences: [{ sentenceId, text, kind: "number"|"result"|"role"|"evaluation", status: "pending" }] } }` (R9)
- `POST /api/checks/:checkId/sentences/:sentenceId/answers` `{ text }` → AI 1회(judge J1~J4) → `200 { next: { question } | null, status: "explained"|"needs_more"|"unknown", missing: ["J1".."J4"] }` (R10: 첫 질문 뒤 최대 3번, R11: 상한에 닿으면 다음 문장, 점수 없음)
- `GET /api/checks/:checkId` → 문장별 상태·질문·답변
- `POST /api/checks/:checkId/fact-candidates` → AI 1회 → 점검 답변에서 나온 사실 후보
- `POST /api/checks/:checkId/facts` `{ experienceId, facts: [...] }` → 사용자가 확인한 것만 카드에 추가(R12, C1). 자소서 문장은 바꾸지 않음(C4).

### 3-4. 정해야 할 것(결정 필요)
- 사진·문서 단서(R2)의 저장 위치: 배포 환경(Lightsail 컨테이너)에 영구 디스크가 없다(`docs/develope/backend-guide.md`). DB 저장, 외부 저장소, 텍스트만 받기 중 선택이 필요하다.
- 오류 본문 형식: `docs/api.md` 1절은 `{ code }`, `server/ralph/specs/01-skeleton.md` C1-3은 `{ error: { code, message } }`로 서로 다르다.

## 4. 화면 제안 (기존 화면 명세는 그대로 둠)

| 경로 | 내용 |
| --- | --- |
| `/` | 로그인 전 소개(C3) |
| `/experiences` | 경험 카드 목록, '경험 추가' |
| `/experiences/new` | 제목·대략적 시기, 단서(선택) |
| `/experiences/:id/chat` | AI 질문·내 답변, 오른쪽에 항목 상태(상황·역할·행동·결과·의의), '대화 끝내기' |
| `/experiences/:id/facts` | 사실 후보 목록(출처 표시), 확인·수정·삭제, '카드에 저장' |
| `/cover-letters` | 목록, '자기소개서 등록', '경험으로 작성' |
| `/cover-letters/compose` | 우대사항·인재상·문항 입력, 경험 카드 선택, '작성' |
| `/cover-letters/:id` | 문항별 응답과 근거 카드, 카드 빼기·보강, '다시 만들기', '제출 전 점검' |
| `/checks/:checkId` | 주장 문장 목록과 상태, 문장별 근거 질문·답변, 결과, '확인한 사실 카드에 저장' |

AI가 응답하는 동안 버튼은 잠그고, 실패하면 에러와 '다시 시도'를 보여 준다(C2).

## 5. 시드 데이터 제안 (흐름마다 독립적으로 돌도록)

취준생 계정 1개(`SEED_USER_EMAIL`/`SEED_USER_PASSWORD`, 기존 시드 그대로) →
- 경험 1개 "카페 아르바이트 재고 관리"(확정 사실 3개 이상, 출처 `said`)
- 경험 기반 자기소개서 1개(문항 1개, 근거 카드 1장, 수치가 들어간 주장 문장 1개 포함)
- 그 자기소개서의 점검 1개(주장 문장 1개, 상태 `pending`)

이미 있으면 다시 만들지 않는다. 문구는 시드 담당자가 정한다.

## 6. 흐름 초안 (제안 — `docs/scenarios.yaml`은 아직 바꾸지 않음)

| id | 제목(초안) | 쓰는 시드 | AI 호출 | E2E 상태 |
| --- | --- | --- | --- | --- |
| S1 | 취준생이 회원가입해 로그인 상태가 된다 | 없음 | 0 | 미구현(화면 없음) |
| S2 | 취준생이 경험을 등록하고 AI 질문에 답해 항목 상태가 바뀌는 것을 본다 | 계정 | 2(대화 1, 답 1) | 미구현(화면·API 없음) |
| S3 | 취준생이 사실 후보를 확인·수정해 경험 카드에 저장한다 | 경험 | 1 | 미구현(화면·API 없음) |
| S4 | 취준생이 이미 쓴 자기소개서를 붙여 넣어 등록한다 | 계정 | 0 | 미구현(화면 없음) |
| S5 | 취준생이 경험 카드로 문항 응답을 만들고 근거 카드를 확인한다 | 경험 카드 | 1 | 미구현(화면·API 없음) |
| S6 | 취준생이 근거 카드 하나를 빼고 응답을 다시 만든다 | 자소서 | 1 | 미구현(화면·API 없음) |
| S7 | 취준생이 주장 문장의 근거 질문에 답하고 문장 상태를 본다 | 점검 | 1~2 | 미구현(화면·API 없음) |
| S8 | 취준생이 점검에서 나온 사실을 확인해 경험 카드에 추가한다 | 점검 답변 | 1 | 미구현(화면·API 없음) |

- 흐름은 앞 흐름이 만든 데이터에 기대지 않고 5절 시드로 돈다(키트 규칙). 이어지는 과정(경험 → 카드 → 자소서 → 점검 → 카드 추가)은 S2~S8을 순서대로 보면 처음부터 끝까지 이어진다.
- 키트 제한: 흐름 최대 8개, 흐름 하나 1분 안. AI 호출이 2번 넘는 흐름은 응답 시간을 재 보고 나눌지 정한다.
- 모든 E2E는 화면·API 구현 후 실제 실행 결과(통과/실패 단계)로 이 표를 갱신한다.
- 해법 3이 선택 유지로 정해지면 모의면접 흐름이 필요하고 흐름 수(최대 8)를 다시 나눠야 한다.

## 7. `interview-engine/` 재사용 후보 (코드 확인 결과, 결정 대기)

| 파일 | 내용 | 점검(R9~R12)에 쓸 수 있나 |
| --- | --- | --- |
| `src/llm.ts` | AI Gateway 호출, JSON 스키마 검사, 오류 코드(no_key·budget·timeout 등), 추론 강도 | 그대로 쓸 수 있음. 모의면접에 의존하지 않음 |
| `src/store.ts`의 버전 번호 저장 | 두 번 제출 방지 | 패턴 재사용 가능 |
| `src/engine.ts`의 꼬리질문 검사·상태 갱신 | 상한·근거 답변 id·상태 3단계 | 개념은 R10·R11과 같지만 세션 구조(본질문·면접관·랜덤 순서)가 모의면접용이라 그대로는 맞지 않음 |
| `nest/`, 음성 관련 | 모의면접 API | 쓰지 않음 |

- 모의면접 세션·음성 처리는 현재 범위의 필수 의존성으로 두지 않는다.
- 재사용할 경우 `src/llm.ts`만 가져오고, 점검 로직은 `functional_spec` R10의 judge(J1~J4) 기준으로 새로 쓴다. 결정은 코드 담당자와 정한다.

## 8. 담당자와 조율할 것

| 담당 | 지금 계획 | 이 제안과 다른 점 |
| --- | --- | --- |
| 백엔드(`server/ralph/specs/`) | 03 이력서, 04 자소서(템플릿 초안), 05 면접, 06 결과, 07 음성 | 경험(R2~R6)·작성(R8·R13)·점검(R9~R12) 명세 없음. 03·05·06·07은 현재 범위 밖이거나 결정 대기 |
| 프런트(`docs/develope/screen-spec.md`, `frontend/`) | 이력서·모의면접 화면 | 4절 화면 없음 |
| API(`docs/api.md`) | 4절 이력서, 6~7절 면접·음성 | 3절 API 없음 |
| README 구현 설계 | F1~F9 흐름 | `functional_spec` 기준 아님 |
