import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { asObject } from '../auth/signup.validation';
import { Item, ITEMS } from './experience.schema';
import { CONFIRMED_SOURCES, ConfirmedSource } from './fact.schema';

export interface FactInput {
  item: Item;
  text: string;
  source: ConfirmedSource;
  clueId: Types.ObjectId | null;
}

type FactField = 'item' | 'text' | 'source' | 'clueId';

interface FieldError {
  field: FactField;
  reason: string;
}

export const FACT_REASONS: Record<FactField, string> = {
  item: '항목을 확인해 주세요.',
  text: '사실 내용을 입력해 주세요.',
  source: '출처는 "내가 말함" 또는 "자료로 확인" 중에서 골라 주세요.',
  clueId: '이 경험에 올린 단서를 골라 주세요.',
};

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// 프런트가 칸별로 오류를 보여 주도록 field·reason을 담아 400 VALIDATION으로 돌려준다(api.md 1절).
export function factValidationError(details: FieldError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION', message: '입력값을 확인해 주세요.', details });
}

function throwIfAny(details: FieldError[]): void {
  if (details.length > 0) throw factValidationError(details);
}

function isItem(value: unknown): value is Item {
  return typeof value === 'string' && (ITEMS as readonly string[]).includes(value);
}

function isConfirmedSource(value: unknown): value is ConfirmedSource {
  return typeof value === 'string' && (CONFIRMED_SOURCES as readonly string[]).includes(value);
}

// 공백만 있는 문장은 빈 값과 같다: 내용 없는 사실은 자소서 근거가 될 수 없다.
function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t === '' ? null : t;
}

// clue 출처는 단서 id가 있어야 R5(출처 보기)로 이어진다. 형식이 틀린 id는 단서가 없는 것과 같으므로 400.
function parseClueId(value: unknown, details: FieldError[]): Types.ObjectId | null {
  if (typeof value === 'string' && OBJECT_ID.test(value)) return new Types.ObjectId(value);
  details.push({ field: 'clueId', reason: FACT_REASONS.clueId });
  return null;
}

// POST: item·text·source 필수, source=clue면 clueId 필수(api.md 6절). said면 clueId는 버려 null로 저장한다.
// 같은 경험의 단서인지는 DB를 봐야 하므로 서비스가 이어서 확인한다.
export function validateCreateFact(body: unknown): FactInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  if (!isItem(obj.item)) details.push({ field: 'item', reason: FACT_REASONS.item });
  const text = trimmed(obj.text);
  if (text === null) details.push({ field: 'text', reason: FACT_REASONS.text });
  const source = obj.source;
  if (!isConfirmedSource(source)) details.push({ field: 'source', reason: FACT_REASONS.source });
  const clueId = source === 'clue' ? parseClueId(obj.clueId, details) : null;
  throwIfAny(details);
  return { item: obj.item as Item, text: text!, source: source as ConfirmedSource, clueId };
}

export interface ConfirmFactInput {
  source: ConfirmedSource;
  clueId: Types.ObjectId | null;
  text?: string;
  item?: Item;
}

// 후보 확정: source는 필수이고 said|clue만(ai_unverified는 400, C1). clue면 clueId 필수. text·item은 보냈을 때만 고친다(api.md 6절).
export function validateConfirmFact(body: unknown): ConfirmFactInput {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const source = obj.source;
  if (!isConfirmedSource(source)) details.push({ field: 'source', reason: FACT_REASONS.source });
  const clueId = source === 'clue' ? parseClueId(obj.clueId, details) : null;
  const input: Omit<ConfirmFactInput, 'source'> = { clueId };
  if ('text' in obj) {
    const text = trimmed(obj.text);
    if (text === null) details.push({ field: 'text', reason: FACT_REASONS.text });
    else input.text = text;
  }
  if ('item' in obj) {
    if (isItem(obj.item)) input.item = obj.item;
    else details.push({ field: 'item', reason: FACT_REASONS.item });
  }
  throwIfAny(details);
  return { source: source as ConfirmedSource, ...input };
}

// PATCH: 보낸 칸만 고친다. source를 보내면 POST와 같은 규칙(clue면 clueId 필수, said면 단서 연결을 끊음).
// source 없이 clueId만 보내면 지금 출처가 clue일 때만 의미가 있으므로 서비스가 기존 사실과 합쳐 확인한다.
export function validateUpdateFact(body: unknown): Partial<FactInput> {
  const obj = asObject(body);
  const details: FieldError[] = [];
  const update: Partial<FactInput> = {};
  if ('item' in obj) {
    if (isItem(obj.item)) update.item = obj.item;
    else details.push({ field: 'item', reason: FACT_REASONS.item });
  }
  if ('text' in obj) {
    const text = trimmed(obj.text);
    if (text === null) details.push({ field: 'text', reason: FACT_REASONS.text });
    else update.text = text;
  }
  if ('source' in obj) {
    if (!isConfirmedSource(obj.source)) {
      details.push({ field: 'source', reason: FACT_REASONS.source });
    } else {
      update.source = obj.source;
      update.clueId = obj.source === 'clue' ? parseClueId(obj.clueId, details) : null;
    }
  } else if ('clueId' in obj) {
    const clueId = parseClueId(obj.clueId, details);
    if (clueId) update.clueId = clueId;
  }
  throwIfAny(details);
  return update;
}
