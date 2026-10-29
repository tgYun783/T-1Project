# 백엔드 구현 계획 v2 (2026-10-30)

바탕: `docs/api.md`(2026-10-30 새 API 명세), `docs/problem.yaml` `functional_spec`(R1~R13, C1~C5), `docs/scenarios.yaml` S1~S6, `frontend/specs/`(00-common 라우트, mock-data 시드), `docs/develope/backend-guide.md`, `loopthon-starter/steps/03-delivery.md`.
이전 계획(F1~F9: 이력서·템플릿 자소서·모의면접·음성)은 버린다. 그 기준으로 만든 세션 쿠키 인증은 `feature/backend-plan` 브랜치에만 있고 main에 넣지 않는다.
개발 방식: 명세 하나 = 단계 하나 = 랄프 루프 1회. 역할 분리(verify → fix → confirm, 단계 끝 sweep). 운영법은 `server/ralph/README.md`.

## 1. 지금 상태

| 항목 | 상태 |
| --- | --- |
| main | 1단계(명세 01) 완료: NestJS 뼈대, `/__health`, 전역 예외 필터, Mongo 연결, 시드 계정 1명, CI. compose는 `app`(nginx+프런트) · `server`(NestJS) · `db`(mongo:7) |
| 문제 1 | 시드 계정이 `server`에만 있다. 주최 측 실행·`scenarios.yml`은 `services.app.environment`에서 읽으므로 **E2E 로그인이 실패한다** |
| 문제 2 | Lightsail에는 compose가 없어 nginx 설정의 `server:3000`을 찾지 못하고, 같은 배포의 컨테이너는 `localhost`를 함께 써서 둘 다 3000이면 겹친다 |
| 문제 3 | nginx 기본 한도(본문 1MB, 응답 대기 60초)로는 단서 파일 5MB·AI 재시도가 막힌다 |
| 인증 | api.md가 세션 쿠키 → **JWT(Bearer)** 로 바뀜. 예전 구현은 재사용하지 않고 새로 만든다 |
| 프런트 | `frontend/` 팀원 랄프 진행 중(MSW 목 API). 화면 글자·라우트·시드는 `frontend/specs/`가 정본 |
| 기각 | 음성 모의면접(모의면접·음성·카메라·면접 결과), `interview-engine/`은 이번 범위 밖 |

## 2. 구조 결정 (Agent 기술 선택 — 바꾸려면 해당 명세만 고친다)

- **nginx 유지**(학생 결정 2026-10-30): compose는 `app`(nginx)·`server`(NestJS)·`db` 그대로. → 명세 02.
  - 시드 계정을 `app`에도 `server`와 같은 값으로 적는다(채점이 `app`에서 읽음).
  - 서버는 `PORT`(기본 3001), nginx가 넘길 주소는 `API_UPSTREAM`(compose `http://server:3001`, Lightsail `http://localhost:3001`). 환경 사이 차이는 이 값 하나.
  - nginx `client_max_body_size 6m`, `proxy_read_timeout 120s`.
  - 없는 화면 주소는 지금처럼 화면 200 + 「없는 페이지예요」, `/api/없는것`은 404 JSON.
  - **프런트 팀원에게 알릴 것**: 루트 `Dockerfile`에 `ENV API_UPSTREAM` 한 줄, nginx 템플릿 수정. `frontend/`는 건드리지 않는다.
  - 대안이었던 「NestJS 하나로 합치기」는 이미지가 하나라 환경 차이가 없지만, 프런트 팀원 파일을 크게 바꿔야 해서 택하지 않음.
- **DB**: MongoDB 유지(mongoose). 파일 단서는 Mongo 안에 저장(배포 컨테이너에 디스크 없음).
- **인증**: `@nestjs/jwt`, 전역 가드 + `@Public()`, 남의 자원은 404. 비밀 `JWT_SECRET`(compose에 로컬 리터럴, 비면 무작위 생성 후 기동).
- **AI**: `AiService.json()` 하나로 Gateway(OpenAI 호환) 호출, 모델 `openai/gpt-6.1-terra`(팀 결정, `AI_MODEL`로 변경 가능), zod 검증, 실패는 모두 `502 AI_UNAVAILABLE`. AI 결과는 믿지 않고 서버가 대조한다(추천 id, 점검 문장, 점검 상태 결정).
- **C2 저장 순서**: AI를 부르는 API는 AI 성공 뒤에만 DB에 쓴다.
- **테스트**: jest + supertest + mongodb-memory-server. 테스트는 실제 Gateway를 부르지 않는다(`FakeAiService`, 전역 fetch 차단).

