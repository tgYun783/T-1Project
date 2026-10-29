import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CoverLetter, CoverLetterSchema } from '../cover-letters/cover-letter.schema';
import { Clue, ClueSchema } from '../experiences/clue.schema';
import { Experience, ExperienceSchema } from '../experiences/experience.schema';
import { Fact, FactSchema } from '../experiences/fact.schema';
import { Message, MessageSchema } from '../experiences/message.schema';
import { SeedDataService } from '../seed/seed-data.service';
import { SeedService } from './seed.service';
import { User, UserSchema } from './user.schema';

// users 컬렉션 모델과 기동 시 시드를 한곳에 둔다. 인증 모듈이 이 모델을 다시 쓴다.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      // 시드 계정의 경험·단서·사실·대화·자소서를 첫 기동에 넣는다(명세 09).
      { name: Experience.name, schema: ExperienceSchema },
      { name: Clue.name, schema: ClueSchema },
      { name: Fact.name, schema: FactSchema },
      { name: Message.name, schema: MessageSchema },
      { name: CoverLetter.name, schema: CoverLetterSchema },
    ]),
  ],
  providers: [SeedService, SeedDataService],
  exports: [MongooseModule],
})
export class UsersModule {}
