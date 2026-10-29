import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { asObject } from '../auth/signup.validation';
import { FactOrigin, FactSource, FactStatus } from '../experiences/fact.schema';
import { Item } from '../experiences/experience.schema';
import { ConfirmFactInput, FACT_REASONS, validateConfirmFact } from '../experiences/fact.validation';
import { Check, CheckCandidate, CheckSentence, JudgeResult, SentenceStatus } from './check.schema';

// api.md 2절 CheckSentence·Check 응답 모양.
export interface CheckSentenceDto {
  id: string;
  text: string;
  coverLetterItemId: string | null;
  status: SentenceStatus;
  turns: { question: string; answer: string | null; judge: JudgeResult[] }[];
  followUpsLeft: number;
}

export interface CheckCandidateDto {
  id: string;
  item: Item;
  text: string;
  status: FactStatus;
  source: FactSource;
  clueId: string | null;
  origin: FactOrigin;
  createdAt: string;
  experienceId: string | null;
}

export interface CheckDto {
  id: string;
  coverLetterId: string;
  stale: boolean;
  sentences: CheckSentenceDto[];
  candidates: CheckCandidateDto[];
  createdAt: string;
}

// 답하기 응답(api.md 9절). newCandidates는 이번 답에서 나와 점검에 쌓인 후보다(R12).
export interface AnswerResultDto {
  sentence: CheckSentenceDto;
  newCandidates: CheckCandidateDto[];
}

export interface ConfirmCandidateInput extends ConfirmFactInput {
  experienceId: string;
  item: Item;
}

// 점검 후보 확정 본문 { experienceId, item, text?, source, clueId? }(api.md 9절). 출처·단서·text 규칙은 경험 쪽 확정과 같다(C1).
// 후보는 어느 경험의 사실인지 사용자가 정해야 하므로 experienceId·item은 필수다. id 형식은 경험 조회가 404로 거른다(R1).
export function validateConfirmCandidate(body: unknown): ConfirmCandidateInput {
  const obj = asObject(body);
  const details: { field: string; reason: string }[] = [];
  let confirmInput: ConfirmFactInput | null = null;
  try {
    confirmInput = validateConfirmFact(obj);
  } catch (err) {
    if (!(err instanceof BadRequestException)) throw err;
    details.push(...((err.getResponse() as { details: { field: string; reason: string }[] }).details ?? []));
  }
  const experienceId = typeof obj.experienceId === 'string' ? obj.experienceId.trim() : '';
  if (experienceId === '') details.push({ field: 'experienceId', reason: '사실을 넣을 경험을 골라 주세요.' });
  if (!('item' in obj)) details.push({ field: 'item', reason: FACT_REASONS.item });
  if (details.length > 0 || !confirmInput) {
    throw new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
  }
  return { ...confirmInput, experienceId, item: confirmInput.item as Item };
}

// 답하기 본문 { text }(api.md 9절). 공백만 있는 답은 판정할 내용 없이 AI 비용만 쓰므로 빈 값과 같이 400.
export function validateAnswerText(body: unknown): string {
  const text = asObject(body).text;
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed === '') {
    throw new BadRequestException({
      code: 'VALIDATION',
      message: '입력값을 확인해 주세요.',
      details: [{ field: 'text', reason: '답을 입력해 주세요.' }],
    });
  }
  return trimmed;
}

type CheckRecord = Check & { _id: Types.ObjectId };

export function toSentenceDto(s: CheckSentence & { _id: Types.ObjectId }): CheckSentenceDto {
  return {
    id: String(s._id),
    text: s.text,
    coverLetterItemId: s.coverLetterItemId ? String(s.coverLetterItemId) : null,
    status: s.status,
    turns: (s.turns ?? []).map((t) => ({
      question: t.question,
      answer: t.answer ?? null,
      judge: (t.judge ?? []).map((j) => ({ id: j.id, result: j.result })),
    })),
    followUpsLeft: s.followUpsLeft,
  };
}

export function toCandidateDto(c: CheckCandidate & { _id: Types.ObjectId }): CheckCandidateDto {
  return {
    id: String(c._id),
    item: c.item,
    text: c.text,
    status: c.status,
    source: c.source,
    clueId: c.clueId ? String(c.clueId) : null,
    origin: c.origin,
    createdAt: c.createdAt.toISOString(),
    experienceId: c.experienceId ? String(c.experienceId) : null,
  };
}

// 응답에 userId·_id·__v가 새지 않도록 키를 하나씩 골라 조립한다(R1).
export function toCheckDto(check: CheckRecord): CheckDto {
  return {
    id: String(check._id),
    coverLetterId: String(check.coverLetterId),
    stale: check.stale ?? false,
    sentences: (check.sentences ?? []).map(toSentenceDto),
    candidates: (check.candidates ?? []).map(toCandidateDto),
    createdAt: check.createdAt.toISOString(),
  };
}
