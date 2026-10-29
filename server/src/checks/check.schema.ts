import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { FACT_ORIGINS, FACT_SOURCES, FACT_STATUSES, FactOrigin, FactSource, FactStatus } from '../experiences/fact.schema';
import { Item, ITEMS } from '../experiences/experience.schema';

export const SENTENCE_STATUSES = ['pending', 'in_progress', 'explained', 'needs_more', 'unknown'] as const;
export type SentenceStatus = (typeof SENTENCE_STATUSES)[number];
export const JUDGE_IDS = ['J1', 'J2', 'J3', 'J4'] as const;
export const JUDGE_RESULTS = ['met', 'missing'] as const;
export type JudgeResult = { id: (typeof JUDGE_IDS)[number]; result: (typeof JUDGE_RESULTS)[number] };

// 첫 질문 뒤 남은 추가 질문 수의 처음 값(api.md 2절 CheckSentence.followUpsLeft).
export const INITIAL_FOLLOW_UPS = 3;

// 문장별 질문·답 한 번(api.md 2절 CheckSentence.turns).
@Schema({ _id: false })
export class CheckTurn {
  @Prop({ type: String, required: true })
  question!: string;

  @Prop({ type: String, default: null })
  answer!: string | null;

  @Prop({ type: [{ id: { type: String, enum: JUDGE_IDS }, result: { type: String, enum: JUDGE_RESULTS }, _id: false }], default: [] })
  judge!: JudgeResult[];
}
export const CheckTurnSchema = SchemaFactory.createForClass(CheckTurn);

// 점검할 주장 문장. 점검 문서 안 배열이며 각 문장이 고유 _id를 가진다(명세 08 「결정」).
@Schema({ _id: true })
export class CheckSentence {
  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: Types.ObjectId, default: null })
  coverLetterItemId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: SENTENCE_STATUSES, default: 'pending' })
  status!: SentenceStatus;

  @Prop({ type: [CheckTurnSchema], default: [] })
  turns!: CheckTurn[];

  @Prop({ type: Number, required: true, default: INITIAL_FOLLOW_UPS })
  followUpsLeft!: number;
}
export const CheckSentenceSchema = SchemaFactory.createForClass(CheckSentence);

// 점검 답변에서 나온 사실 후보(R12). 경험이 아직 정해지지 않았을 수 있어 facts가 아니라 점검 안에 둔다(명세 08 「결정」).
// createdAt은 서비스가 응답(newCandidates)과 같은 값으로 직접 넣는다. timestamps를 켜면 $push 때 mongoose가
// 다른 시각으로 덮어써 응답과 저장값이 1ms 어긋난다(CI에서 C8-4 테스트가 가끔 실패).
@Schema({ _id: true })
export class CheckCandidate {
  @Prop({ type: Types.ObjectId, default: null })
  experienceId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: ITEMS })
  item!: Item;

  @Prop({ type: String, required: true })
  text!: string;

  @Prop({ type: String, required: true, enum: FACT_STATUSES })
  status!: FactStatus;

  @Prop({ type: String, required: true, enum: FACT_SOURCES })
  source!: FactSource;

  @Prop({ type: Types.ObjectId, default: null })
  clueId!: Types.ObjectId | null;

  @Prop({ type: String, required: true, enum: FACT_ORIGINS })
  origin!: FactOrigin;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}
export const CheckCandidateSchema = SchemaFactory.createForClass(CheckCandidate);

// userId로 계정을 나누고(R1) coverLetterId 인덱스로 「이 자소서의 점검 목록」을 고른다(R11).
@Schema({ collection: 'checks', timestamps: { createdAt: true, updatedAt: false } })
export class Check {
  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true, index: true })
  coverLetterId!: Types.ObjectId;

  @Prop({ type: Boolean, default: false })
  stale!: boolean;

  @Prop({ type: [CheckSentenceSchema], default: [] })
  sentences!: (CheckSentence & { _id: Types.ObjectId })[];

  @Prop({ type: [CheckCandidateSchema], default: [] })
  candidates!: (CheckCandidate & { _id: Types.ObjectId })[];

  createdAt!: Date;
}

export type CheckDocument = HydratedDocument<Check>;
export const CheckSchema = SchemaFactory.createForClass(Check);
