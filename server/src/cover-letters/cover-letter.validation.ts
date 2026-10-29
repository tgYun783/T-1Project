import { BadRequestException } from '@nestjs/common';
import { asObject } from '../auth/signup.validation';

export interface CreateCoverLetterInput {
  title: string | null;
  body: string;
}

export interface UpdateCoverLetterInput {
  title?: string | null;
  body?: string;
}

export interface GenerateCoverLetterInput {
  title: string | null;
  preferred: string;
  talent: string;
  questions: string[];
}

type CoverLetterField =
  | 'title'
  | 'body'
  | 'preferred'
  | 'talent'
  | 'questions'
  | 'experienceIds'
  | 'answer'
  | 'confirmOverwrite';

interface FieldError {
  field: CoverLetterField;
  reason: string;
}

export const COVER_LETTER_REASONS = {
  title: '제목은 글자로 입력해 주세요.',
  body: '자기소개서 내용을 입력해 주세요.',
  generatedBody: '생성한 자기소개서는 문항별 응답으로 고쳐 주세요.',
  preferred: '희망 기업의 우대사항을 입력해 주세요.',
  talent: '희망 기업의 인재상을 입력해 주세요.',
  questions: '자기소개서 문항을 1개 이상 입력해 주세요(빈 문항 없이).',
  experienceIds: '고를 경험 카드 id 목록을 보내 주세요.',
  answer: '응답 내용을 입력해 주세요.',
  confirmOverwrite: '덮어쓰기 확인은 true 또는 false로 보내 주세요.',
} as const;

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
export function coverLetterValidationError(details: FieldError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
}

// 붙여넣은 글은 줄바꿈·들여쓰기가 점검 문장 위치에 쓰이므로 그대로 저장하고, 공백만 있으면 빈 글로 본다.
function readBody(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value;
}

// 제목은 선택이다: 없거나 공백만이면 null(제목 없음). 문자열이 아니면 잘못된 입력.
function readTitle(value: unknown): { ok: true; title: string | null } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, title: null };
  if (typeof value !== 'string') return { ok: false };
  const t = value.trim();
  return { ok: true, title: t === '' ? null : t };
}

// POST: body 필수, title 선택(api.md 7절).
export function validateCreateCoverLetter(raw: unknown): CreateCoverLetterInput {
  const obj = asObject(raw);
  const details: FieldError[] = [];
  const title = readTitle(obj.title);
  const body = readBody(obj.body);
  if (!title.ok) details.push({ field: 'title', reason: COVER_LETTER_REASONS.title });
  if (body === null) details.push({ field: 'body', reason: COVER_LETTER_REASONS.body });
  if (details.length > 0) throw coverLetterValidationError(details);
  return { title: title.ok ? title.title : null, body: body! };
}

// 우대사항·인재상·문항은 추천·응답 AI의 입력이라 앞뒤 공백을 걷어 저장하고, 공백만 있으면 빈 값으로 본다.
function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

// 문항이 하나라도 비면 그 문항은 추천·응답을 만들 수 없으므로 목록 전체를 거부한다.
function readQuestions(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const questions = value.map(readText);
  return questions.every((q): q is string => q !== null) ? questions : null;
}

// POST /generate: preferred·talent 필수, questions 1개 이상, title 선택(api.md 7절).
export function validateGenerateCoverLetter(raw: unknown): GenerateCoverLetterInput {
  const obj = asObject(raw);
  const details: FieldError[] = [];
  const title = readTitle(obj.title);
  const preferred = readText(obj.preferred);
  const talent = readText(obj.talent);
  const questions = readQuestions(obj.questions);
  if (!title.ok) details.push({ field: 'title', reason: COVER_LETTER_REASONS.title });
  if (preferred === null) details.push({ field: 'preferred', reason: COVER_LETTER_REASONS.preferred });
  if (talent === null) details.push({ field: 'talent', reason: COVER_LETTER_REASONS.talent });
  if (questions === null) details.push({ field: 'questions', reason: COVER_LETTER_REASONS.questions });
  if (details.length > 0) throw coverLetterValidationError(details);
  return { title: title.ok ? title.title : null, preferred: preferred!, talent: talent!, questions: questions! };
}

// PUT .../experiences: 배열·문자열 원소만 받는다. 중복은 처음 것만 남기고 고른 순서를 지킨다(카드 단위 선택, api.md 7절 ②).
export function validateSelectExperiences(raw: unknown): { experienceIds: string[] } {
  const value = asObject(raw).experienceIds;
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === 'string')) {
    throw coverLetterValidationError([{ field: 'experienceIds', reason: COVER_LETTER_REASONS.experienceIds }]);
  }
  return { experienceIds: [...new Set(value)] };
}

// POST .../answer: confirmOverwrite는 선택이다. boolean이 아닌 값을 덮어쓰기 동의로 보면 고친 글이 사라질 수 있어 400으로 막는다.
export function validateGenerateAnswer(raw: unknown): { confirmOverwrite: boolean } {
  const value = asObject(raw).confirmOverwrite;
  if (value === undefined) return { confirmOverwrite: false };
  if (typeof value !== 'boolean') {
    throw coverLetterValidationError([{ field: 'confirmOverwrite', reason: COVER_LETTER_REASONS.confirmOverwrite }]);
  }
  return { confirmOverwrite: value };
}

// PATCH .../items/:itemId: 사용자가 고친 응답. 줄바꿈은 점검 문장 위치에 쓰이므로 그대로 두고, 공백만이면 빈 글로 거부한다.
export function validateUpdateItem(raw: unknown): { answer: string } {
  const answer = readBody(asObject(raw).answer);
  if (answer === null) throw coverLetterValidationError([{ field: 'answer', reason: COVER_LETTER_REASONS.answer }]);
  return { answer };
}

// PATCH: 보낸 칸만 고친다. 보낸 body가 비었으면 400(빈 글로 덮어쓰지 않는다).
export function validateUpdateCoverLetter(raw: unknown): UpdateCoverLetterInput {
  const obj = asObject(raw);
  const details: FieldError[] = [];
  const update: UpdateCoverLetterInput = {};
  if ('title' in obj) {
    const title = readTitle(obj.title);
    if (title.ok) update.title = title.title;
    else details.push({ field: 'title', reason: COVER_LETTER_REASONS.title });
  }
  if ('body' in obj) {
    const body = readBody(obj.body);
    if (body === null) details.push({ field: 'body', reason: COVER_LETTER_REASONS.body });
    else update.body = body;
  }
  if (details.length > 0) throw coverLetterValidationError(details);
  return update;
}
