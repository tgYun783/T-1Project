import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

// 서비스 역할은 취준생 하나뿐이다(scenarios.yaml 역할). 다른 값이 저장되지 않게 enum으로 막는다.
export const USER_ROLES = ['취준생'] as const;
export type UserRole = (typeof USER_ROLES)[number];

// email unique 인덱스가 동시 기동 시에도 같은 계정이 두 번 생기지 않게 보장한다.
@Schema({ collection: 'users', timestamps: true })
export class User {
  @Prop({ required: true, unique: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true })
  passwordHash!: string;

  @Prop({ required: true, enum: USER_ROLES, default: '취준생' })
  role!: UserRole;

  // timestamps: true가 채운다. 가입 응답의 createdAt으로 쓴다.
  createdAt!: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
