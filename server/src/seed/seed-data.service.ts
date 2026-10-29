import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CoverLetter } from '../cover-letters/cover-letter.schema';
import { Clue } from '../experiences/clue.schema';
import { Experience } from '../experiences/experience.schema';
import { Fact } from '../experiences/fact.schema';
import { Message } from '../experiences/message.schema';
import { SEED_COVER_LETTERS, SEED_EXPERIENCES } from './seed-data';

// 시드 계정에 mock-data.md 「시드」 경험·대화·자소서를 넣는다(명세 09). AI를 부르지 않아 키가 비어도, 빈 DB 첫 기동에서도 바로 같은 화면이 나온다.
@Injectable()
export class SeedDataService {
  constructor(
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    @InjectModel(Clue.name) private readonly clues: Model<Clue>,
    @InjectModel(Fact.name) private readonly facts: Model<Fact>,
    @InjectModel(Message.name) private readonly messages: Model<Message>,
    @InjectModel(CoverLetter.name) private readonly coverLetters: Model<CoverLetter>,
  ) {}

  // 계정을 새로 만든 직후에만 불린다(SeedService). 그래서 여기서는 중복 검사를 하지 않는다.
  async seedFor(userId: Types.ObjectId): Promise<void> {
    // 순서대로 하나씩 넣는다: 목록이 최근 수정순, 대화가 시간순(_id 보조)이라 넣는 순서가 곧 화면 순서다.
    for (const seed of SEED_EXPERIENCES) {
      const exp = await this.experiences.create({
        userId,
        title: seed.title,
        period: seed.period,
        itemStatus: seed.itemStatus,
      });
      const base = { experienceId: exp._id, userId };
      if (seed.textClues.length) {
        await this.clues.insertMany(seed.textClues.map((text) => ({ ...base, type: 'text', text })));
      }
      const facts = [
        ...seed.facts.map((f) => ({
          ...base,
          item: f.item,
          text: f.text,
          status: 'confirmed',
          source: 'said',
          clueId: null,
          origin: f.origin,
        })),
        ...seed.candidates.map((c) => ({
          ...base,
          item: c.item,
          text: c.text,
          status: 'candidate',
          source: 'ai_unverified',
          clueId: null,
          origin: 'conversation',
        })),
      ];
      if (facts.length) await this.facts.insertMany(facts);
      if (seed.messages.length) {
        await this.messages.insertMany(seed.messages.map((m) => ({ ...base, role: m.role, text: m.text })));
      }
    }
    for (const letter of SEED_COVER_LETTERS) {
      await this.coverLetters.create({
        userId,
        kind: 'pasted',
        title: letter.title,
        body: letter.body,
        target: null,
        items: [],
      });
    }
  }
}
