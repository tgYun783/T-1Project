import { z } from 'zod';

// 문항별 카드 추천 지시문(명세 07). 확정 사실만 근거로 삼게 해야 후보·짐작이 자소서 근거로 섞이지 않는다(C1).
export const RECOMMEND_SYSTEM = [
  '너는 취업 준비생이 자기소개서 문항에 쓸 경험 카드를 고르도록 돕는다.',
  '희망 기업의 우대사항·인재상과 문항을 보고, 주어진 경험 카드 중 이 문항에 맞는 카드를 고른다.',
  '반드시 주어진 카드의 id만 쓰고, 목록에 없는 경험을 지어내지 않는다.',
  '이유(reason)는 카드의 확정 사실에 실제로 있는 내용만 근거로 한국어 한두 문장으로 쓴다. 카드에 없는 수치·역할·성과를 짐작해 넣지 않는다.',
  '맞는 카드가 없으면 빈 목록을 돌려준다.',
].join('\n');

// 추천 응답 스키마(명세 07). 빈 id·빈 이유는 받지 않는다: 스키마 밖이면 AiService가 실패(502)로 처리해 아무것도 저장하지 않는다.
export const recommendSchema = z.object({
  recommendations: z.array(
    z.object({ experienceId: z.string().trim().min(1), reason: z.string().trim().min(1) }),
  ),
});
export type RecommendResult = z.infer<typeof recommendSchema>;

export interface RecommendCard {
  id: string;
  title: string;
  facts: string[];
}

export interface RecommendInput {
  preferred: string;
  talent: string;
  question: string;
  cards: RecommendCard[];
}

// 입력은 우대사항·인재상·이 문항·확정 사실이 있는 내 카드(id·제목·확정 사실)뿐이다(명세 07 「결정」).
// 후보·대화 원문·단서는 호출부에서 처음부터 넘기지 않아 여기에 섞일 수 없다.
export function buildRecommendInput(input: RecommendInput): string {
  const cards = input.cards.flatMap((card) => [
    `- id: ${card.id}`,
    `  제목: ${card.title}`,
    '  확정 사실:',
    ...card.facts.map((fact) => `    - ${fact}`),
  ]);
  return [
    `우대사항: ${input.preferred}`,
    `인재상: ${input.talent}`,
    `문항: ${input.question}`,
    '',
    '경험 카드:',
    ...cards,
  ].join('\n');
}

// 문항 응답 지시문(명세 07, R8). 카드에 없는 수치·기여도·역할을 지어내면 면접에서 설명할 수 없는 자소서가 된다.
export const ANSWER_SYSTEM = [
  '너는 취업 준비생의 자기소개서 문항 하나에 대한 응답을 쓴다.',
  '희망 기업의 우대사항·인재상과 문항을 보고, 주어진 경험 카드의 확정 사실만 근거로 쓴다.',
  '카드에 없는 수치·기여도·역할을 쓰지 않는다. 확정 사실에 없는 성과나 경험을 짐작해 덧붙이지 않는다.',
  '한국어 자기소개서 문체로, 이 문항 하나에 대한 응답만 쓴다.',
].join('\n');

// 응답 스키마(명세 07). 빈 응답은 받지 않는다: 스키마 밖이면 AiService가 실패(502)로 처리해 기존 응답을 지킨다(C2).
export const answerSchema = z.object({ answer: z.string().trim().min(1) });
export type AnswerResult = z.infer<typeof answerSchema>;

// 입력은 우대사항·인재상·이 문항·고른 카드의 확정 사실뿐이다(명세 07 「결정」).
// 후보·대화 원문·단서는 호출부에서 넘기지 않아 여기에 섞일 수 없다.
export function buildAnswerInput(input: RecommendInput): string {
  const cards = input.cards.flatMap((card) => [
    `- 제목: ${card.title}`,
    '  확정 사실:',
    ...card.facts.map((fact) => `    - ${fact}`),
  ]);
  return [
    `우대사항: ${input.preferred}`,
    `인재상: ${input.talent}`,
    `문항: ${input.question}`,
    '',
    '고른 경험 카드:',
    ...cards,
  ].join('\n');
}
