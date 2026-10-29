# 백엔드 구현 계획 (2026-10-29)

바탕: `docs/api.md`, `docs/problem.yaml` features F1~F9, `docs/scenarios.yaml` S1~S6, `loopthon-starter/steps/03-delivery.md`, 위키 「ralph-루프-설계-지침」(2026-10-20)·「ralph-역할분리-결정」(2026-10-01).
개발 방식: 단계마다 **역할 분리 랄프 루프**(검증 → 수정 → 확인, 각각 별도 `claude -p`)로 돈다. 루프 파일은 `server/ralph/`. 운영법은 `server/ralph/README.md`.

## 0. 학생(백엔드 담당)이 먼저 해야 할 것 — 루프가 못 하는 일

순서대로. 1~4는 1단계 루프를 돌리기 전에 끝나야 하고, 나머지는 해당 단계 전에.

- [ ] **0-1 결정 6건 답하기** (progress.md 「2-C 학생 답 대기」): 구현 우선순위, 제외·보류 범위, F3 초안 형식·수정 가능 여부, 답변 판단 AI 실패 시 동작, 첫 화면 이름·한 줄 설명(프런트 팀원), 배포 DB. 답이 없으면 아래 「기본값」으로 루프를 돌리고, 답이 오면 명세를 고친다.
- [ ] **0-2 저장소 구조 합의(프런트 팀원과)**: 루트 `Dockerfile`은 nginx 정적 서빙(PR #13). 백엔드는 `server/`에 NestJS, compose에 `server`·`db` 서비스 추가, nginx가 `/api/`·`/__health`를 `server`로 넘기는 구조(아래 1단계). `frontend/vercel.json`·`frontend/api/health.ts`는 compose 경로와 무관하지만 `/__health` 응답이 둘이 되지 않게 Vercel 쪽 정리는 프런트 팀원이.
- [ ] **0-3 로컬 도구 확인**: node 22, docker 29, compose v5.5, claude 2.1 — 2026-10-29 확인됨. Docker Desktop이 켜져 있어야 루프의 docker 검증이 돈다.
- [x] **0-4 AI 키**: `server/.env`(Git 제외)의 `AI_GATEWAY_API_KEY`에 학생이 직접 입력(2026-10-29 밤). 채팅·커밋에 붙이지 않기. **실제 Gateway 호출 확인은 Agent가 4·5·7단계에서 각 1회, 건당 $0.05 상한**(학생 결정 2026-10-29). 결과는 `server/ralph/reviews/C<n>-manual.md`에 기록하고, 호출한 날 학생이 **자료 → API 키**에서 사용액을 알려 준다.
- [ ] **0-5 배포 DB 방식(8단계 전)**: 기본값은 Lightsail 컨테이너 서비스 안에 `db`(mongo) 컨테이너를 같이 두는 것(데이터는 재배포 때 사라지고 시드가 다시 만들어짐 — 발표용이면 충분). 가입한 계정을 재배포 뒤에도 남기려면 MongoDB Atlas 무료 등급을 학생이 만들고 연결 문자열을 Lightsail 환경변수 `DATABASE_URL`에 직접 입력. 팀이 고른다.
- [ ] **0-6 Lightsail 배포 담당(8단계 전)**: 배포는 이미 AWS Lightsail 컨테이너 서비스에 있음(2026-10-29 확인, 주소 `t1-project.….ap-northeast-2.cs.amazonlightsail.com`, commit c19aab2 = nginx 정적만). 누가 올렸고 재배포 권한이 누구에게 있는지, 수동 재배포로 갈지 CI 자동 배포(GitHub Secrets에 AWS 자격 증명)로 갈지 팀이 정한다. **학생 답 대기.**
- [ ] **0-7 대시보드 화면 확인** 요청이 오면: **자료 → 제출 요건**(노란 줄), **우리 팀**(UP·배포 commit). 1단계 push 뒤와 최종.
- [ ] **0-8 루프 돌리기**: 단계마다 `server/ralph/ralph.sh` 실행, 끝나면 결과를 보고 PR 올리기. 루프 중 `BLOCKED.md`가 생기면 사람이 판단(명세 고치기 / 되돌리기 / 표지판 추가).

### 답이 없을 때의 기본값 (루프 명세에 적용, 답 오면 교체)
| 결정 | 기본값 | 근거 |
| --- | --- | --- |
| 우선순위 | 아래 단계 순서(03-delivery 순서 + 흐름 의존) | 주최 측 실행 경로가 먼저 |
| 제외·보류 | 7단계(음성 전사·TTS)는 E2E 대상이 아니라 마지막 | 테스트 브라우저에 마이크·소리 없음 |
| F3 초안 | 한 덩어리 본문, 수정 API 없음 | api.md 그대로 |
| 답변 판단 실패 | 답변 저장 + 502, 재시도 가능 | api.md 그대로 |
| 배포 DB | MongoDB(Atlas) | 팀원 설계 |

## 1. 단계 (= 랄프 루프 1회분, 명세 파일 하나씩)

| 단계 | 명세 | 기능 | 끝의 증거(사람이 확인) | 학생이 먼저 할 것 |
| --- | --- | --- | --- | --- |
| 1 | `01-skeleton.md` | NestJS 뼈대, `/__health`, `server/Dockerfile`, compose에 server·db, nginx 프록시, DATABASE_URL 연결, 시드 계정, README 환경변수 표 | `docker compose down -v && up -d --build` 뒤 2분 안 `/__health` 200·releaseId, CI 통과, 제출 요건 화면 노란 줄 없음 | 0-2, 0-3 |
| 2 | `02-auth.md` | F1 가입·로그인·로그아웃·me, 세션 쿠키, 소유자 검사 공통 가드 | 시드 계정으로 로그인 API 200, 잘못된 비밀번호 401 | — |
| 3 | `03-resume.md` | F2 템플릿 9항목, GET/PUT /api/resume, 검증 | PUT 뒤 GET이 같은 내용, 빈 항목 400 | — |
| 4 | `04-cover-letters.md` | F4 등록, F3 AI 초안(Gateway LLM 모듈, 키 없음 → 502), 목록·단건 | 등록·조회 OK, 키 없을 때 502, 키 있을 때 초안 생성 1회 실제 확인(비용 ≤ $0.05) | 0-4 |
| 5 | `05-interview.md` | F5 세션 생성·본질문 4개(실패 시 템플릿), F6 답변·판단·한도, F7 건너뛰기·종료 | 글자 답변 1회 → 다음 질문, 종료 → finished | — |
| 6 | `06-result.md` | F8 결과 생성·조회, 수정 제안 승인·거절, 시드 끝난 면접 | 승인 뒤 자소서 본문 변경 | — |
| 7 | `07-speech.md` | F6 전사(`/api/speech/transcribe`), F5 TTS | 짧은 녹음 1건 전사 실제 확인 | 0-4 |
| 8 | (루프 아님) | Lightsail 컨테이너 서비스에 app(nginx)·server(NestJS)·db(mongo) 재배포, 대시보드 배포 URL 재저장 | 대시보드 UP·`releaseId`가 main 최신 SHA와 일치 | 0-5, 0-6 |
| 9 | `09-e2e.md` (프런트 합류 후) | `e2e/` 키트 복사, S1~S6 spec, 빈 DB docker에서 통과 | 6개 흐름 통과, 제출 요건 노란 줄 없음 | 프런트 화면 완성, 버튼 이름 확정 |

1단계 구조 결정(Agent 기술 선택, 바꾸려면 `01-skeleton.md`만 고침): compose `app`은 기존 nginx 그대로 두고 `/api/`·`/__health`를 `server:3000`으로 proxy_pass. `server`는 NestJS(ports 없음), `db`는 `mongo:7`(ports·container_name 없음, 이름 붙은 볼륨, healthcheck). `/__health`는 server가 응답(releaseId = 빌드 인자). nginx의 기존 `/__health`는 proxy로 교체. 이유: 프런트 팀원 구성을 깨지 않고, 브라우저는 3000번 app 하나만 거친다는 규칙을 지킨다.

## 1-8. 8단계 상세 — Lightsail 배포 (2026-10-30 갱신, 기본 배포 플랫폼을 Vercel에서 Lightsail로 바꿈)

현재 상태: 대시보드 「서비스」에 `/__health` 200·공개 HTTPS 배포 ✓, 배포 commit c19aab2(프런트 nginx 정적만). main 최신에는 server·db가 있어 재배포가 필요하다.

구조: Lightsail 컨테이너 서비스 하나에 컨테이너 3개를 같은 배포로 올린다. 공개 엔드포인트는 `app`(nginx, 3000)만. 컨테이너끼리는 같은 배포 안에서 `localhost`로 통신하므로 nginx의 `proxy_pass http://server:3000`은 배포용 설정에서 `http://localhost:3000`으로 바뀌어야 한다(compose용과 배포용 템플릿을 환경변수 `SERVER_UPSTREAM`으로 갈라 둔다 — 구현 시 명세 추가). `server`는 `DATABASE_URL`로 `db`(같은 배포의 mongo, `localhost:27017`) 또는 Atlas를 본다. **compose 파일 자체는 주최 측 실행용이라 바꾸지 않는다.**

절차(AWS CLI는 aws-mcp 도구로, 자격 증명은 학생 계정):
1. 이미지 빌드: `docker build --build-arg RELEASE_ID=$(git rev-parse HEAD) -t t1-app .` / `docker build --build-arg RELEASE_ID=... -t t1-server server/`. `releaseId`는 이 빌드 인자에서 나온다(소스에 고정하지 않음).
2. 이미지 업로드: `aws lightsail push-container-image --service-name <서비스> --label app --image t1-app` (server·mongo도 같은 방식, mongo는 공식 이미지를 그대로 push).
3. 배포 생성: `aws lightsail create-container-service-deployment` — containers: `app`(포트 3000, 환경변수 `SERVER_UPSTREAM=http://localhost:3000`), `server`(환경변수 `RELEASE_ID`·`DATABASE_URL`·`SESSION_SECRET`·`COOKIE_SECURE=true`·`AI_GATEWAY_API_KEY`), `db`(mongo:7). publicEndpoint: `app`:3000, healthCheck path `/__health`.
4. 확인: 배포 URL `/__health`가 200이고 `releaseId`가 main 최신 SHA와 같은지 curl로 확인(리다이렉트 없이).
5. 대시보드 등록: 팀 코드로 `PUT /api/teams/10/deploy {"url": "https://…amazonlightsail.com"}` 다시 저장 → `data.check.up`·`data.check.releaseId` 확인(03-delivery.md 「Agent가 배포 URL 등록·재확인」).
6. 비밀값(`AI_GATEWAY_API_KEY`, `SESSION_SECRET`)은 Lightsail 환경변수에만. 저장소·채팅에 두지 않는다. `COOKIE_SECURE=true`(HTTPS)로 세션 쿠키가 유지되는지 로그인 1회로 확인.

미확인(구현 전에 확인): Lightsail 컨테이너 서비스의 컨테이너 간 통신 주소(`localhost` 가정), 서비스 용량(nano/micro)에서 3컨테이너 메모리, 배포 1회 소요 시간. 자동 배포(GitHub Actions → Lightsail)는 팀이 원하면 `ci.yml` 뒤에 붙인다(AWS 키를 GitHub Secrets에).

## 2. 루프 규칙 (위키 지침 적용)

- **입구**: 각 명세의 완료 기준은 확인할 수 있는 목록(C-번호)이고, 자동 검증(`npm run check` = 타입·린트·테스트, docker·curl)이 있다. 제품 결정은 루프 밖(0절)에서 끝낸다.
- **명세**: 파일 하나에 단계 하나. 모순을 찾으면 verify가 제안하고 사람이 고친다.
- **프롬프트**: 반복마다 주장(C) 하나, 역할 하나. TDD 순서, 임시 구현 금지, "먼저 찾아라", 금지 사항은 `prompts/*.md`와 `AGENT.md`.
- **기억**: 매 반복 올리는 것은 `AGENT.md` + 해당 명세 + `ledger.json`의 그 주장 + 역할 산출물만. 상태 보고는 `AGENT.md`에 넣지 않는다.
- **백프레셔**: verify가 `npm run check`(+ docker 주장은 compose up·curl)를 돌린다. 검증 프로세스는 한 번에 하나.
- **끝내기**: 반복 상한 = 주장 수 × 4 + 2(위키 관찰: ×3보다 크게). 주장별 수정 3회 초과 → `BLOCKED.md`, 멈춤. 완료 판정은 에이전트 선언이 아니라 검사기(`check.mjs`)가 ledger로 한다.
- **역할 분리(8절)**: verify(판정, 코드 수정 금지) → fix(제안만 반영, 검색 금지) → confirm(수정 전 스냅샷과 diff 대조, 수정 금지). 권한은 `--allowedTools`로 강제. 자료 수집은 루프 안에서 하지 않는다.
- **조율(사람)**: 실패마다 `AGENT.md`에 규칙 한 줄. 아침에 깨져 있으면 되돌릴지 사람이 판단.

## 3. 단계 끝 체크 (사람)
1. `ledger.json` 전부 `pass`, `logs/summary.csv` 확인.
2. `docker compose down -v && docker compose up -d --build` → `curl -i localhost:3000/__health`.
3. PR → main. push 뒤 CI 결과, 학생이 **자료 → 제출 요건** 확인.
4. progress.md 3단계 체크박스 갱신. 배운 실패는 `AGENT.md` 표지판으로.
