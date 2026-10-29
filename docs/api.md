# API 명세 (2026-10-30)

근거: `docs/problem.yaml`의 `functional_spec`(R1~R13, C1~C5)만 쓴다. 이전 API 명세(F1~F9 기준)는 참고하지 않고 새로 썼다.
각 API 제목 옆 괄호는 근거가 된 요구사항이다. problem.yaml에 근거가 없어 학생에게 물어 정한 것은 「학생 답(2026-10-30)」으로 적는다.

범위 밖: 기각한 음성 모의면접(모의면접·음성·카메라·면접 결과·재답변)와 뺀 기능(이전 F2 이력서, 이전 F3 템플릿 자소서)은 API를 만들지 않는다.
운영용 경로(헬스체크, 시드 데이터 등)도 problem.yaml에 근거가 없어 이 문서에서 다루지 않는다.

## 0. 정한 것

| 항목 | 선택 | 근거 |
| --- | --- | --- |
| 인증 | 로그인하면 JWT를 돌려주고, 프런트가 `Authorization: Bearer <token>`으로 보낸다 | 학생 답(2026-10-30) |
| 단서 파일 | 사진·수상기록·문서 파일은 보관만 한다. AI는 파일을 읽지 않고, 사용자가 단서마다 쓴 설명과 텍스트 단서만 본다. 설명 없이 올린 파일은 보관만 하고(사실의 "자료로 확인" 근거로는 쓸 수 있음) AI 대화에는 쓰지 않는다 | 학생 답(2026-10-30) |
| 이력서 | 계정당 하나. 글을 붙여넣으면 AI가 활동 초안으로 나누고, 사용자가 고치거나 빼거나 직접 추가한 뒤 확정하면 활동마다 경험이 하나 생긴다. 다시 붙여넣으면 새 활동만 더한다 | R2, 학생 답(2026-10-30) |
| 사실 후보 | 사용자가 답할 때마다 AI가 그 답에서 사실 후보를 뽑아 쌓는다 | 학생 답(2026-10-30) |
| AI 응답 | AI가 끝날 때까지 기다렸다가 완성된 결과를 JSON 한 번으로 돌려준다(스트리밍 없음) | 학생 답(2026-10-30) |
| 답변 방식 | 모든 답변은 글(text)이다 | R3, R10 |
| 경험 항목 | `situation`(상황) · `role`(역할) · `action`(행동) · `result`(결과) · `meaning`(의의) | R3, R6 |

아래는 problem.yaml이 정하지 않는 작성 관례다. 제품 동작과 무관하며 바꿔도 된다.

- 모든 경로는 `/api/` 아래, 요청·응답 본문은 JSON(파일 업로드만 `multipart/form-data`).
- ID는 문자열, 시각은 ISO 8601 UTC 문자열.
- 오류 본문은 `{ "error": { "code": "...", "message": "..." } }`.

## 1. 공통 규칙

| 상황 | 응답 | 근거 |
| --- | --- | --- |
| 토큰 없음·만료·위조 (가입·로그인 제외 모든 API) | `401 UNAUTHENTICATED` | C3 (로그인 전에는 소개 페이지만, 기능은 로그인 후) |
| 다른 계정의 자원 | `404 NOT_FOUND` | R1 (데이터는 계정별로 분리) |
| 입력 검증 실패 | `400 VALIDATION` (`details: [{ field, reason }]`) | R7 등 각 요구사항 |
| AI 호출 실패 | `502 AI_UNAVAILABLE`. 그 요청으로 바뀌는 것은 아무것도 저장하지 않는다(사용자가 보낸 답변도). 프런트는 에러와 재시도 버튼을 보여 주고, 같은 요청을 다시 보내면 된다 | C2 |

AI는 자소서 문장을 알아서 고쳐 쓰지 않는다. 응답을 만들거나 다시 만드는 API는 문항별 `POST .../items/:itemId/answer` 하나뿐이며, 사용자가 부를 때만 실행된다(C4).

## 2. 데이터 모양

