# 프론트엔드 진행 기록

랄프 루프가 바퀴마다 맨 아래에 세 줄 이내로 이어 쓴다.

- 초기 세팅 완료 (Vite, React, TS, Tailwind v4, React Router, Prettier, Vitest). 다음: specs/ 작성.
- [1] 이전 기획 화면·테스트 삭제, App 라우트는 *만, Layout 메뉴 제거, NotFound 문구·App.test 교체.
  남은 일: 2번 API 타입·클라이언트 교체. 막힌 점 없음(src/mocks·api·auth는 아직 옛 코드).
- [2] 막힘: 정본 ../docs/api.md 를 읽을 권한이 없어(작업 폴더 밖, 승인 불가) API 타입·경로를 알 수 없음. 추측으로 구현하지 않고 중단.
  남은 일: api.md 읽기 권한(또는 frontend/ 안에 사본)을 준 뒤 2번부터 다시 실행. fix_plan.md 는 그대로 둠.
- [2] api.md 타입·클라이언트(Bearer, 401이면 토큰 삭제)·auth 토큰 방식으로 교체, 컴파일용 최소 목(auth만)·render 도우미·client.test.ts 추가.
  남은 일: 3번 목 API ① (db 시드·경험·대화). 막힌 점 없음(prettier 실행은 승인이 필요해 format:check는 18번에서 확인).
- [3] 막힘(시작 전 중단): 시드 계정을 mock-data.md대로 `seeker@example.com`/`loopthon-2026`으로 바꾸면 기존 `src/api/client.test.ts:31`의 `api.login('seed@t1.test', 'seedpass1234')`가 깨진다(옛 시드 계정을 박아 둔 테스트라 스펙과 어긋남).
  이 테스트는 3번 작업이 이름으로 고치라고 적은 파일이 아니라 고치지 않음. 해결: fix_plan 3번에 "client.test.ts의 로그인 계정을 시드 계정으로 바꾼다"를 더하거나 사람이 직접 고친 뒤 3번부터 다시 실행.
- [3] 다시 실행했지만 막힘 그대로(fix_plan 3번에 client.test.ts 수정 지시가 없고, 테스트는 여전히 `seed@t1.test`로 로그인). 구현하지 않고 중단.
- [3] 세 번째 실행도 같은 이유로 중단(fix_plan 3번·client.test.ts 모두 그대로). 사람이 fix_plan 3번에 client.test.ts 로그인 계정 수정을 적거나 직접 고쳐야 진행 가능.
- [3] 목 db를 api.md 모양·mock-data 시드(seeker 계정, 경험 2개, 자소서 1개)로 다시 쓰고 계정·경험·단서·대화·사실 확정/직접 추가 경로 추가, client.test.ts 로그인 계정 교체, handlers.test.ts 추가.
  남은 일: 4번 목 API ② 자소서(db.coverLetters 시드는 이미 있음). 막힌 점 없음(setup.ts server export·render 토큰 도우미는 2번에서 이미 됨, prettier는 승인 필요라 18번에서).
- [4] 자소서 목 경로(붙여넣기·조회·수정·작성 시작·추천·카드 고르기·응답·고친 응답 409) 추가, coverLetters.test.ts 추가.
  남은 일: 5번 목 API ③ 점검(자소서 수정·문항 응답 수정·생성 때 점검 stale 처리를 자소서 경로에 더해야 함). 막힌 점 없음.
- [5] 점검 목 경로(만들기·목록·조회·문장 시작·답하기·후보 확정/버리기) 추가, 자소서 수정·문항 응답 수정·생성 때 점검 stale, db v3(checks), checks.test.ts 추가. client의 newCandidates 타입을 Check['candidates']로(api.md 9절 experienceId).
  남은 일: 6번 공통 레이아웃. 막힌 점 없음(시드 2·3번 문장은 mock-data 표대로 한 문장을 '높였고,' 뒤에서 나눈 두 절로 둠).
- [6] 헤더(로그인 전·후), RequireAuth·RequireUnlocked 가드, useAiCall·AiStatus, StatusRow, StageBlock, 401 이벤트 추가, common.test.tsx 추가.
  남은 일: 7번 A 소개·B 가입·로그인(App 라우트에 가드를 붙이는 건 각 화면 작업에서). 막힌 점 없음(가드 테스트는 화면이 없어 자리 표시 라우트로 검사).
- [7] Intro(A) 신설, AuthPage를 스펙 글자·로그인 상태 리다이렉트(원래 주소 복귀)로 정리, App 라우트 `/`·`/signup`·`/login` 추가, auth.test.tsx 추가.
  남은 일: 8번 C 홈 잠금·목록(`/cover-letters` 라우트와 RequireAuth 연결). 막힌 점 없음(lint 경고는 기존 useLoad.ts 것).
- [8] Home(C) 신설: 잠금 안내·열린 상태 목록, App에 RequireAuth로 /cover-letters 연결, Home.test.tsx(S1 흐름 포함) 추가.
  남은 일: 9번 D 경험 목록·E 경험 등록. 막힌 점 없음(lint 경고는 기존 useLoad.ts 것).
