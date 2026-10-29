# 명세 03 — 이력서 F2 (단계 3)
바탕: docs/api.md 4절, features F2. 사용자당 이력서 1개.

## 결정 (학생 답 2026-10-30 반영: 기본 텍스트 + 선택 태그)
- 이력서 = **기본 텍스트**(`baseText`, 사용자가 가진 이력서 내용을 그대로 붙여 넣은 글, 필수) + **선택 태그별 글**(`items:[{key,content}]`, 9개 템플릿 키 중 고른 것, 0개 가능).
- 모델 `Resume { userId(unique), baseText, items:[{key,content}], updatedAt }`. 템플릿 9개 키는 `server/src/resume/template.ts` 상수(label 포함).
- `PUT`은 전체 교체(upsert). 검증: baseText 공백만 → 400 / items 안에 content 공백만·모르는 key·중복 key → 400.

## 완료 기준
- [ ] C3-1: `GET /api/resume/template` → 200 9개 `{key,label}`(순서는 api.md 순). 인증 필요 없음.
- [ ] C3-2: `GET /api/resume` → 인증 필요. 없으면 `{resume:null}`, 있으면 `{resume:{id,baseText,items:[{key,label,content}],updatedAt}}`.
- [ ] C3-3: `PUT /api/resume` {baseText, items} → 200. 검증: baseText 공백만 / items 안 content 공백만 / 모르는 key / 중복 key → 400 VALIDATION(details에 어느 칸인지). items는 0개여도 된다. 저장 뒤 GET이 같은 내용(baseText·items 모두). 두 번 PUT하면 두 번째 내용으로 교체. 다른 사용자의 이력서는 보이지 않는다(테스트에 사용자 2명).
