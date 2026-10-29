import { Item, ItemStatus } from '../experiences/experience.schema';

// 시드 텍스트의 유일한 원본(명세 09). frontend/specs/mock-data.md 「시드」를 글자 하나 바꾸지 않고 옮겼다: 프런트 목 API·시연 영상·주최 측 E2E가 같은 화면을 봐야 한다.

export interface SeedExperience {
  title: string;
  period: string;
  textClues: string[];
  itemStatus: Record<Item, ItemStatus>;
  facts: { item: Item; text: string; origin: 'conversation' | 'manual' }[];
  // 확인되지 않은 AI 후보(ai_unverified). 카드에 들어가지 않는다(C1).
  candidates: { item: Item; text: string }[];
  // 대화 순서 그대로. 빈 배열이면 대화를 아직 시작하지 않은 경험이다.
  messages: { role: 'ai' | 'user'; text: string }[];
}

const CAPSTONE_FACTS = {
  situation: '학과 공지가 홈페이지에만 올라와 학생들이 신청 마감을 자주 놓쳤다',
  role: '4명 팀에서 백엔드와 공지 크롤러를 맡았다. 팀장은 다른 팀원이었다',
  action: '공지 게시판을 10분마다 확인해 새 글이 올라오면 앱 푸시를 보내는 크롤러를 만들었다',
  result:
    '학과 단톡방에 공유해 한 학기 동안 시험 운영했고, 공지를 놓쳤다는 말이 줄었다는 반응을 들었다. 사용자 수나 확인율은 따로 재지 않았다',
} as const;

// 경험 1 대화: mock-data.md 「AI 고정 동작 › 경험 대화」의 질문 순서와 위 확정 사실 문장으로만 만든다(새 내용을 지어내지 않음).
// 명세 09 기본값: 질문 5·답 4, 마지막은 의의를 묻는 AI 질문(답 없음). 개수는 프런트 팀원과 확정 필요.
const CAPSTONE_MESSAGES: SeedExperience['messages'] = [
  { role: 'ai', text: '이 경험에서 해결하려던 문제는 무엇이었나요?' },
  { role: 'user', text: CAPSTONE_FACTS.situation },
  { role: 'ai', text: '그때 본인이 맡은 역할은 무엇이었나요?' },
  { role: 'user', text: CAPSTONE_FACTS.role },
  { role: 'ai', text: '구체적으로 어떤 행동을 했나요?' },
  { role: 'user', text: CAPSTONE_FACTS.action },
  { role: 'ai', text: '결과는 어땠나요? 직접 확인한 것만 말해 주세요.' },
  { role: 'user', text: CAPSTONE_FACTS.result },
  { role: 'ai', text: '이 경험이 지금 지원에 어떤 의미가 있나요?' },
];

// 목록은 최근 수정순이라, 넣는 순서의 마지막(경험 1)이 맨 위에 온다.
export const SEED_EXPERIENCES: SeedExperience[] = [
  {
    title: '교내 해커톤 동아리 회비 정산 웹',
    period: '2025년 여름',
    textClues: [],
    itemStatus: { situation: null, role: null, action: null, result: null, meaning: null },
    facts: [
      { item: 'role', text: '5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다', origin: 'manual' },
      { item: 'action', text: '회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 직접 만들었다', origin: 'manual' },
      { item: 'result', text: '48시간 안에 시연까지 마쳤지만 수상은 하지 못했다', origin: 'manual' },
    ],
    candidates: [],
    messages: [],
  },
  {
    title: '캡스톤디자인 학과 공지 알림 앱',
    period: '2025년 1학기',
    textClues: ['발표 자료 마지막 장: 팀원 4명 역할 분담표 — 나는 백엔드·공지 크롤러'],
    itemStatus: {
      situation: 'explained',
      role: 'explained',
      action: 'explained',
      result: 'needs_more',
      meaning: null,
    },
    facts: [
      { item: 'situation', text: CAPSTONE_FACTS.situation, origin: 'conversation' },
      { item: 'role', text: CAPSTONE_FACTS.role, origin: 'conversation' },
      { item: 'action', text: CAPSTONE_FACTS.action, origin: 'conversation' },
      { item: 'result', text: CAPSTONE_FACTS.result, origin: 'conversation' },
    ],
    candidates: [{ item: 'meaning', text: '반복되는 불편을 자동화로 줄이는 데 관심이 생겼다' }],
    messages: CAPSTONE_MESSAGES,
  },
];

// 붙여넣은 자소서(kind: pasted). 점검 기록은 S6 흐름이 만든다.
export const SEED_COVER_LETTERS: { title: string; body: string }[] = [
  {
    title: '가나다소프트 백엔드 지원',
    body: '저는 캡스톤디자인에서 학과 공지 알림 앱을 개발하며 데이터 기반으로 문제를 해결했습니다. 공지 크롤러를 설계해 학생들의 공지 확인율을 40% 높였고, 팀을 주도해 일정 안에 배포를 마쳤습니다. 교내 해커톤에서는 팀장으로서 동아리 회비 정산 서비스를 기획해 수상권에 근접한 성과를 거두었습니다. 이러한 경험을 바탕으로 사용자의 불편을 데이터로 해결하는 백엔드 개발자가 되겠습니다.',
  },
];
