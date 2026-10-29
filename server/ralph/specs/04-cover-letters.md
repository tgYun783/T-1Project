# 명세 04 — 자기소개서 F3·F4와 AI 모듈 (단계 4)
바탕: docs/api.md 5절, features F3·F4. 학생 답(2026-10-30): 9개 항목 중 고른 것마다 AI가 문항을 생성 → 수정 가능한 폼에서 직접 수정 / AI 다듬기 / 완료.

## 결정
- `AiModule`: Vercel AI Gateway 호출을 한곳에. 키는 `AI_GATEWAY_API_KEY`에서만. 키 없음·HTTP 오류·타임아웃(20초)·재시도 1회 초과 → `AiUnavailableError` → 전역 필터가 `502 AI_UNAVAILABLE`. 모델 이름은 환경변수 `AI_TEXT_MODEL`(기본값은 설정 파일에 두되 Gateway 목록에서 확인한 식별자만). 요청·응답 토큰 상한 설정값.
- **프롬프트 분리**: AI에 보내는 프롬프트 본문은 로직과 섞지 않고 `server/src/ai/prompts/<이름>.prompt.ts`(문자열 상수 또는 템플릿 함수 하나만 export)에 둔다. AI 담당 팀원이 이 파일만 고칠 수 있어야 한다. 예: `cover-letter-draft.prompt.ts`.
- 테스트는 AiModule을 mock한다. 실제 호출 확인은 사람이 1회(비용 ≤ $0.05).
- 모델 `CoverLetter { userId, title, status:"draft"|"final", source:"generated"|"uploaded", sections:[{key,label,body}], resumeSnapshot?:{baseText}, revisions:[{at,kind:"edit"|"refine"|"suggestion",sectionKey?,before,after}], createdAt, updatedAt }`. 업로드(F4)는 `sections=[{key:"uploaded",label:"자기소개서",body}]` 하나로 저장. 면접(명세 05)에 넘길 때 `body`는 sections의 body를 label과 함께 이어 붙인 문자열(헬퍼 `toPlainText`).
- **완료(status final)**: 모의면접은 `status:"final"`인 자소서만 고를 수 있다(Agent 기본값, 팀 확인 대기). 업로드는 저장 즉시 final.
- **AI 다듬기**: 문항 하나씩. 요청에 `sectionKey`와 선택 지시(`instruction`, 200자 이내, 없으면 "더 구체적이고 읽기 쉽게")를 받아 다듬은 본문을 **돌려주기만 하고 저장하지 않는다**. 사용자가 적용하면 PATCH로 저장(적용·취소는 프런트). 다듬기 프롬프트는 `cover-letter-refine.prompt.ts`.

## 완료 기준
- [ ] C4-1: `POST /api/cover-letters` {title?, body} → 201 `source:"uploaded"`, `status:"final"`, sections 1개(key `uploaded`). body 공백만 → 400 VALIDATION. title 없으면 "자기소개서 N".
- [ ] C4-2: `GET /api/cover-letters` → 최신순 목록(id,title,status,source,sectionKeys,createdAt,updatedAt). `GET /api/cover-letters/:id` → sections 포함. 남의 것·없는 id → 404.
- [ ] C4-3: `AiModule.generateText(prompt, opts)`가 키 없으면 호출 없이 `AiUnavailableError`, HTTP 5xx·타임아웃이면 1회 재시도 뒤 같은 오류. 단위 테스트(HTTP mock) 있음. 키·프롬프트 본문을 로그에 남기지 않는다.
- [ ] C4-4: `POST /api/cover-letters/generate` {title?, keys:[템플릿 키…]} → keys 비었거나 모르는 키·중복 → 400. 이력서 없음/baseText 비었음 → 400. 성공 → 201 `source:"generated"`, `status:"draft"`, 고른 키마다 section 하나(label은 템플릿, body는 AI 생성), `resumeSnapshot.baseText`. AI 호출은 1회(고른 문항 전부를 한 번에 JSON으로 받아 zod 검증, 형식 오류는 1회 재시도 뒤 502). 프롬프트(`cover-letter-draft.prompt.ts`)에 "이력서에 없는 경험·성과를 넣지 말 것" 지시(테스트가 문자열 단언). AI 실패 → 502, 저장 안 됨.
- [ ] C4-5: `PATCH /api/cover-letters/:id` {title?, sections?:[{key,body}]} → 해당 문항 body만 교체(없는 key → 400, 빈 body → 400), revisions에 `edit` 추가, 200. `status:"final"`인 자소서도 수정 가능하되 수정하면 `draft`로 돌아간다. 남의 것 → 404.
- [ ] C4-6: `POST /api/cover-letters/:id/refine` {sectionKey, instruction?} → AI 1회 호출로 다듬은 본문을 `{sectionKey, before, after}`로 돌려주고 **저장하지 않는다**. 없는 sectionKey → 400, instruction 200자 초과 → 400, AI 실패 → 502. 프롬프트(`cover-letter-refine.prompt.ts`)에 "새 경험·수치를 만들어 내지 말 것" 지시(테스트가 단언).
- [ ] C4-7: `POST /api/cover-letters/:id/finalize` → `status:"final"`, 200. 모든 section body가 비어 있지 않아야 하며 빈 것이 있으면 400(어느 문항인지 details). 이미 final이면 200 그대로.
