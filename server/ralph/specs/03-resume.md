# 명세 03 — 이력서 F2 (단계 3)
바탕: docs/api.md 4절, features F2. 사용자당 이력서 1개.

## 결정 (학생 답 2026-10-30 2차 반영: 이력서는 기본 텍스트만, 9개 항목 선택은 자소서 생성 때)
- 이력서 = **기본 텍스트**(`baseText`, 사용자가 가진 이력서 내용을 텍스트 폼에 입력, 필수) 하나. 태그별 추가 입력 칸은 없다.
- 9개 템플릿 항목(키·label)은 자소서 생성(명세 04)에서 "어떤 문항을 쓸지" 고르는 데 쓴다. 상수는 `server/src/resume/template.ts`.
- 모델 `Resume { userId(unique), baseText, updatedAt }`. `PUT`은 전체 교체(upsert). 검증: baseText 공백만 → 400.

## 완료 기준
- [ ] C3-1: `GET /api/resume/template` → 200 9개 `{key,label}`(순서는 api.md 순). 인증 필요 없음. 이 목록은 자소서 생성 때 문항 선택에 쓰인다.
- [ ] C3-2: `GET /api/resume` → 인증 필요. 없으면 `{resume:null}`, 있으면 `{resume:{id,baseText,updatedAt}}`.
- [ ] C3-3: `PUT /api/resume` {baseText} → 200. baseText 공백만 → 400 VALIDATION. 저장 뒤 GET이 같은 내용. 두 번 PUT하면 두 번째 내용으로 교체. 다른 사용자의 이력서는 보이지 않는다(테스트에 사용자 2명).
