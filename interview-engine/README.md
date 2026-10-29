# interview-engine

> **상태(2026-10-30): 결정 대기.** 음성 모의면접(해법 3)의 보류/선택 유지가 정해지지 않았다(`docs/scope-open-items.md` A).
> 현재 구현 범위(경험 발굴·사실 확정 → 경험 기반 자소서·제출 전 점검)의 **필수 의존성이 아니다.** 삭제하지 않고 보존한다.
> 제출 전 점검에 재사용할 후보(`src/llm.ts` 등)는 `docs/proposals/current-scope-plan.md` 7절에 적었고, 재사용 여부는 아직 정하지 않았다.

2:1 모의면접(실무 면접관·임원 면접관) 진행 로직이다. 설계는 [`docs/interview-design.md`](../docs/interview-design.md), 기능 명세는 `docs/problem.yaml`의 F5~F8, 흐름은 `docs/scenarios.yaml`의 S5·S6을 따른다.
팀 결정(2026-10-29): 백엔드 **NestJS**, DB **MongoDB**, AI 모델 **`openai/gpt-6.1-terra`**.

- `src/` — 면접 로직. NestJS·DB에 묶이지 않는다.
- `nest/` — NestJS에 그대로 넣는 모듈(컨트롤러·예외 필터·MongoDB 연결).

## 들어 있는 것

| 파일 | 하는 일 |
| --- | --- |
| `src/engine.ts` | 면접 진행: 본질문 4개 생성 → 순서 랜덤 → 답변마다 꼬리질문/다음 주제 판단 → 종료 → 결과·자소서 수정 제안, 면접 기록 목록, 시드용 끝난 면접 |
| `src/prompts.ts` | AI에게 보내는 지시문(면접관 역할, 꼬리질문 규칙) |
| `src/schemas.ts` | AI 응답 형식(JSON). 이 형식이 아니면 버린다 |
| `src/llm.ts` | AI Gateway 호출(OpenAI 호환 API). 키는 `AI_GATEWAY_API_KEY`에서만 읽는다 |
| `src/fallback.ts` | AI가 실패했을 때 쓰는 기본 질문 |
| `src/store.ts` / `src/mongoStore.ts` | 저장소 규격, 메모리 저장소(테스트용), MongoDB 저장소 |
| `src/types.ts` | 데이터 형태와 `CoverLetterSource`(앱의 이력서·자기소개서 저장소와 잇는 창구) |
| `src/config.ts` | 한도(본질문 2+2, 꼬리질문 2, 최대 12개·12분 등)와 화면 표시 이름(면접관, 확인 항목, 종료 사유) |
| `nest/interview.module.ts` | `InterviewModule.fromEnv()` / `InterviewModule.forRoot()` |
| `nest/interview.controller.ts` | `/api/interviews` API |
| `nest/interview.filter.ts` | 엔진 오류 → HTTP 상태 |

서버가 규칙을 직접 검사하는 것: 꼬리질문 횟수, 근거 답변 id가 실제로 있는지, 이미 설명된 항목을 다시 묻는지, '모름' 항목을 두 번 이상 다시 묻는지, 근거 문장이 자소서에 그대로 있는지, 다른 사용자의 면접·자기소개서인지, 같은 답변을 두 번 보냈는지(버전 번호).
AI가 실패하거나 키가 없으면 기본 질문·다음 주제로 넘어가 면접은 계속되고, 그 사실을 `fallbackEvents`에 남긴다.

## NestJS 앱에 붙이기

1. 이 폴더의 `src/`, `nest/`를 백엔드 프로젝트로 가져온다(예: `backend/src/interview/`). 상대 경로 import(`../src/...`)만 맞춘다.
2. 백엔드에 의존성 추가: `npm install zod mongodb`
3. 이력서·자기소개서(F2·F3·F4)를 맡은 서비스가 `CoverLetterSource`를 구현한다.

