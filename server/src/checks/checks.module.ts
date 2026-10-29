import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from '../ai/ai.module';
import { CoverLetter, CoverLetterSchema } from '../cover-letters/cover-letter.schema';
import { ExperiencesModule } from '../experiences/experiences.module';
import { Check, CheckSchema } from './check.schema';
import { ChecksController } from './checks.controller';
import { ChecksService } from './checks.service';

// 제출 전 점검(R9~R12). 자소서는 소유 확인·원문 대조용으로 읽기만 한다(C4).
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Check.name, schema: CheckSchema },
      { name: CoverLetter.name, schema: CoverLetterSchema },
    ]),
    // 문장 고르기가 AI를 부른다. 테스트는 AiService를 FakeAiService로 바꿔 끼운다(실제 Gateway 호출 금지).
    AiModule,
    // 후보 확정이 고른 경험의 소유·단서를 확인하고 사실을 만든다(R12·C1). 경험 쪽 규칙을 한 곳에 둔다.
    ExperiencesModule,
  ],
  controllers: [ChecksController],
  providers: [ChecksService],
})
export class ChecksModule {}
