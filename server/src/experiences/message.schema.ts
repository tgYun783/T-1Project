import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export const MESSAGE_ROLES = ['ai', 'user'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// 경험 대화 한 줄(명세 06, api.md 2절 Message). 대화 = 그 경험의 메시지 시간순이라 experienceId 인덱스로 모은다.
@Schema({ collection: 'messages', timestamps: { createdAt: true, updatedAt: false } })
export class Message {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  experienceId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: String, required: true, enum: MESSAGE_ROLES })
  role!: MessageRole;

  @Prop({ required: true })
  text!: string;

  createdAt!: Date;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);
