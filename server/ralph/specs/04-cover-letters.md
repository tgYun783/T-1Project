# 명세 04 — 자기소개서 F3·F4와 AI 모듈 (단계 4)
바탕: docs/api.md 5절, features F3·F4. 기본값: 초안은 한 덩어리 본문, 수정 API 없음(학생 답 오면 교체).

## 결정
- `AiModule`: Vercel AI Gateway 호출을 한곳에. 키는 `AI_GATEWAY_API_KEY`에서만. 키 없음·HTTP 오류·타임아웃(20초)·재시도 1회 초과 → `AiUnavailableError` → 전역 필터가 `502 AI_UNAVAILABLE`. 모델 이름은 환경변수 `AI_TEXT_MODEL`(기본값은 설정 파일에 두되 Gateway 목록에서 확인한 식별자만). 요청·응답 토큰 상한 설정값.
- **프롬프트 분리**: AI에 보내는 프롬프트 본문은 로직과 섞지 않고 `server/src/ai/prompts/<이름>.prompt.ts`(문자열 상수 또는 템플릿 함수 하나만 export)에 둔다. AI 담당 팀원이 이 파일만 고칠 수 있어야 한다. 예: `cover-letter-draft.prompt.ts`.
- 테스트는 AiModule을 mock한다. 실제 호출 확인은 사람이 1회(비용 ≤ $0.05).
- 모델 `CoverLetter { userId, title, body, source:"generated"|"uploaded", resumeSnapshot?, createdAt, updatedAt }`.

## 완료 기준
- [ ] C4-1: `POST /api/cover-letters` {title?,body} → 201. body 공백만 → 400 VALIDATION. title 없으면 "자기소개서 N"(N = 그 사용자의 개수+1).
- [ ] C4-2: `GET /api/cover-letters` → 최신순 목록(id,title,source,createdAt,updatedAt). `GET /api/cover-letters/:id` → 본문 포함. 남의 것·없는 id → 404.
- [ ] C4-3: `AiModule.generateText(prompt, opts)`가 키 없으면 호출 없이 `AiUnavailableError`, HTTP 5xx·타임아웃이면 1회 재시도 뒤 같은 오류. 단위 테스트(HTTP mock) 있음. 키·프롬프트 본문을 로그에 남기지 않는다.
- [ ] C4-4: `POST /api/cover-letters/generate` → 이력서 없음/항목 0개 → 400. 성공 → 201 `source:"generated"`, `resumeSnapshot`에 이력서 복사. 프롬프트에 "이력서에 없는 경험·성과를 넣지 말 것" 지시가 들어 있다(테스트가 프롬프트 문자열을 단언). AI 실패 → 502, 저장 안 됨.
