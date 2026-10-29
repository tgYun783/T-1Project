import { z } from 'zod';
import { judgeSchema, questionSchema, sentencesSchema } from '../checks/prompts';
import { answerSchema, recommendSchema } from '../cover-letters/prompts';
import { conversationAnswerSchema, conversationStartSchema } from '../experiences/prompts';

// Gateway(OpenAI) strict json_schema는 객체마다 모든 칸이 required여야 한다. 선택 칸(optional·nullish)이 있으면
// 실제 호출이 400으로 거절되는데, FakeAi를 쓰는 다른 테스트로는 드러나지 않는다(2026-10-30 check-answer 실패).
const SCHEMAS = {
  conversationStartSchema,
  conversationAnswerSchema,
  recommendSchema,
  answerSchema,
  sentencesSchema,
  questionSchema,
  judgeSchema,
};

function missingRequired(node: unknown, at: string): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as Record<string, unknown>;
  const out: string[] = [];
  if (n.type === 'object' && n.properties && typeof n.properties === 'object') {
    const required = Array.isArray(n.required) ? (n.required as string[]) : [];
    for (const key of Object.keys(n.properties)) if (!required.includes(key)) out.push(`${at}.${key}`);
  }
  for (const [k, v] of Object.entries(n)) {
    if (Array.isArray(v)) v.forEach((x, i) => out.push(...missingRequired(x, `${at}.${k}[${i}]`)));
    else if (v && typeof v === 'object') out.push(...missingRequired(v, `${at}.${k}`));
  }
  return out;
}

describe('AI 응답 스키마의 strict 호환', () => {
  it.each(Object.entries(SCHEMAS))('%s는 모든 객체 칸이 required다', (_name, schema) => {
    expect(missingRequired(z.toJSONSchema(schema), '$')).toEqual([]);
  });
});
