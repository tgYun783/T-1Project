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
- [20] 목 API에 /api/resume(조회·활동 나누기·초안 추가/수정/삭제·확정) 추가, POST /api/experiences와 createExperience 삭제, 경험 summary·시드 이력서·라라테크 자소서 추가, resume.test.ts 추가.
  남은 일: 21번(ExperienceNew는 지울 때까지 addDraft+confirmDrafts로 임시 연결). 시드 자소서가 2개가 되어 coverLetters.test(목)·CoverLetterWrite.test S5의 생성 자소서 수를 시드 빼고 세도록 고침.
  막힌 점: 전체 vitest에서 매번 다른 화면 테스트 하나가 가끔 부하 flake로 실패(단독·재실행은 통과).
- [21] Resume(E) 신설(붙여넣기·활동 나누기·확인할 활동 고치기/빼기/직접 추가·경험 만들기), ExperienceNew 삭제, /resume 라우트, 홈 `이력서 입력`·목록 `이력서에서 활동 추가`, 경험 상세 왼쪽 활동 목록, Resume.test.tsx 추가, Experiences/Home/FactPanels 테스트를 새 흐름(S2 포함)으로 수정.
  남은 일: 22번 디자인 기반(경험 상세 세 칸 배치는 23번). 막힌 점: 기본 워커 수 전체 vitest에서 CoverLetterPaste 같은 무관한 테스트가 가끔 부하 flake(단독·--maxWorkers=2는 통과).
- [22] before 걸림: home H6(라일락 큰 면)·헤더 구분선 없음, experience H1·H5(64px 섹션 제목 넷)·H6(라임 면 30% 넘음)·M5(점선 행 5개). index.css에 line·ink-60·fill 토큰, card·stage-chip·chip(ok/need/miss/next)·meter, StageBlock=흰 카드+StageChip, StatusChip·Meter(쓰기·점검 막대도 교체), 헤더 아래 선·밑줄 메뉴, 섹션 제목 label, 활동 목록 지금 행 lime, 소개는 색 블록 유지.
  와이어프레임(ask.png)과 다른 점: 경험 상세 제목 64px(와이어 28px)·대화가 말풍선 아님·입력칸이 대화 밑에 붙지 않음·두 칸 배치·목록 메타(설명됨 N/5) 없음 → 23번. 홈 목록은 회색 면 행(흰 카드+선 아님) → 27번. 막힌 점 없음.
- [23] before 걸림: experience H1(64px 제목 vs 대화)·D6(두 칸+위 카드로 대화가 아래로 밀림)·M3(고치기/지우기 흰 알약 10개)·M5(카드 항목마다 행+버튼 반복). 세 칸(활동 220·대화·오른쪽 320, 1000px 아래 활동 목록 위 가로, 폰 쌓기), 제목 page-title 28px·이력서 인용·단서 칩, 말풍선 대화(AI 옅은 면 왼쪽·나 검정 오른쪽)와 바로 아래 입력칸+보내기, 활동 목록 메타(설명됨 N / 5·아직 시작 안 함), 확인할 사실 점선 상자 하나+개수, 경험 카드 이름표+글+출처 한 줄과 btn-ghost(버리기·고치기·지우기·직접 추가·단서 추가).
  와이어프레임과 다른 점: 항목 상태 칩에 상태 글자가 붙어 줄바꿈(M4·기존 테스트), 항목 상태 머리 메타 '설명됨' 없음(테스트의 getByText('설명됨')과 겹침), 빈 항목도 점선 '비어 있음'(스펙), 사실마다 출처·고치기/지우기 줄. `오른쪽 상태를…` 안내는 와이어프레임대로 입력칸 아래(스펙 04는 '입력칸 위'라 사람 확인 필요). 남은 일: 24번 E 이력서 입력. 막힌 점 없음.
- [24] before 걸림: resume H1·H5(64px 제목 둘 `이력서 입력`·`확인할 활동`)·M2(단계 칩 없음, 헤더 `경험` 꺼짐)·D5(한 칸 전폭 입력칸). 단계 칩+page-title(와이어프레임 문구)+오른쪽 메타, 두 칸(이력서 카드: 이름표·마지막 수정·안내+`활동 나누기` 한 줄 / 확인할 활동 카드: 17px 이름표+개수, 옅은 면 행, `빼기` ghost, 점선 `빠진 활동이 있나요?`+`활동 직접 추가`, 전폭 `경험 만들기`(누르는 중 `경험 만드는 중`)), 고치기 폼은 그 활동 자리에, 헤더 `경험`이 /resume에서도 켜짐.
  와이어프레임과 다른 점: 활동 설명이 13px 메타 대신 15px 보조색(H4), 고치기 버튼 44px(와이어 작은 알약), 빈 목록이면 점선 상자 하나에 `확인할 활동이 없어요`+`활동 직접 추가`, 제목 문구는 스펙에 없어 와이어프레임 것을 씀. 남은 일: 25번 J·I. 막힌 점 없음.
