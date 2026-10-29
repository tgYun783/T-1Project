import { z } from 'zod';
import { ITEMS } from '../experiences/experience.schema';
import { JUDGE_IDS, JUDGE_RESULTS } from './check.schema';

// 주장 문장 고르기 지시문(명세 08, R9). 문장을 고쳐 쓰면 원문 대조에서 버려지고, 사용자가 쓰지 않은 주장을 해명하게 된다(C4).
export const SENTENCES_SYSTEM = [
  '너는 취업 준비생이 제출 전에 자기소개서를 점검하도록 돕는다.',
  '자기소개서에서 수치·성과·역할·평가 표현이 들어간 주장 문장을 고른다.',
  '문장은 원문에 있는 그대로 한 글자도 바꾸지 않고 인용한다. 고쳐 쓰거나 요약하거나 새 문장을 만들지 않는다.',
  '문항이 나뉘어 있으면 그 문장이 든 문항의 id를 coverLetterItemId에 적고, 문항이 없으면 null로 둔다.',
  '고를 문장이 없으면 빈 목록을 돌려준다.',
].join('\n');

// 문장 고르기 응답 스키마(명세 08). 스키마 밖이면 AiService가 실패(502)로 처리해 점검을 저장하지 않는다(C2).
export const sentencesSchema = z.object({
  sentences: z.array(z.object({ text: z.string(), coverLetterItemId: z.string().nullable() })),
});
export type SentencesResult = z.infer<typeof sentencesSchema>;

// 붙여넣은 자소서는 본문 전체, 생성한 자소서는 응답이 있는 문항만 id와 함께 넘긴다(명세 08 「결정」).
export type SentencesInput = { kind: 'pasted'; body: string } | { kind: 'generated'; items: { id: string; answer: string }[] };

export function buildSentencesInput(input: SentencesInput): string {
  if (input.kind === 'pasted') return ['자기소개서:', input.body].join('\n');
  return [
    '자기소개서 문항별 응답:',
    ...input.items.flatMap((item) => [`- 문항 id: ${item.id}`, `  응답: ${item.answer}`]),
  ].join('\n');
}

// 문장 첫 질문 지시문(명세 08, R10). 면접관처럼 근거를 묻되 문장을 고쳐 쓰지 않는다(C4). 점수·평가는 말하지 않는다(R11).
export const QUESTION_SYSTEM = [
  '너는 면접관처럼 자기소개서의 주장 문장 하나에 대해 근거를 묻는다.',
  '수치라면 계산 방법·비교 기준·기간을, 행동이라면 팀이 아니라 본인이 한 일을, 평가 표현이라면 실제 수단·도구·산출물을 묻는다.',
  '질문은 하나만, 한두 문장으로 짧게 한다.',
  '문장을 고쳐 쓰거나 더 나은 표현을 제안하지 않는다. 점수나 평가를 말하지 않는다.',
].join('\n');

// 첫 질문 응답 스키마(명세 08). 빈 질문은 사용자에게 보일 것이 없으므로 스키마 밖(502)으로 본다.
export const questionSchema = z.object({ question: z.string().trim().min(1) });
export type QuestionResult = z.infer<typeof questionSchema>;

// 문장이 든 문맥(붙여넣은 자소서는 본문, 생성한 자소서는 그 문항의 질문·응답)을 함께 넘겨야 질문이 맥락에 맞는다.
export type QuestionInput = { sentence: string; context: { question?: string; text: string } };

export function buildQuestionInput(input: QuestionInput): string {
  return [
    ...(input.context.question ? [`자기소개서 문항: ${input.context.question}`] : []),
    '자기소개서 원문:',
    input.context.text,
    '',
    `점검할 주장 문장: ${input.sentence}`,
  ].join('\n');
}