```ts
type Item = "situation" | "role" | "action" | "result" | "meaning";   // R3, R6
type ItemStatus = "explained" | "needs_more" | "unknown" | null;       // R3. null = 아직 묻지 않음(화면 표시용, 요구사항에 직접 근거 없음)

// R4·R5·C1: AI가 뽑은 것은 후보(candidate)이고 출처는 ai_unverified.
// 사용자가 확인(confirm)할 때 출처를 said(내가 말함) 또는 clue(자료로 확인)로 정한다.
// 확정(confirmed)된 사실만 경험 카드에 들어가고, 자소서 생성·점검의 근거가 된다.
type Fact = {
  id: string;
  item: Item;
  text: string;
  status: "candidate" | "confirmed";
  source: "said" | "clue" | "ai_unverified";
  clueId: string | null;          // source = clue일 때 그 단서
  origin: "conversation" | "check" | "manual";
  createdAt: string;
};

type Clue = {                     // R2
  id: string;
  type: "photo" | "award" | "document" | "text";
  description: string | null;     // 파일 단서에 사용자가 쓴 설명. AI는 이것만 본다
  text: string | null;            // type = text일 때 내용
  fileName: string | null;        // 파일 단서일 때
  createdAt: string;
};

// R2: 이력서는 계정당 하나. 붙여넣은 글과, 아직 경험이 되지 않은 활동 초안 목록.
type Resume = {
  text: string | null;            // 마지막으로 붙여넣은 이력서 글. 아직 없으면 null
  drafts: ActivityDraft[];        // 확인 대기 중인 활동(확정하면 경험이 되고 목록에서 빠진다)
  updatedAt: string | null;
};

type ActivityDraft = {            // R2
  id: string;
  title: string;                  // 활동 이름 (예: "캡스톤디자인 학과 공지 알림 앱")
  period: string;                 // 대략적 시기 (예: "2025년 1학기"). 모르면 빈 문자열
  summary: string;                // 이력서에서 이 활동에 해당하는 부분. 직접 추가하면 사용자가 쓴 한 줄(빈 문자열 가능)
  origin: "ai" | "manual";
};

type Experience = {               // R2, R6
  id: string;
  title: string;
  period: string;                 // 대략적 시기, 자유 입력 (예: "2025년 여름")
  summary: string;                // R2: 이력서에서 온 활동 내용. R3 질문에 쓴다
  clues: Clue[];
  itemStatus: Record<Item, ItemStatus>;   // R3 실시간 상태
  card: Record<Item, Fact[]>;             // R6: 확정된 사실만
  candidates: Fact[];                     // R4: 확인 대기 중인 후보
  createdAt: string;
  updatedAt: string;
};

type Message = { role: "ai" | "user"; text: string; createdAt: string };   // R3

type CoverLetter = {              // R7, R8
  id: string;
  kind: "pasted" | "generated";
  title: string | null;
  body: string | null;            // pasted일 때 붙여넣은 글
  target: { preferred: string; talent: string } | null;   // generated일 때 우대사항·인재상
  items: CoverLetterItem[];       // generated일 때 문항별 응답
  createdAt: string;
  updatedAt: string;
};

type CoverLetterItem = {          // R8, R13
  id: string;
  question: string;               // 자소서 문항
  recommendations: { experienceId: string; reason: string }[];   // AI 추천 카드와 이유
  selectedExperienceIds: string[];  // 사용자가 이 문항에 쓰기로 고른 카드 (카드 단위)
  answer: string | null;            // 아직 만들지 않았으면 null
  usedExperienceIds: string[];      // 지금 응답을 만들 때 근거로 쓴 카드
  answerEdited: boolean;            // 사용자가 응답을 고쳤는지 (다시 만들 때 확인용)
};

// R9~R12
type SentenceStatus = "pending" | "in_progress" | "explained" | "needs_more" | "unknown";
// R10 judge: 문장에 해당하는 기준만 목록에 넣는다(예: 수치가 없는 문장에는 J1이 없다).
type JudgeResult = { id: "J1" | "J2" | "J3" | "J4"; result: "met" | "missing" };

type CheckSentence = {
  id: string;
  text: string;                   // 점검할 주장 문장
  coverLetterItemId: string | null;
  status: SentenceStatus;
  turns: { question: string; answer: string | null; judge: JudgeResult[] }[];
  followUpsLeft: number;          // 첫 질문 뒤 남은 추가 질문 수 (처음 3)
};

type Check = {
  id: string;
  coverLetterId: string;
  stale: boolean;                 // 점검을 만든 뒤 자소서가 바뀌면 true("오래됨")
  sentences: CheckSentence[];
  candidates: (Fact & { experienceId: string | null })[];   // R12: 점검 답변에서 나온 사실 후보
  createdAt: string;
};
```

