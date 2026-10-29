import { Types } from 'mongoose';
import { CoverLetter, CoverLetterItem, CoverLetterKind } from './cover-letter.schema';

// api.md 2절 CoverLetterItem·CoverLetter 응답 모양.
export interface CoverLetterItemDto {
  id: string;
  question: string;
  recommendations: { experienceId: string; reason: string }[];
  selectedExperienceIds: string[];
  answer: string | null;
  usedExperienceIds: string[];
  answerEdited: boolean;
}

export interface CoverLetterDto {
  id: string;
  kind: CoverLetterKind;
  title: string | null;
  body: string | null;
  target: { preferred: string; talent: string } | null;
  items: CoverLetterItemDto[];
  createdAt: string;
  updatedAt: string;
}

type ItemRecord = CoverLetterItem & { _id: Types.ObjectId };
type CoverLetterRecord = CoverLetter & { _id: unknown };

export function toItemDto(item: ItemRecord): CoverLetterItemDto {
  return {
    id: String(item._id),
    question: item.question,
    recommendations: (item.recommendations ?? []).map((r) => ({
      experienceId: String(r.experienceId),
      reason: r.reason,
    })),
    selectedExperienceIds: (item.selectedExperienceIds ?? []).map(String),
    answer: item.answer ?? null,
    usedExperienceIds: (item.usedExperienceIds ?? []).map(String),
    answerEdited: item.answerEdited ?? false,
  };
}

// 응답에 userId·_id·__v가 새지 않도록 키를 하나씩 골라 조립한다(R1).
export function toCoverLetterDto(cl: CoverLetterRecord): CoverLetterDto {
  return {
    id: String(cl._id),
    kind: cl.kind,
    title: cl.title ?? null,
    body: cl.body ?? null,
    target: cl.target ? { preferred: cl.target.preferred, talent: cl.target.talent } : null,
    items: (cl.items ?? []).map(toItemDto),
    createdAt: cl.createdAt.toISOString(),
    updatedAt: cl.updatedAt.toISOString(),
  };
}