// 답 판정 지시문(명세 08, R10·R11). J1~J4는 problem.yaml R10의 clear_if 문장을 그대로 쓴다.
// AI는 기준별 met/missing만 고르고 상태는 서버가 정한다. 점수는 어디에도 두지 않는다(R11).
export const JUDGE_CRITERIA = [
  'J1 수치의 출처: 수치가 있는 문장이면 계산 방법, 비교 기준(무엇 대비), 기간을 말한다',
  'J2 본인의 행동: 팀이 아니라 내가 한 행동을 구체적인 동작으로 말한다',
  "J3 표현의 실체: '데이터 기반', '주도' 같은 평가 표현에 해당하는 실제 수단·도구·산출물을 말한다",
  "J4 단정: '체감상', '대략 그쯤'처럼 추정으로 얼버무리는 말 없이 답한다",
];

export const JUDGE_SYSTEM = [
  '너는 면접관처럼 자기소개서의 주장 문장 하나에 대한 사용자의 답을 판정한다.',
  '먼저, 사용자가 그런 일이 없었다거나 모른다·기억나지 않는다고 답했으면 unknown을 true로 한다("정확히 기억은 안 나요"도 true).',
  '다음 기준 가운데 이 문장에 해당하는 기준만 judge 목록에 넣고, 지금까지의 답 전체를 보고 각각 met 또는 missing으로 판정한다. 해당하지 않는 기준은 넣지 않는다.',
  ...JUDGE_CRITERIA.map((c) => `- ${c}`),
  'missing인 기준이 있으면 빠진 요소를 이전 질문과 다른 각도로 묻는 질문 하나를 nextQuestion에 적는다. 모두 met이면 nextQuestion은 null로 둔다.',
  '답에서 사용자가 직접 말한 사실이 있으면 candidates에 항목(situation·role·action·result·meaning)과 함께 사용자가 말한 그대로 적는다. 지어내지 않는다.',
  '근거 카드 id 목록이 주어지면 각 후보가 어느 카드의 사실인지 그 목록에서 하나를 골라 experienceId에 적는다. 목록이 없으면 experienceId는 null로 둔다.',
  '문장을 고쳐 쓰거나 더 나은 표현을 제안하지 않는다. 점수나 평가를 말하지 않는다.',
].join('\n');

// 답 판정 응답 스키마(명세 08). judge가 비면 판정할 수 없으므로 스키마 밖(502)으로 본다.
export const judgeSchema = z.object({
  unknown: z.boolean(),
  judge: z.array(z.object({ id: z.enum(JUDGE_IDS), result: z.enum(JUDGE_RESULTS) })).min(1),
  nextQuestion: z.string().nullable(),
  // experienceId는 생성 자소서에서 AI가 고른 근거 카드다. 서버가 문항 근거 카드 목록과 대조해 바로잡는다(명세 08).
  // nullish(선택 칸)가 아니라 nullable: Gateway strict 스키마는 모든 칸이 required여야 한다(아니면 400).
  candidates: z.array(z.object({ item: z.enum(ITEMS), text: z.string(), experienceId: z.string().nullable() })),
});
export type JudgeAiResult = z.infer<typeof judgeSchema>;

// 문맥·주장 문장·지금까지의 질문과 답·이번 답을 넘겨야 이전 답까지 합쳐 판정하고 같은 질문을 되풀이하지 않는다.
// 생성 자소서면 그 문항의 근거 카드 id를 넘겨 후보가 어느 카드의 사실인지 AI가 고르게 한다.
export type JudgeInput = QuestionInput & {
  turns: { question: string; answer: string | null }[];
  answer: string;
  experienceIds?: string[];
};

export function buildJudgeInput(input: JudgeInput): string {
  const history = input.turns.slice(0, -1);
  const current = input.turns[input.turns.length - 1];
  return [
    buildQuestionInput(input),
    '',
    ...(history.length
      ? ['이전 질문과 답:', ...history.flatMap((t) => [`- 질문: ${t.question}`, `  답: ${t.answer ?? ''}`]), '']
      : []),
    `지금 질문: ${current?.question ?? ''}`,
    `사용자의 답: ${input.answer}`,
    ...(input.experienceIds?.length ? ['', `근거 카드 id 목록: ${input.experienceIds.join(', ')}`] : []),
  ].join('\n');
}