## 3. 계정 (R1, C3)

### `POST /api/auth/signup`
- 요청: `{ "email": string, "password": string }`
- `201 { "token": string, "user": { id, email } }`
- `400 VALIDATION` 이메일 형식이 아니거나 비어 있음. `409 EMAIL_TAKEN` 이미 가입된 이메일.

### `POST /api/auth/login`
- 요청: `{ "email": string, "password": string }`
- `200 { "token": string, "user": { id, email } }` / `401 INVALID_CREDENTIALS`

### `GET /api/auth/me`
- `200 { "user": { id, email } }` / `401`
- 요구사항에 직접 근거는 없지만 새로고침 뒤 로그인 상태 확인용으로 둔다(학생 답 2026-10-30).

로그아웃은 프런트가 토큰을 버리는 것으로 끝낸다(별도 API 없음).

## 4. 이력서와 경험 (R2, R3, R6)

경험은 이력서의 활동을 확정해서만 만든다. 경험을 하나씩 따로 만드는 API는 없다(R2).

### `GET /api/resume` (R2)
- `200 { "resume": Resume }`. 아직 붙여넣은 적이 없으면 `text: null`, `drafts: []`.

### `POST /api/resume` (R2)
- 요청: `{ "text": string }` (빈 글이면 `400`)
- AI가 글을 활동으로 나눠 제목·시기·해당 부분(`summary`)을 붙인다.
- 이미 있는 경험이나 초안과 제목이 같은 활동은 빼고, 새로 나온 활동만 `drafts`에 더한다. `text`는 새 글로 바뀐다.
- `200 { "resume": Resume, "added": ActivityDraft[] }`
- AI 실패면 `502 AI_UNAVAILABLE`, 아무것도 저장하지 않는다(C2). 사용자는 활동을 직접 추가해 계속할 수 있다.

### `POST /api/resume/drafts` (R2)
- 활동 직접 추가(AI 없음). 요청: `{ "title": string, "period"?: string, "summary"?: string }` (`title` 필수)
- `201 { "draft": ActivityDraft }` (`origin: manual`)

### `PATCH /api/resume/drafts/:draftId` (R2)
- 요청: `{ "title"?: string, "period"?: string, "summary"?: string }`. `title`을 비우면 `400`.
- `200 { "draft": ActivityDraft }`

### `DELETE /api/resume/drafts/:draftId` (R2)
- 초안을 뺀다. `204`

### `POST /api/resume/drafts/confirm` (R2)
- 요청: `{ "draftIds": string[] }` (1개 이상). 고른 초안마다 경험을 하나씩 만들고 초안 목록에서 뺀다.
- `201 { "experiences": Experience[] }` (각각 `title`·`period`·`summary`가 초안 값, 단서·사실 없음)
- 없는 초안이 섞이면 `404`.

### `GET /api/experiences` (R6)
- `200 { "experiences": Experience[] }` (최근 수정순)

### `GET /api/experiences/:id` (R6)
- `200 { "experience": Experience }`

### `PATCH /api/experiences/:id` (R6)
- 요청: `{ "title"?: string, "period"?: string }`
- `200 { "experience": Experience }`

### `POST /api/experiences/:id/clues` (R3)
- 파일 단서: `multipart/form-data` — `type`(`photo`|`award`|`document`), `file`, `description`(선택)
- 텍스트 단서: JSON `{ "type": "text", "text": string }` (`text` 필수)
- `201 { "clue": Clue }`
- 파일은 보관만 한다. AI 대화에는 `description`과 텍스트 단서만 들어간다.
- `description`이 없는 파일 단서는 AI 대화에 쓰이지 않는다. 사실을 "자료로 확인"할 때의 근거(`clueId`)로는 쓸 수 있다.

### `GET /api/experiences/:id/clues/:clueId/file` (R3, R5)
- 보관한 파일을 그대로 돌려준다. 사실을 "자료로 확인"할 때 사용자가 다시 본다.

## 5. 경험 대화 (R3, R4, R5)