## 3. 단계 (= 루프 1회분)

| 단계 | 명세 | 요구사항 | 주장 | 끝의 증거(사람) | 사람이 먼저 |
| --- | --- | --- | --- | --- | --- |
| 1 | `01-skeleton` | — | 8 | (완료) | — |
| 2 | `02-compose` | 채점·배포 구조 | 4 (docker 1) | 빈 DB compose에서 `/` HTML, `/__health` 200, `/api/nope` 404, `app`에 시드 값 | 프런트 팀원에게 nginx·Dockerfile 변경 알림 |
| 3 | `03-auth` | R1, C3 | 4 | 시드 계정 로그인 200·토큰, 토큰 없이 401 | — |
| 4 | `04-ai` | C2 | 3 | 키 없을 때 502 JSON | — |
| 5 | `05-experiences` | R2, R5, R6 | 3 | 경험 만들기·단서 파일 올리고 내려받기 | — |
| 6 | `06-conversation` | R3, R4, R5, C1 | 3 | **실제 AI 1회**: 대화 시작+답 1번(≤ $0.05) | AI 키(`server/.env`, 이미 있음) |
| 7 | `07-cover-letters` | R7, R8, R13, C4 | 6 | **실제 AI 1회**: 추천+문항 1개 생성(≤ $0.05) | — |
| 8 | `08-checks` | R9~R12, C4 | 4 | **실제 AI 1회**: 시드 자소서 점검 시작+답 1번(≤ $0.05) | — |
| 9 | `09-seed` | S2~S6 선행 데이터 | 2 (docker 1) | 빈 DB 기동 뒤 시드 계정에 경험 2·자소서 1 | 시드 대화 개수 확인(아래 4절) |
| 10 | (루프 아님) | 배포 | — | Lightsail 배포에 컨테이너 2개(nginx 공개 3000 + server 3001, `API_UPSTREAM=http://localhost:3001`), `/__health` releaseId 일치, 대시보드 UP. backend-guide 배포 절 갱신 | 배포 DB 결정 |
| 11 | (프런트와 함께) | E2E S1~S6 | — | 빈 DB docker에서 6개 흐름 통과, 제출 요건 노란 줄 없음 | 프런트가 실제 API로 전환 |

순서 이유: 2(채점 구조)를 먼저 고쳐야 이후 모든 docker 확인이 실제 채점과 같다. 3·4는 5~8 모두가 쓰는 바탕. 5→6→7→8은 데이터 의존 순서(경험 → 사실 → 자소서 → 점검). 9는 모든 모델이 생긴 뒤.
실제 AI 확인은 단계마다 1회, 건당 $0.05 상한(학생 결정 2026-10-29). 결과는 `server/ralph/reviews/C<n>-manual.md`, 사용액은 학생이 **자료 → API 키**에서 확인.

## 4. 루프 전에 정할 것 (루프는 기본값으로 돌고, 답이 오면 명세만 고친다)

| 결정 | 누가 | 기본값(루프용) | 근거 |
| --- | --- | --- | --- |
| 비밀번호 규칙·토큰 만료 | 학생 | 비어 있지 않음·72바이트 이하, 7일(`JWT_EXPIRES_IN`) | api.md 11절 학생 답 대기 |
| 단서 파일 형식·최대 크기 | 학생 | 형식 제한 없음, 5MB(`CLUE_MAX_BYTES`) | api.md 11절 학생 답 대기 |
| 시드 경험 1 대화 메시지 수 | 프런트 팀원 | 질문 5·답 4(마지막이 의의 질문) | mock-data.md 문장이 "질문 4·답 4"와 "마지막은 질문"으로 어긋남 |
| 배포 DB | DB 담당 | — (루프와 무관, 10단계 전) | backend-guide 「배포 환경의 DB」 |
| 삭제 기능(경험·자소서·단서·점검) | 학생 | 만들지 않음 | api.md 11절, 요구사항에 없음 |