```ts
import { Injectable } from '@nestjs/common';
import type { CoverLetterSource } from './interview/src/types';

@Injectable()
export class CoverLetterService implements CoverLetterSource {
  /** 사용자의 이력서를 면접용 글 한 덩어리로(항목 이름 + 내용). 없으면 '' */
  async getResumeText(userId: string): Promise<string> { /* ... */ }
  /** 본인의 자기소개서 본문. 없거나 남의 것이면 null */
  async getCoverLetter(userId: string, coverLetterId: string): Promise<string | null> { /* ... */ }
  /** 수정 제안 승인 때 호출된다. 본문을 바꿔 저장(수정 이력도 여기서) */
  async updateCoverLetter(userId: string, coverLetterId: string, body: string): Promise<void> { /* ... */ }
}
```

4. `AppModule`에 넣는다.

```ts
@Module({
  imports: [
    CoverLetterModule, // CoverLetterService를 export하는 모듈
    InterviewModule.fromEnv({ imports: [CoverLetterModule], coverLetterSource: CoverLetterService }),
  ],
})
export class AppModule {}
```

`coverLetterSource`를 빼면 면접은 화면이 보낸 글(`{ resume, coverLetter }`)로만 시작할 수 있고, 수정 제안 승인은 바뀐 글을 돌려주기만 한다.

5. 인증 가드가 `req.user`에 `{ id }`(또는 `{ sub }`)를 넣어야 한다. 없으면 면접 API는 401을 돌려준다.
6. Nest 기본 설정(`emitDecoratorMetadata`)이 없어도 동작하도록 주입은 모두 `@Inject(토큰)`으로 했다.

다른 곳에서 엔진을 쓰려면 `@Inject(INTERVIEW_ENGINE) engine: InterviewEngine`.

### 시드: 끝난 면접 1개 (S6)

README 구현 설계의 시드(취준생 계정 → 이력서 → 자기소개서 → **끝난 면접 결과 1개, 수정 제안 1개 포함**)의 마지막 단계다.
앱이 처음 뜰 때 시드 계정과 자기소개서를 만든 다음 부른다. 같은 `id`가 이미 있으면 아무것도 하지 않으므로 매번 불러도 된다. AI를 부르지 않는다.

```ts
await engine.seedFinished({
  id: 'seed-interview-1',
  userId: seedUser.id,
  resume: resumeText,
  coverLetter: seedCoverLetter.body,
  coverLetterId: seedCoverLetter.id,
  qa: [
    {
      interviewer: 'practical',
      purpose: '본인 기여',
      fields: ['contribution', 'process'],
      question: '...',
      answer: '...',
      explained: ['contribution'],
    },
  ],
  // original은 자기소개서 본문에 글자 그대로 있어야 한다(없으면 오류)
  suggestions: [{ original: '...', revised: '...', reason: '...', answerIndex: 0 }],
});
```

질문·답변·수정 제안 문구는 시드 데이터를 맡은 사람이 S6 기대 결과("제안대로 바뀐 문장이 본문에 들어 있다")에 맞춰 정한다.

### API

모두 로그인 필요. 오류는 `{ code, message }`이고 `message`는 화면에 그대로 보여 줄 수 있는 한국어다.

| 메서드·주소 | 본문 | 돌려주는 것 |
| --- | --- | --- |
| `GET /api/interviews` | | 내 면접 기록 목록, 최근 것부터(S6 '면접 기록') |
| `POST /api/interviews` | `{ coverLetterId }` 또는 `{ resume, coverLetter }` | 201, 첫 질문이 담긴 상태 |
| `GET /api/interviews/:id` | | 지금 상태(새로고침용) |
| `POST /api/interviews/:id/answers` | `{ questionId, text, source: 'text' \| 'voice' }` | 다음 질문(끝났으면 `current: null`) |
| `POST /api/interviews/:id/skip` | | 다음 본질문 |
| `POST /api/interviews/:id/end` | | 종료된 상태 |
| `GET /api/interviews/:id/result` | | 질문·답변 기록, 설명된 항목, 보완할 항목(최대 3), 자소서 수정 제안, 종료 사유 |
| `POST /api/interviews/:id/suggestions/:sid/approve` | | 바뀐 자소서 전문. 저장소가 연결돼 있으면 그 자기소개서에 저장됨(`saved: true`) |
| `POST /api/interviews/:id/suggestions/:sid/reject` | | |