### `GET /api/experiences/:id/conversation` (R3)
- `200 { "messages": Message[], "itemStatus": Record<Item, ItemStatus>, "candidates": Fact[] }`
- 대화가 아직 없으면 `messages`는 빈 배열이다.

### `POST /api/experiences/:id/conversation/start` (R3)
- AI가 제목·시기·이력서에서 온 활동 내용(`summary`)·단서 설명·텍스트 단서를 보고 첫 질문을 만든다.
- `200 { "question": Message, "itemStatus": ... }`
- 이미 대화가 있으면 새로 만들지 않고 마지막 AI 질문을 돌려준다(대화 이어가기, R13 보강에서도 쓴다).

### `POST /api/experiences/:id/conversation/answers` (R3, R4)
- 요청: `{ "text": string }` (빈 글이면 `400`)
- 대화를 시작하지 않았으면(`start` 전) `409 CONVERSATION_NOT_STARTED`.
- AI에는 매번 그 시점의 단서 전체(설명·텍스트 단서)와 대화 기록을 넣는다. 대화 중에 추가한 단서도 다음 질문부터 반영된다.
- AI 호출 한 번으로 아래를 함께 돌려준다.
- `200 { "answer": Message, "question": Message, "itemStatus": Record<Item, ItemStatus>, "newCandidates": Fact[] }`
  - `itemStatus`: 항목마다 설명됨 / 추가 확인 필요 / 모름·경험 없음을 갱신한다(R3 실시간 표시).
  - `newCandidates`: 이 답변에서 뽑은 사실 후보. `status: candidate`, `source: ai_unverified`(R4, R5).
- 질문 횟수 상한은 없다. 사용자가 상태를 보고 답하기를 멈추면 대화가 멈춘 것이다(멈춤 API 없음, R3).
- `itemStatus`는 대화 판정 결과다. 카드의 사실을 고치거나 지우거나 직접 추가해도 바뀌지 않고, 다시 대화할 때만 갱신된다(학생 답 2026-10-30).

## 6. 사실 확정 (R4, R5, R6, C1)

### `POST /api/experiences/:id/facts/:factId/confirm` (R4, R5)
- 요청: `{ "text"?: string, "item"?: Item, "source": "said" | "clue", "clueId"?: string }`
  - 고친 뒤 확정하려면 `text`·`item`을 함께 보낸다.
  - `source: clue`이면 이 경험의 `clueId`가 필수다.
- `200 { "fact": Fact }` (`status: confirmed`). 이때부터 경험 카드에 들어간다.
- `source`로 `ai_unverified`는 받지 않는다(`400`). 확인하지 않은 것은 사실이 되지 않는다(C1).

### `PATCH /api/experiences/:id/facts/:factId` (R4, R6)
- 요청: `{ "text"?: string, "item"?: Item, "source"?: "said" | "clue", "clueId"?: string }`
- 후보를 확정 전에 고치거나, 확정된 사실을 카드에서 고친다. `200 { "fact": Fact }`

### `DELETE /api/experiences/:id/facts/:factId` (R4, R6)
- 후보 또는 확정된 사실을 지운다. `204`

### `POST /api/experiences/:id/facts` (R6, R13 보강)
- 사용자가 카드에 직접 사실을 적는다. 요청: `{ "item": Item, "text": string, "source": "said" | "clue", "clueId"?: string }`
- 사용자가 직접 쓴 것이므로 바로 `confirmed`, `origin: manual`. `201 { "fact": Fact }`
- R4는 AI가 뽑은 사실을 확인하는 흐름만 말한다. 직접 추가는 R6 수정·R13 보강을 위해 두며, 유지는 학생 답(2026-10-30).

## 7. 자기소개서 (R7, R8)

### `POST /api/cover-letters` (R7)
- 요청: `{ "title"?: string, "body": string }`
- `201 { "coverLetter": CoverLetter }` (`kind: pasted`). 공백만 있거나 빈 글이면 `400`.

### `GET /api/cover-letters` (R7)
- `200 { "coverLetters": CoverLetter[] }` (최근 수정순). 여러 개를 둘 수 있다.

### `GET /api/cover-letters/:id` (R7, R13)
- `200 { "coverLetter": CoverLetter, "experiences": Experience[] }`
- `experiences`는 문항 응답들이 근거로 쓴 경험 카드다(R13 화면에서 문항마다 나열).