## 5. 랄프 루프 설계

### 구조 (지난 1·2단계에서 검증된 것 유지)
- 반복 하나 = 주장(C) 하나 × 역할 하나, 역할마다 별도 `claude -p`.
- `check.mjs`(결정적)가 다음 역할을 고른다: fail→fix, fixed→confirm, todo→verify, 모두 pass→sweep(최대 2회).
- verify(Opus, 판정만, `reviews/`만 씀) → fix(Opus, 제안만 반영·TDD·커밋) → confirm(Sonnet, 스냅샷 diff 대조) → 단계 끝 sweep(Opus, 새 눈으로 단계 주장 전부 재판정, check·docker는 1번만).
- 상한: 주장 수 × 4 + 2. 주장별 수정 3회 초과 → `BLOCKED.md`, 멈춤. 권한 거부·사용량 한도·판정 파일 누락은 ledger를 건드리지 않고 멈춤(exit 3/4/5).

### 이번에 바꾼 것
| 바꾼 것 | 이유 |
| --- | --- |
| fix에 `git rm` 허용, 루트 `Dockerfile`·`.github/` 수정 허용 | 2단계가 루트 Dockerfile·nginx 템플릿을 고친다 |
| confirm·sweep diff 범위에 `Dockerfile`·`.github` 추가 | 위 변경을 confirm이 못 보던 구멍 |
| 프롬프트 「읽을 파일」에 명세 「바탕」 문서 추가 | 09는 mock-data.md가 정본 |
| AGENT.md에 JWT·AI 불신·C2 저장 순서·범위 밖·팀원 폴더 금지 표지판 | 새 명세 공통 규칙. 반복마다 명세에 다시 쓰지 않도록 |
| 명세가 「대체한다」고 이름 댄 기존 테스트만 고칠 수 있음 | 02가 `compose.spec.ts`의 `server:3000`·`SESSION_SECRET` 단언을 바꿔야 함(약화 금지 규칙과 충돌 방지) |
| 이전 명세 02~07·09 삭제, 새 02~09 작성 | 기획 변경 |

### 비용·시간 예상
- 주장 29개(02~09). 지난 실적(1단계 8주장 26바퀴 27분, 2단계 5주장)으로 보면 단계당 20~60분, 전체 4~6시간.
- AI 비용: 루프 안 0원(FakeAi·fetch 차단). 사람 확인 3회 × ≤ $0.05.

### 돌리는 법 (저장소 루트, Docker Desktop 켜고)
```bash
git switch feature/backend-ralph-v2
server/ralph/run-stages.sh 02 03 04 05     # 1차: AI 실제 호출 전까지
# 사람 확인 → 06 07 08 각각 돌리고 단계 끝마다 실제 AI 1회 확인
server/ralph/run-stages.sh 06 && server/ralph/run-stages.sh 07 08 09
node server/ralph/check.mjs status
```
멈추면: `BLOCKED.md`를 읽고 명세 수정·표지판 추가 → `node server/ralph/check.mjs unblock C<n>-<m>` → 같은 명령 다시. 단계는 서로 의존하니 병렬로 돌리지 않는다.

### PR 단위
- PR A: 루프 도구·명세·이 계획(지금 커밋). 리뷰 후 main.
- PR B: 2단계(nginx 유지 + 채점·배포 맞추기) — 루트 Dockerfile·nginx 템플릿이 바뀌므로 **프런트 팀원 확인 후** 병합. 병합 뒤 main push로 `scenarios` 워크플로가 도는지 본다.
- PR C: 3~9단계(또는 3~5 / 6~9 둘로).

## 6. 단계 끝 체크 (사람)
1. `node server/ralph/check.mjs status` 전부 pass, `logs/summary.csv`.
2. `docker compose down -v && docker compose up -d --build` → `curl -i localhost:3000/__health`, 단계의 「끝의 증거」.
3. PR → main. CI 결과, 학생이 **자료 → 제출 요건** 노란 줄 확인.
4. progress.md 갱신. 반복된 실패는 `server/ralph/AGENT.md` 표지판 한 줄.