- [9] Experiences(D)·ExperienceNew(E) 신설, App에 /experiences·/experiences/new 연결, Experiences.test.tsx 추가(업로드 실패 시 navigate state clueFailed 전달).
  남은 일: 10번 F 경험 상세(clueFailed 안내 표시 포함). 막힌 점 없음(lint 경고는 기존 useLoad.ts 것).
- [10] ExperienceDetail(F) 신설: 제목·시기 수정, 단서 목록·추가, 대화(자동 시작·보내기·다시 시도), 항목 상태, returnTo, App 라우트 연결, ExperienceDetail.test.tsx 추가.
  막힌 점: 기존 Experiences.test.tsx의 "대화 시작 → 없는 페이지예요" 테스트가 이제 실패함(그 주석이 10번에서 바뀐다고 적음). 규칙상 고치지 않았으니 사람이 상세 화면 확인으로 바꿔야 함. 남은 일: 11번.
- [11] FactPanels 신설(후보 확정·버리기, 경험 카드 고치기·지우기·직접 추가)을 ExperienceDetail에 연결, FactPanels.test.tsx(S2 흐름 포함) 추가.
  남은 일: 12번 G 붙여넣기. 막힌 점: 10번에서 적은 Experiences.test.tsx의 "대화 시작 → 없는 페이지예요" 테스트는 그대로(사람이 고쳐야 함).
- [12] CoverLetterPaste(G) 신설, App에 RequireUnlocked로 /cover-letters/paste 연결, CoverLetterPaste.test.tsx(S3 흐름·잠금) 추가.
  남은 일: 13번 H 작성 시작. 막힌 점: J(15번) 전 이라 저장 뒤 상세 본문 확인은 못 하고 목록 증가로 검사함.
- [13] CoverLetterNew(H) 신설: 우대사항·인재상·문항 추가/빼기·작성 시작, App에 RequireUnlocked로 /cover-letters/new 연결, CoverLetterNew.test.tsx 추가.
  남은 일: 14번 I 문항별 작성. 막힌 점: I 화면 전이라 작성 시작 뒤 이동은 없는 페이지예요로 검사함(14번에서 그 테스트를 바꿔야 할 수 있음).
- [14] common·ExperienceDetail(2)·Experiences 테스트의 선택자·기대를 영역 안 검색/경험 상세 확인으로 고침, 전체 vitest 통과.
  남은 일: 15번 I 문항별 작성. 막힌 점 없음(전체 실행에서 타임아웃성 flake가 가끔 나옴).
- [15] CoverLetterWrite(I) 신설: 진행 막대·문항 이동, 추천(NO_CONFIRMED_FACTS 안내)·카드 토글·사용 중·사실 보기/보강, 만들기(덮어쓰기 확인창·409), 응답 저장·근거 카드·다음 문항, App 라우트, CoverLetterWrite.test.tsx(S5 포함) 추가.
  CoverLetterNew.test.tsx의 '없는 페이지예요' 기대를 I 화면 제목 확인으로 바꿈(규칙 6 예외). 남은 일: 16번 J 자소서 상세. 막힌 점 없음.
- [16] CoverLetterDetail(J) 신설: 붙여넣음 본문 수정·저장, 작성함 문항 응답·근거 카드·보강하기·카드 다시 고르기·이 문항 쓰기, 점검 시작·지난 점검(오래됨), App 라우트, 테스트 추가.
  남은 일: 17번 K 제출 전 점검(/checks/:checkId 라우트는 아직 없음). 막힌 점 없음.
- [17] CheckPage(K) 신설: 진행 막대·점검할 문장 목록(누르면 오른쪽에 열기)·자동 start·질문/내 답/판정(J1~J4 충족·빠짐)·남은 추가 질문·답하기·다음 문장·모든 문장 끝 안내·빈 목록, 오래됨 띠·잠금·새 점검 시작(409 CHECK_STALE도 전환), App 라우트, CheckPage.test.tsx(S6 포함) 추가.
  남은 일: 18번 고치기·경험 대화 바로가기·사실 후보 카드에 저장(답하기 응답의 newCandidates는 아직 화면에 안 씀). 막힌 점 없음.
- [18] CheckExtras 신설: 끝난 문장의 `자소서에서 고치기`·`관련 경험 대화 이어가기`(근거 카드 하나면 바로, 여럿·붙여넣음이면 목록), `카드에 넣을 사실` 후보(카드에 저장 폼·버리기), newCandidates 반영, CheckExtras.test.tsx 추가.
  남은 일: 19번 마무리(npm run check). 막힌 점: 기본 워커 수의 전체 vitest는 무관한 테스트가 가끔 타임아웃 flake(--maxWorkers=2면 통과).
- [19] prettier 서식 정리(서식만), vitest testTimeout/hookTimeout 20초로 올려 부하 flake 제거, npm run check 전체 통과.
  남은 일: 없음. 막힌 점 없음.