### `PATCH /api/cover-letters/:id` (R7, C4)
- 요청: `{ "title"?: string, "body"?: string }`
- 점검 결과를 보고 사용자가 붙여넣은 자소서를 직접 고칠 때 쓴다(AI는 고치지 않고 사용자가 고친다, C4). 빈 글이면 `400`.
- R7에 수정은 없지만 유지하기로 함(학생 답 2026-10-30). 고치면 이 자소서의 기존 점검은 "오래됨"이 된다(9절).
- 생성한 자소서(`kind: generated`)에 `body`를 보내면 `400`. 생성한 자소서의 응답은 아래 문항별 API로 고친다.

### `PATCH /api/cover-letters/:id/items/:itemId` (R8)
- 요청: `{ "answer": string }` 사용자가 생성된 응답을 고쳐 저장한다. `answerEdited`가 `true`가 된다.
- 고치면 이 자소서의 기존 점검은 "오래됨"이 된다(9절).

### `POST /api/cover-letters/generate` (R8)
작성할 자소서를 만든다. 이 단계에서는 응답을 만들지 않는다.
- 요청:
  ```json
  {
    "title": "string (선택)",
    "preferred": "희망 기업의 우대사항",
    "talent": "희망 기업의 인재상",
    "questions": ["자소서 문항", "..."]
  }
  ```
- `preferred`·`talent`는 비어 있으면 안 되고, `questions`는 1개 이상이다.
- `201 { "coverLetter": CoverLetter }` (`kind: generated`, 문항마다 `answer: null`, 선택·추천은 빈 배열)

문항은 `items` 순서대로 하나씩 진행한다. 한 문항에서 ① 추천 → ② 카드 고르기 → ③ 그 문항 생성을 마치면 프런트가 다음 문항으로 넘어간다.

### `POST /api/cover-letters/:id/items/:itemId/recommendations` (R8) ①
- AI가 우대사항·인재상·이 문항을 보고, 확정된 사실이 1개 이상 있는 경험 카드 중에서 맞는 카드를 이유와 함께 추천한다.
- `200 { "item": CoverLetterItem }` (`recommendations` 채움)
- 확정된 사실이 있는 카드가 하나도 없으면 `400 NO_CONFIRMED_FACTS`.

### `PUT /api/cover-letters/:id/items/:itemId/experiences` (R8, R13) ②
- 요청: `{ "experienceIds": string[] }` 이 문항에 쓸 카드(카드 단위). 추천에 없는 카드도 고를 수 있다.
- 고른 카드마다 확정된 사실이 1개 이상 있어야 한다. 아니면 `400 NO_CONFIRMED_FACTS`(`details`에 해당 경험). 다른 계정의 경험이면 `404`.
- `200 { "item": CoverLetterItem, "usedElsewhere": [{ "experienceId": string, "itemIds": string[] }] }`
  - `usedElsewhere`: 고른 카드 중 이미 다른 문항에 쓴 카드. 막지 않고 알리기만 한다.

### `POST /api/cover-letters/:id/items/:itemId/answer` (R8, R13, C4) ③
- 요청: `{ "confirmOverwrite"?: boolean }`
- 이 문항 하나만, `selectedExperienceIds` 카드의 **확정된 사실만** 써서 응답을 만든다. 카드에 없는 수치·기여도는 넣지 않는다.
- `selectedExperienceIds`가 비었으면 `400`.
- 이미 응답이 있고 사용자가 고쳤으면(`answerEdited: true`) `confirmOverwrite: true` 없이는 `409 OVERWRITE_CONFIRM_REQUIRED`. 프런트는 덮어쓴다고 알리고 확인을 받은 뒤 다시 보낸다.
- `200 { "item": CoverLetterItem }` (`answer`, `usedExperienceIds` 갱신, `answerEdited: false`). 이 자소서의 기존 점검은 "오래됨"이 된다.
- 사용자가 부르지 않으면 응답을 만들거나 다시 만들지 않는다(C4).

## 8. 문항별 응답과 근거 카드 (R13)

