import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const COVER_LETTER_KINDS = ['pasted', 'generated'] as const;
export type CoverLetterKind = (typeof COVER_LETTER_KINDS)[number];

// 문항(api.md 2절 CoverLetterItem). 자소서 문서 안 배열이며 각 문항이 고유 _id를 가진다(명세 07 「결정」).
@Schema({ _id: true })
export class CoverLetterItem {
  @Prop({ type: String, required: true })
  question!: string;

  @Prop({ type: [{ experienceId: Types.ObjectId, reason: String, _id: false }], default: [] })
  recommendations!: { experienceId: Types.ObjectId; reason: string }[];

  @Prop({ type: [Types.ObjectId], default: [] })
  selectedExperienceIds!: Types.ObjectId[];

  @Prop({ type: String, default: null })
  answer!: string | null;

  @Prop({ type: [Types.ObjectId], default: [] })
  usedExperienceIds!: Types.ObjectId[];

  @Prop({ type: Boolean, default: false })
  answerEdited!: boolean;
}

export const CoverLetterItemSchema = SchemaFactory.createForClass(CoverLetterItem);

// userId 인덱스로 "내 자소서 목록"을 계정별로 고른다(R1). updatedAt은 목록 정렬 기준(R7)이자 점검 「오래됨」 판단의 바탕이다.
@Schema({ collection: 'coverLetters', timestamps: true })
export class CoverLetter {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: COVER_LETTER_KINDS })
  kind!: CoverLetterKind;

  @Prop({ type: String, default: null })
  title!: string | null;

  @Prop({ type: String, default: null })
  body!: string | null;

  @Prop({ type: { preferred: String, talent: String, _id: false }, default: null })
  target!: { preferred: string; talent: string } | null;

  @Prop({ type: [CoverLetterItemSchema], default: [] })
  items!: (CoverLetterItem & { _id: Types.ObjectId })[];

  createdAt!: Date;
  updatedAt!: Date;
}

export type CoverLetterDocument = HydratedDocument<CoverLetter>;
export const CoverLetterSchema = SchemaFactory.createForClass(CoverLetter);
