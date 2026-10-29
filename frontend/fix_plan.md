# 할 일 목록

위에서부터 하나씩. 끝내면 [x], 막히면 [!].
스펙: `specs/` (2026-10-30 새 기획). 이전 기획(이력서·모의면접) 코드는 1번에서 지운다.
각 작업의 완료 조건 = 그 작업 스펙의 「테스트」 항목이 vitest로 통과하고, `npm run typecheck`·`npm run lint`에 새 오류가 없다.
테스트는 화면 글자(버튼·입력칸 이름)로 요소를 찾는다. 글자는 `specs/`의 것을 그대로 쓴다.

- [x] 1. 이전 기획 코드 정리: `src/pages/Resume.tsx`, `src/pages/interview/` 전체, `src/pages/cover-letters/` 전체, `src/pages/Home.tsx`, `src/lib/media.ts`, 이전 기획을 검사하는 `src/flows.test.tsx`를 `git rm`으로 지운다. `App.tsx` 라우트는 `*`(NotFound)만 남긴다. `src/components/Layout.tsx`의 메뉴에서 지운 화면으로 가는 항목(`내 이력서`, 모의면접, 면접 기록, 이전 자소서 메뉴)을 뺀다. `src/pages/NotFound.tsx`의 글자를 `없는 페이지예요`·`홈으로`로 바꾸고, `App.test.tsx`는 없는 주소에서 이 두 글자가 보이는지만 검사하도록 맞춘다(specs/00-common.md L). 이 단계에서 `src/mocks/`·`src/api/`는 건드리지 않는다(2·3번에서 교체). `npm run typecheck`가 통과해야 한다.
- [x] 2. API 타입·클라이언트 교체: `src/api/types.ts`를 docs/api.md 2절 타입으로, `src/api/client.ts`를 api.md 경로 전체 함수로 바꾼다. 토큰은 localStorage, 모든 요청에 `Authorization: Bearer`, `401`이면 토큰 삭제(specs/00-common.md). `src/auth/`도 토큰 방식으로 맞춘다. 테스트: Bearer 헤더가 붙는지, 401이면 토큰이 지워지는지.
- [x] 3. 목 API ① 기반·계정·경험: `src/mocks/db.ts`를 api.md 2절 데이터 모양과 `specs/mock-data.md` 「시드」(계정, 경험 2개, 자소서 1개)로 다시 쓰고, `handlers.ts`에 api.md 3~6절(계정, 경험, 단서, 경험 대화, 사실 확정·직접 추가)을 넣는다. 대화는 mock-data.md 「경험 대화」 고정 동작. 테스트에서 `server.use`를 쓸 수 있게 `src/test/setup.ts`의 MSW 서버를 export하고, `src/test/render.tsx`의 로그인 도우미를 토큰 방식으로 맞춘다. 시드 계정이 `seeker@example.com`/`loopthon-2026`으로 바뀌므로, 옛 계정(`seed@t1.test`)으로 로그인하는 `src/api/client.test.ts`의 로그인 계정도 시드 계정으로 고친다(이 파일은 이 작업에서 고쳐도 된다). 테스트: 시드 계정 로그인, 경험 2개 조회, 대화 답 한 번에 항목 상태가 바뀌고 후보가 생기는지, 후보 확정 시 `ai_unverified`가 거부되는지.
- [x] 4. 목 API ② 자소서: api.md 7·8절(붙여넣기, 조회·수정, 작성 시작, 추천, 카드 고르기, 문항 응답, 덮어쓰기 확인 `409`)을 넣는다. 추천·응답은 mock-data.md 고정 동작. 테스트: 시드 자소서 조회, 빈 본문 `400`, 추천 → 카드 고르기 → 응답 생성, `answerEdited` 응답에 확인 없이 다시 만들면 `409`.
- [x] 5. 목 API ③ 점검: api.md 9절(점검 만들기, 목록, 문장 시작, 답하기, 후보 확정·버리기, 오래됨)을 넣는다. 문장 고르기·판정은 mock-data.md 고정 동작. 테스트: 시드 자소서 점검이 네 문장을 고르는지, "재지 않았" 답이 `unknown`인지, 자소서를 고치면 점검이 `stale`이 되고 답하기가 `409 CHECK_STALE`인지.
- [x] 6. 공통 레이아웃: 헤더(로그인 전·후), 로그인 보호, 자소서 잠금 가드, AI 진행·실패·`다시 시도` 컴포넌트, 상태 표시 컴포넌트, 단계 색(specs/00-common.md). 테스트: 로그인 안 한 채 `/experiences`면 로그인 화면, 확정 카드 없는 계정으로 `/cover-letters/paste`면 홈 잠금 안내, `로그아웃`이면 토큰 삭제.
- [x] 7. A 소개·B 가입·로그인 (specs/01-auth.md, 시나리오 S1).
- [x] 8. C 홈 잠금·목록 (specs/02-home.md, S1·S3). S1 흐름 테스트: 소개 → `가입하기` → 가입 → 잠금 안내와 `경험 등록`.
- [x] 9. D 경험 목록·E 경험 등록 (specs/03-experiences.md).
- [x] 10. F 경험 상세 — 위 영역·대화·항목 상태 (specs/04-experience-detail.md, S4).
- [x] 11. F 경험 상세 — 사실 후보 확정·경험 카드·직접 추가 (specs/04-experience-detail.md, S2). S2 흐름 테스트: 가입 → `경험 등록` → 등록 → `직접 추가` → `카드에 추가` → `자소서` 메뉴에서 `새로 쓰기`가 보임.
- [x] 12. G 붙여넣기 (specs/05-cover-letters.md, S3). S3 흐름 테스트.
- [x] 13. H 작성 시작 (specs/05-cover-letters.md).
- [x] 14. 깨진 테스트 정리: 뒤 작업에서 화면이 생기거나 같은 글자가 늘어 깨진 이전 테스트 4개를 고친다(이 작업에서 이 파일들은 고쳐도 된다). `src/components/common.test.tsx`(헤더: 소개 화면의 `로그인`과 헤더 `로그인`이 겹침 → 헤더 영역 안에서 찾기), `src/pages/ExperienceDetail.test.tsx` 두 개(답 글·`상황`이 대화·후보·카드에 함께 보임 → 해당 영역 안에서 찾기), `src/pages/Experiences.test.tsx`(`대화 시작` 뒤 `없는 페이지예요` 대신 경험 상세가 열리는지). 테스트가 확인하던 동작은 줄이지 말고 선택자·기대만 스펙에 맞게 바꾼다. 완료 조건: 전체 `npx vitest run` 통과.
- [x] 15. I 문항별 작성 (specs/06-write.md, S5). S5 흐름 테스트: `새로 쓰기` → 입력 → `작성 시작` → 캡스톤 카드 켜기 → `이 문항 만들기` → 응답과 근거 카드.
- [x] 16. J 자소서 상세 — 붙여넣음·작성함·점검 입구·지난 점검 (specs/05-cover-letters.md).
- [x] 17. K 제출 전 점검 — 문장 목록·질문·판정·다음 문장·오래된 점검 (specs/07-check.md, S6). S6 흐름 테스트.
- [x] 18. K 제출 전 점검 — 고치기·경험 대화 바로가기, 사실 후보 카드에 저장 (specs/07-check.md).
- [x] 19. 마무리: `npm run check` 전체 통과. 실패하면 고친다. 스펙에 없는 화면·파일이 남아 있지 않은지 `src/`를 확인한다.