- 보기: `GET /api/cover-letters/:id`로 문항마다 응답과 근거 카드(`usedExperienceIds`, `experiences`)를 본다.
- 다시 고르기: 과적합이라 판단하면 그 문항의 ② `PUT .../experiences`로 카드를 다시 고르고 ③ `POST .../answer`로 그 문항을 다시 만든다.
- 보강: 부족한 카드는 경험 API(대화 이어가기 `conversation/start`·`answers`, 직접 수정 `facts`)로 보강한 뒤 ③으로 다시 만든다.
- 사용자가 고친 응답은 ③에서 확인을 받은 뒤에만 덮어쓴다.

## 9. 제출 전 점검 (R9~R12)

### `POST /api/cover-letters/:id/checks` (R9)
- AI가 자소서에서 수치·성과·역할·평가 표현이 들어간 주장 문장을 골라 점검 목록을 만든다.
- 붙여넣은 자소서는 `body`, 생성한 자소서는 각 문항의 `answer`에서 고른다.
- `201 { "check": Check }` (모든 문장 `status: pending`, `followUpsLeft: 3`, `stale: false`)
- 점검을 만든 뒤 자소서가 바뀌면(`PATCH /cover-letters/:id`, 문항 응답 수정, 문항 응답 생성) 그 자소서의 기존 점검은 모두 `stale: true`("오래됨")가 된다. 오래된 점검은 볼 수만 있고, 이어서 하려면 새 점검을 만든다(학생 답 2026-10-30).
- 고를 문장이 없으면 `sentences`가 빈 배열이다.

### `GET /api/checks/:checkId` (R11)
- `200 { "check": Check }`

### `GET /api/cover-letters/:id/checks` (R11)
- `200 { "checks": Check[] }` (최신순)
- 요구사항에 직접 근거는 없다. 새로고침 뒤 프런트가 진행 중인 점검을 다시 찾으려면 필요해서 둔다(11절 참고).

### `POST /api/checks/:checkId/sentences/:sentenceId/start` (R10)
- 이 문장의 첫 질문을 만든다(면접관처럼 근거를 묻는 질문).
- `200 { "sentence": CheckSentence }` (`status: in_progress`, 마지막 `turns`에 질문, `answer: null`)
- 이미 시작했으면 지금 상태를 그대로 돌려준다. 오래된 점검이면 `409 CHECK_STALE`.
- 문장은 `sentences` 배열 순서대로 진행한다. 한 문장이 끝나면(R11 "다음 문장으로 넘어간다") 서버가 자동으로 넘기지 않고, 프런트가 다음 `pending` 문장의 `start`를 부른다.

### `POST /api/checks/:checkId/sentences/:sentenceId/answers` (R10, R11, R12)
- 요청: `{ "text": string }` (빈 글이면 `400`). 시작하지 않은 문장이면 `409 SENTENCE_NOT_STARTED`, 끝난 문장이면 `409 SENTENCE_FINISHED`, 오래된 점검이면 `409 CHECK_STALE`.
- AI 호출 한 번으로 이 답을 흐림 판단 기준으로 판정한다. 문장에 해당하는 기준만 판정 목록(`judge`)에 넣고, 해당하지 않는 기준은 넣지 않는다.
  - J1 수치의 출처: 계산 방법·비교 기준·기간
  - J2 본인의 행동: 팀이 아니라 내가 한 구체적인 행동
  - J3 표현의 실체: 평가 표현에 해당하는 실제 수단·도구·산출물
  - J4 단정: 추정으로 얼버무리는 말("체감상", "대략 그쯤")이 없음
- 상태 결정(R11):
  - 사용자가 그런 일이 없었거나 모른다·기억나지 않는다고 답함 → `unknown`, 끝. 이 판정을 J1~J4보다 먼저 한다("정확히 기억은 안 나요"도 `unknown`, 학생 답 2026-10-30)
  - 판정 목록의 기준이 모두 `met` → `explained`, 끝
  - 빠진 기준이 있고 `followUpsLeft > 0` → 빠진 요소를 다른 각도로 묻는 다음 질문을 만들고 `followUpsLeft`를 1 줄인다
  - 빠진 기준이 있고 `followUpsLeft = 0` → `needs_more`, 끝
- `200 { "sentence": CheckSentence, "newCandidates": Fact[] }`
  - `newCandidates`: 이 답에서 나온 사실 후보(R12). 생성 자소서의 문장이면 그 문항의 근거 카드 중 하나를 `experienceId`로 제안하고, 붙여넣은 자소서면 `null`.
