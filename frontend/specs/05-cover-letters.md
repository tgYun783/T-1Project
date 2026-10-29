# 05 붙여넣기·작성 시작·자소서 상세 (G, H, J)

근거: R7, R8, R13, C4, screen-spec.md 3절 G·H·J, api.md 7~9절. 시나리오: S3, S5, S6. 세 화면 모두 자소서 잠금 적용.

## G 붙여넣기 `/cover-letters/paste` (R7)

- lilac 블록. 입력칸 `제목`(선택), `본문`(필수, 여러 줄). 주 버튼 `저장`.
- 동작: `POST /api/cover-letters` → `/cover-letters/:id`.
- 예외: `본문`이 비거나 공백뿐이면 저장하지 않고 `본문을 입력해 주세요.`

## H 작성 시작 `/cover-letters/new` (R8)

- lilac 블록. 입력칸 `제목`(선택), `우대사항`(필수), `인재상`(필수).
- 문항 목록: 처음에 입력칸 `문항 1` 하나. 보조 버튼 `문항 추가`로 `문항 2`, `문항 3`… 늘린다. 문항이 2개 이상이면 문항마다 버튼 `빼기`.
- 주 버튼 `작성 시작` → `POST /api/cover-letters/generate`(`questions`는 비지 않은 문항만, 순서대로) → `/cover-letters/:id/items/<첫 문항 id>`.
- 예외: `우대사항`·`인재상`이 비거나 문항이 하나도 없으면 칸 아래 `필수 입력이에요.`

## J 자소서 상세 `/cover-letters/:id` (R7, R13, 점검 입구)

`GET /api/cover-letters/:id`.

### 붙여넣음 (`kind: pasted`)

- 제목, 입력칸 `본문`(바로 고칠 수 있음), 보조 버튼 `저장`(`PATCH /api/cover-letters/:id`, 빈 글이면 `본문을 입력해 주세요.`).

### 작성함 (`kind: generated`) — R13

- 배치(학생 답 2026-10-30): 왼쪽 넓은 칸에 자소서(문항과 응답을 큰 카드로), 오른쪽 좁은 칸에 그 자소서에 쓴 경험 카드를 세로로 쌓는다. 응답을 누르면 오른쪽에서 그 응답의 근거 카드가 강조된다. 자세한 배치는 docs/design/wireframes/를 따른다.

- 문항마다:
  - 문항 글, 응답 글
  - `근거 경험 카드`: `usedExperienceIds`의 경험 제목 목록. 카드마다 보조 버튼 `보강하기`(→ `/experiences/:id?returnTo=/cover-letters/:id/items/:itemId`)
  - 보조 버튼 `카드 다시 고르기`(→ I 그 문항)
  - 응답이 없는 문항은 점선 행 `아직 만들지 않음`과 보조 버튼 `이 문항 쓰기`(→ I 그 문항)

### 점검 (cream 블록) — R9

- 주 버튼 `제출 전 점검 시작` → `POST /api/cover-letters/:id/checks` → `/checks/:checkId`. AI 호출 규칙 적용.
- `지난 점검`: `GET /api/cover-letters/:id/checks`(최신순). 행마다 만든 시각, `끝난 문장 N / 전체 M`, `stale`이면 `오래됨`. 누르면 `/checks/:checkId`.
- 저장 버튼 근처 안내: `자소서를 고치면 지난 점검은 오래됨으로 바뀌어요.`

## 테스트

- G: `본문`을 비우고 `저장` → `본문을 입력해 주세요.`, 입력 후 `저장` → 상세에 본문이 보인다.
- H: `우대사항`·`인재상`·`문항 1`을 넣고 `작성 시작` → 문항별 작성 화면으로 간다.
- J: 시드 자소서에서 `제출 전 점검 시작` → 점검 화면으로 간다.