- [25] before 걸림: letter H1·H5(64px 제목 둘 `라라테크 백엔드 지원`·`제출 전 점검`)·M2(단계 칩 없음)·D5(응답 한 줄 1200px), write H5(64px `추천 경험 카드`)·M2·D5·한 칸 배치. J: 단계 칩+page-title+메타(응답 N / 문항 M · 작성함), 왼쪽 큰 자소서 카드(문항 칩·17px 문항·64ch 응답·아래 `제출 전 점검 시작`), 오른쪽 근거 경험 카드 세로(사실 목록·`보강하기`), 응답 문장을 누르면 겹치는 글로 근거 사실을 찾아 문장·사실을 크림색으로 짝짓고 그 카드 강조(CoverLetterEvidence.test.tsx), 지난 점검은 아래 카드(cream 칩). I: 왼쪽 큰 카드(문항 탭·작은 진행 막대·응답·`이 문항 만들기`), 오른쪽 추천·다른 카드(체크 상자 토글·사실 보기 ghost)·근거 경험 카드.
  와이어프레임과 다른 점: J에 `응답 저장` 없음(스펙 J에 없음), 문항을 탭이 아니라 모두 펼침(스펙: 응답 없는 문항의 `이 문항 쓰기`가 함께 보여야 함), 오른쪽 아래 점선 안내(카드에 없는 수치…)는 스펙에 없어 뺌, 해커톤 메타 `설명됨 0 / 5`(시드 itemStatus 그대로), 사실 15px(와이어 14px, H4), 붙여넣음은 오른쪽 칸에 지난 점검. 남은 일: 26번 K 점검. 막힌 점 없음.
- [26] before 걸림: check H1·H5(64px 제목 셋 `제출 전 점검`·`점검할 문장`·`카드에 넣을 사실`)·M2(단계 칩 없음)·M5(문장마다 점선 행 4개)·판정이 메타 글자 줄. 단계 칩+page-title(와이어프레임 문구)+오른쪽 끝난 문장 메타·막대, 두 칸(300px 문장 목록: 흰 행+상태 칩(대기 빈 칩·진행 중 검정·설명됨 초록 점·추가 확인/모름 점선), 지금 문장 cream+굵은 테두리 / 큰 카드: 상태 칩·22px 인용·`질문 ·` 굵게·`내 답 ·`·J1~J4 칩(충족 초록 점·빠짐 코럴)·선 아래 답변+옆 `답하기`), 사실 후보는 오른쪽 아래 17px 이름표 카드, 오래됨 띠는 가로 한 줄.
  와이어프레임과 다른 점: 큰 카드 맨 위에 현재 문장 상태 칩(테스트가 카드 안 상태 글자를 찾음), `내 답` 이름표 보임(스펙), 인용 속 수치 강조·`답을 기다리는 중` 글자 없음(스펙에 없음), 문장 15px(와이어 14px, H4). 남은 일: 27번 A·C·D. 막힌 점 없음.
- [27] before 걸림: intro H5(104px display+64px 단계 이름 셋)·D1(한글 -0.045em)·빈 200px 코럴 면, home H1·H3(26px 행 제목 둘이 겨룸, 큰 제목 없음)·회색 면 행이 카드 밖, experiences H5(64px `경험`)·M5(항목 점선 칸 반복). A: h1(-0.03em) 하나+낮은 단계 색 블록(card-title 26px)+한 줄 코럴 CTA. C: 단계 칩+page-title `내 자소서`+오른쪽 버튼, 흰 카드 안 행 링크(17px 제목·종류 칩·응답 N/M+막대), 잠금은 640px 카드에 page-title 안내. D: 단계 칩+page-title+`N개`, 두 열 흰 카드(제목 링크로 카드 전체 누름·확정 항목 N/5 막대·항목 칩 초록 점/점선·`확인 대기 N` 칩).
  와이어프레임(이 셋은 png 없음, 원칙만)과 다른 점: 제목 `내 자소서`·목록 이름표 `최근 수정순`·코럴 안내 한 줄은 스펙에 없는 장식 문구, 소개는 스펙대로 단계 색 블록 유지(약 25% 면적). 남은 일: 28번 B·G·H·L. 막힌 점 없음.
- [28] before 걸림: login H1·H5(80px `로그인`이 빈 480px 카드에서 폼과 겨룸), paste·new H5(64px 제목 상자)·M2(단계 칩 없음)·D5(1232px 전폭 입력칸), new M3(문항마다 `빼기` 흰 알약), L H5·H6(64px+cream 큰 면). B: 가운데 440px 카드 하나(page-title·입력칸·주 버튼·선 아래 전환 링크). G: 단계 칩+page-title, 720px 카드에 입력칸·오른쪽 `저장`. H: 단계 칩+page-title, 두 칸(지원 정보 / 문항+`빼기` ghost+`문항 추가`+선 아래 `작성 시작`). L: 640px 흰 카드(404 메타·page-title·`홈으로` 주 버튼).
  와이어프레임(이 넷은 png 없음, 원칙만)과 다른 점: B에 단계 칩 없음(계정은 단계가 아님), L은 shot 화면 목록에 없어 스크린샷 없이 원칙만 적용. 남은 일: 29번 2차 마무리. 막힌 점 없음.
- [29] `npm run check` 전체 통과(코드 변경 없음). `npm run shot -- --tag final`로 11화면을 찍어 보고 POLISH 1·2절 확인: 큰 제목 화면당 하나(page-title 28/36px, 소개만 h1), 검정 200×200 덩어리 없음, 단계 색 면적 30% 아래(소개 약 20%), 검정 주 버튼 화면·카드당 하나, 점선은 빈 칸·미확인 후보에만, 단계 색 lime/lilac/cream/coral 일관 → 고칠 곳 없음.
  와이어프레임과 같은 예외: 경험 상세 `3/5` 40px 숫자와 점검 인용 22px로 글자 크기가 5종(H3 경계, 와이어프레임 ask·check 그대로), 항목 칩 상태를 점·점선 모양으로만 표시(목록 화면, ask.png와 같음). L 없는 주소는 shot 목록에 없어 스크린샷 없음.
  남은 일: 없음. 막힌 점: 측정 스크립트(node 실행)는 권한이 없어 수치는 CSS·스크린샷으로 판정함.