- 점수는 없다(R11).

### `POST /api/checks/:checkId/candidates/:factId/confirm` (R12, C1)
- 요청: `{ "experienceId": string, "item": Item, "text"?: string, "source": "said" | "clue", "clueId"?: string }`
- 사용자가 확인한 후보만 고른 경험 카드에 확정 사실로 추가한다(`origin: check`).
- `source: clue`이면 `clueId`가 필수이고, 고른 `experienceId`의 단서여야 한다. 아니면 `400`.
- 확정한 후보는 `Check.candidates`에서 빠진다. 이미 확정했거나 버린 후보면 `409 CANDIDATE_RESOLVED`.
- `200 { "fact": Fact }` / 남의 경험이면 `404`, `source`가 `ai_unverified`이면 `400`.

### `DELETE /api/checks/:checkId/candidates/:factId` (R12)
- 후보를 버린다. `204`

## 10. 요구사항 ↔ API

| 요구사항 | API |
| --- | --- |
| R1 회원가입·로그인 | `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` |
| R2 이력서로 경험 만들기 | `GET /resume`, `POST /resume`(AI 활동 나누기), `POST`·`PATCH`·`DELETE /resume/drafts`, `POST /resume/drafts/confirm` |
| R3 대화로 경험 꺼내기 | `GET .../conversation`, `POST .../conversation/start`, `POST .../conversation/answers`, 단서 `POST /experiences/:id/clues`, `GET .../clues/:clueId/file` |
| R4 사실 확정 | 후보 목록 `GET .../conversation`·`GET /experiences/:id`(`candidates`), `POST .../facts/:factId/confirm`, `PATCH .../facts/:factId`, `DELETE .../facts/:factId` |
| R5 출처 표시 | `Fact.source`, `Fact.clueId` (확정 시 `said`/`clue` 선택) |
| R6 경험 카드 관리 | `GET /experiences`, `GET/PATCH /experiences/:id`, `POST/PATCH/DELETE .../facts` |
| R7 자기소개서 등록 | `POST /cover-letters`, `GET /cover-letters`, `PATCH /cover-letters/:id` |
| R8 경험 기반 자기소개서 작성 | `POST /cover-letters/generate`, 문항별 `POST .../items/:itemId/recommendations` → `PUT .../experiences` → `POST .../answer`, `PATCH .../items/:itemId` |
| R9 주장 문장 고르기 | `POST /cover-letters/:id/checks` |
| R10 문장 근거 묻기 | `POST /checks/:checkId/sentences/:sentenceId/start`, `.../answers` |
| R11 문장별 점검 결과 | `.../answers` 응답의 `status`, `GET /checks/:checkId`, `GET /cover-letters/:id/checks` |
| R12 점검 사실을 카드에 저장 | `POST /checks/:checkId/candidates/:factId/confirm`, `DELETE` 같은 경로 |
| R13 문항별 응답과 근거 카드 | `GET /cover-letters/:id`, 다시 고르기 `PUT .../experiences` + `POST .../answer`(고친 응답은 확인 후 덮어쓰기) |
| C1 확인한 것만 사실 | 모든 confirm API가 `ai_unverified`를 거부, 생성·점검은 `confirmed`만 사용 |
| C2 AI 실패 처리 | 공통 `502 AI_UNAVAILABLE`, 저장 안 함, 같은 요청 재시도 |
| C3 로그인 전 차단 | 가입·로그인 외 모든 API `401` |
| C4 AI가 알아서 고치지 않음 | 응답 생성은 `POST .../items/:itemId/answer` 하나, 사용자가 부를 때만 |
| C5 준비 시간 | API로 다루지 않음(가설, 기준 값 없음) |

## 11. 정하지 않은 것 (학생 답 대기)

problem.yaml에 근거가 없어 비워 둔 것이다. 정해지면 이 문서에 반영한다.

- 비밀번호 규칙(최소 길이 등)과 JWT 만료 시간
- 단서 파일의 허용 형식과 최대 크기
- 경험·자소서·단서·점검의 삭제 기능 (요구사항에 없음)
- 한 자소서에서 점검을 여러 번 할 때 이전 점검을 남길지 (지금은 모두 남기고 `GET /cover-letters/:id/checks`로 목록을 본다)
