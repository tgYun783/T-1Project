너는 T-1Project 프론트엔드(Vite + React + TypeScript + Tailwind v4)를 만드는 중이다. 이번 실행에서는 작업 하나만 끝내고 종료한다.

먼저 specs/ 아래 모든 파일, fix_plan.md, progress.md 를 읽어라. 필요하면 ../docs/api.md(서버 호출), ../docs/scenarios.yaml(E2E 시나리오), ../docs/design/DESIGN.md(스타일)를 읽어라. 기능의 정본은 ../docs/problem.yaml 의 functional_spec 이다. ../docs/ 는 읽기만 하고 절대 고치지 마라.
화면 글자(버튼·메뉴·입력칸 이름)는 specs/ 에 적힌 그대로 쓰고 바꾸지 마라. E2E가 그 글자로 화면을 찾는다.

1. fix_plan.md 에서 아직 체크되지 않은 작업 중 맨 위의 것 하나만 골라라.
2. 구현하기 전에 src/ 를 검색해서 이미 구현돼 있는지 확인하라. 있다고 가정하지도, 없다고 가정하지도 마라.
3. specs/ 에 적힌 대로 구현하라. 스펙에 없는 기능, 라이브러리, 파일은 만들지 마라.
4. 임시 구현, 빈 컴포넌트, TODO 로 넘어가지 마라. 그 작업은 끝까지 구현하라.
5. 이미 있는 *.test.ts(x) 파일은 수정하거나 지우지 마라. 예외는 fix_plan.md 의 작업이 그 파일을 지우거나 고치라고 이름으로 적은 경우뿐이다(파일 삭제는 `git rm`). 테스트가 틀렸다고 생각되면 progress.md 에 이유를 적고 멈춰라. 새 기능에는 같은 폴더에 새 테스트 파일을 추가해도 된다.
6. 이번 작업의 테스트를 `npx vitest run <파일>` 로 실행해 통과시킨 뒤, 커밋 전에 전체 `npx vitest run` 도 실행하라. 전체가 통과하고 `npm run typecheck` 와 `npm run lint` 에 새 오류가 없을 때만 git 에 커밋하라. 이번 변경 때문에 이전 작업의 테스트가 깨졌고 그 원인이 "같은 글자가 화면에 늘어남"이나 "아직 없던 화면을 '없는 페이지예요'로 검사함"뿐이면, 그 테스트의 선택자·기대만 스펙에 맞게 고쳐도 된다(확인하던 동작을 지우거나 약하게 만들지 마라). 앞으로 만들 화면을 '없는 페이지예요'로 검사하는 테스트는 쓰지 마라. 커밋 메시지는 "ralph: <작업 이름>" 형식으로 써라.
   6-1. 디자인 작업은 fix_plan.md 2차 머리말과 ../docs/design/POLISH.md 「확인 순서」대로 `npm run shot` 으로 전후 스크린샷을 찍고, png 파일을 Read 로 열어 직접 보고 판단하라. 와이어프레임 png(../docs/design/wireframes/)와 다른 점을 progress.md 에 적어라.
7. fix_plan.md 에서 끝낸 작업을 [x] 로 체크하고, progress.md 맨 아래에 한 일, 남은 할 일, 막힌 점을 세 줄 이내로 적어라.
8. 같은 작업에서 테스트가 3번 연속 실패하면 막힌 이유를 progress.md 에 적고 fix_plan.md 에 [!] 로 표시한 뒤 종료하라.
9. fix_plan.md 의 모든 작업이 [x] 이고 `npm run check` 가 전부 통과하면 마지막 줄에 정확히 RALPH_COMPLETE 라고 출력하라. 그 외에는 이 단어를 출력하지 마라.
