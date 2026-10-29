import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { Check, CheckSchema } from '../checks/check.schema';
import { Experience, ExperienceSchema } from '../experiences/experience.schema';
import { ExperiencesModule } from '../experiences/experiences.module';
import { Fact, FactSchema } from '../experiences/fact.schema';
import { CoverLetter, CoverLetterSchema } from './cover-letter.schema';
import { CoverLettersController } from './cover-letters.controller';
import { CoverLettersService } from './cover-letters.service';

// 자기소개서(R7·R8). 문항별 추천·응답(C7-2~)도 이 모듈에 붙어 같은 소유자 검사·변경 알림 함수를 쓴다.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CoverLetter.name, schema: CoverLetterSchema },
      // 추천 후보 집합(확정 사실이 있는 내 경험)을 만들려고 경험·사실을 읽는다.
      { name: Experience.name, schema: ExperienceSchema },
      { name: Fact.name, schema: FactSchema },
      // 자소서가 바뀌면 그 자소서의 기존 점검을 오래됨으로 표시한다(명세 08).
      { name: Check.name, schema: CheckSchema },
    ]),
    // 추천이 AI를 부른다. 테스트는 AiService를 FakeAiService로 바꿔 끼운다(실제 Gateway 호출 금지).
    AiModule,
    // 상세 조회의 근거 카드(experiences)를 경험 상세와 같은 모양으로 조립한다.
    ExperiencesModule,
  ],
  controllers: [CoverLettersController],
  providers: [CoverLettersService],
})
export class CoverLettersModule {}
