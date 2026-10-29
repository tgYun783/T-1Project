import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/user.schema';

// 명세 02 결정: bcrypt cost 10.
const BCRYPT_ROUNDS = 10;
const MONGO_DUPLICATE_KEY = 11000;

export interface PublicUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

// 화이트리스트로 필드를 고른다: 스키마에 필드가 늘어도 passwordHash 같은 값이 응답에 섞이지 않는다.
export function toPublicUser(doc: UserDocument): PublicUser {
  return {
    id: doc._id.toString(),
    email: doc.email,
    role: doc.role,
    createdAt: doc.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  // 중복 판단은 unique 인덱스 충돌로 한다: 사전 조회만으로는 동시 가입 두 건이 모두 통과할 수 있다.
  async signup(email: string, password: string): Promise<UserDocument> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      return await this.userModel.create({ email, passwordHash, role: '취준생' });
    } catch (error) {
      if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
        throw new ConflictException({ code: 'EMAIL_TAKEN', message: '이미 가입된 이메일입니다.' });
      }
      throw error;
    }
  }
}