| 상태 코드 | 뜻 |
| --- | --- |
| 400 | 입력이 비었거나 너무 김, 본문 형식 오류, 저장소 없이 `coverLetterId`로 시작 |
| 401 | 로그인 안 됨 |
| 404 | 없는 면접·자기소개서 또는 다른 사람의 것 |
| 409 | 이미 넘어간 질문에 답함(두 번 누름), 끝난 면접, 아직 안 끝난 면접의 결과 요청, 이미 처리했거나 원래 문장이 바뀐 수정 제안 |

면접 상태 응답:
- `current`: `interviewerLabel`(예: "실무 면접관"), `text`(질문), `purpose`(확인 목적), `basisSentence`(근거 자소서 문장). TTS는 `text`를 읽고, 화면에도 `text`를 글자로 보여 준다(자동 테스트는 소리를 못 듣는다).
- `history`: 지금까지의 질문·답변(면접관 이름 포함). 면접 화면에 쌓아 보여 준다.
- `endReasonLabel`: 끝났으면 '사용자 종료'·'모든 질문 완료'·'질문 수 한도'·'시간 한도'.

## 환경변수

| 이름 | 용도 | 기본값 |
| --- | --- | --- |
| `DATABASE_URL` | MongoDB 주소. docker-compose에서는 `mongodb://db:27017/app` | 필수(없으면 `MONGO_URL`을 읽는다) |
| `MONGO_DB` | DB 이름을 따로 정할 때 | 주소에 적힌 DB 이름, 없으면 `app` |
| `AI_GATEWAY_API_KEY` | AI Gateway 키. 서버에서만 읽는다. 비어 있으면 기본 질문으로 진행(앱은 뜬다) | |
| `AI_MODEL` | Gateway 모델 ID | `openai/gpt-6.1-terra` |
| `AI_REASONING_EFFORT` | 추론 강도(`none`·`low`·`medium`·`high` 등). 높을수록 느리고 비싸다 | `low` |

### 모델과 비용 (2026-10-29 Gateway 모델 목록 기준)

- `openai/gpt-6.1-terra`: 입력 100만 토큰당 $1, 출력 100만 토큰당 $5. 구조화 출력(structured output)과 추론 강도 조절을 지원한다.
- 추론 토큰은 출력으로 청구된다. 그래서 면접 진행에는 `low`로 둔다.
- 면접 한 번은 AI 호출 최대 14회다(질문 생성 1 + 답변 최대 12 + 수정 제안 1). 비용은 아직 실제로 재 보지 않았다. 첫 실제 호출 때 응답의 `usage`로 확인한다.

## 검사

```bash
npm install
npm run check
```

- `npm run check`: 타입 검사 + 테스트(55개). 가짜 AI로 규칙, 명세(F5·F8, S5·S6) 맞춤, NestJS API 연결을 검사한다. 자동 화면 테스트(E2E)와는 다르다. E2E는 실제 AI를 부른다.
- MongoDB 테스트는 실제 MongoDB가 있을 때만 돈다: `DATABASE_URL`이 아니라 `MONGO_URL=mongodb://localhost:27017 npm test`

## 아직 안 된 것

- 실제 MongoDB 연결과 실제 AI Gateway 호출 확인(키 필요).
- NestJS 백엔드 프로젝트 자체, docker-compose의 `db`(mongo) 서비스, 로그인, 이력서·자기소개서 서비스(`CoverLetterSource` 구현).
- 음성 전사. 엔진은 전사된 글자만 받는다(`source: 'voice'`로 표시).
- 3.1 자소서 초안 생성.
- 팀 결정 대기: 답변 판단 AI가 실패할 때 동작(지금은 다음 본질문으로 넘어감).
