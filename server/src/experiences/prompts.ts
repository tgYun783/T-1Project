import { z } from 'zod';
import { Item, ItemStatus, ITEM_STATUSES, ITEMS } from './experience.schema';
import { MessageRole } from './message.schema';

// 경험 대화 지시문은 이 파일 한 곳에 둔다(명세 06). start·answers가 같은 규칙으로 묻게 해야 대화 중 말투·기준이 바뀌지 않는다.
export const CONVERSATION_SYSTEM = [
  '너는 취업 준비생이 자기 경험을 구조화하도록 돕는 면담자다.',
  '경험의 다섯 항목 situation(상황)·role(역할)·action(행동)·result(결과)·meaning(의의)을 한 번에 하나씩만 묻는다.',
  '아직 설명되지 않은(null·needs_more) 항목을 먼저 묻고, 질문은 한국어 한 문장으로 짧게 쓴다.',
  '사용자가 말하지 않은 수치·역할·성과를 지어내거나 짐작해 넣지 않는다.',
  '사실 후보는 사용자의 답에 실제로 있는 내용만 뽑는다. 단서·제목에만 있는 내용은 후보로 만들지 않는다.',
  'itemStatus는 각 항목을 explained(설명됨)·needs_more(추가 확인 필요)·unknown(모름·경험 없음)·null(아직 묻지 않음) 중 하나로 정한다.',
].join('\n');

const itemStatusValue = z.enum(ITEM_STATUSES).nullable();
const itemStatusSchema = z.object(
  Object.fromEntries(ITEMS.map((item) => [item, itemStatusValue])) as Record<Item, typeof itemStatusValue>,
);

// start 응답 스키마(명세 06). 다섯 항목이 모두 있어야 하고 빈 질문은 받지 않는다: 스키마 밖이면 AiService가 실패로 처리한다.
export const conversationStartSchema = z.object({
  question: z.string().trim().min(1),
  itemStatus: itemStatusSchema,
});
export type ConversationStartResult = z.infer<typeof conversationStartSchema>;

// answers 응답 스키마(명세 06). 후보의 항목은 다섯 개 중 하나, 내용은 비지 않아야 한다: 하나라도 어긋나면 전체를 실패로 보고 아무것도 저장하지 않는다.
export const conversationAnswerSchema = conversationStartSchema.extend({
  candidates: z.array(z.object({ item: z.enum(ITEMS), text: z.string().trim().min(1) })),
});
export type ConversationAnswerResult = z.infer<typeof conversationAnswerSchema>;

export interface ConversationInput {
  title: string;
  period: string;
  clues: { type: string; description: string | null; text: string | null }[];
  messages: { role: MessageRole; text: string }[];
  itemStatus: Record<Item, ItemStatus>;
}

// 단서 중 AI가 볼 수 있는 글만 고른다(api.md 0절): 텍스트 단서 내용, 설명이 있는 파일 단서의 설명.
// 파일 이름·바이트·설명 없는 파일은 넣지 않는다 — 사용자가 AI에게 보여 주겠다고 쓴 글이 아니다.
function clueLines(clues: ConversationInput['clues']): string[] {
  const lines: string[] = [];
  for (const clue of clues) {
    const text = clue.type === 'text' ? clue.text : clue.description;
    if (text && text.trim()) lines.push(`- ${text.trim()}`);
  }
  return lines;
}

// start·answers 공통 입력. 매번 그 시점의 단서 전체·대화 기록·현재 상태를 넣어 대화 중 추가한 단서도 반영되게 한다(api.md 5절).
export function buildConversationInput(input: ConversationInput): string {
  const clues = clueLines(input.clues);
  const history = input.messages.map((m) => `${m.role === 'ai' ? 'AI' : '사용자'}: ${m.text}`);
  return [
    `경험 제목: ${input.title}`,
    `시기: ${input.period}`,
    '',
    '단서:',
    ...(clues.length ? clues : ['(없음)']),
    '',
    '대화 기록:',
    ...(history.length ? history : ['(아직 없음)']),
    '',
    `현재 itemStatus: ${JSON.stringify(input.itemStatus)}`,
  ].join('\n');
}
