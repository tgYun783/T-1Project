import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { assertOwner, parseObjectIdOr404 } from '../common/ownership';
import { Clue } from './clue.schema';
import { FileClueInput, TextClueInput } from './clue.validation';
import {
  ClueDto,
  ExperienceDto,
  ExperienceRelated,
  FactDto,
  toClueDto,
  toExperienceDto,
  toFactDto,
} from './experience.dto';
import { Experience } from './experience.schema';
import { ExperienceInput } from './experience.validation';
import { Fact } from './fact.schema';
import { ConfirmFactInput, FACT_REASONS, FactInput, factValidationError } from './fact.validation';

type ExperienceRecord = Experience & { _id: Types.ObjectId };
type ClueRecord = Clue & { _id: Types.ObjectId };
type FactRecord = Fact & { _id: Types.ObjectId };

export interface ClueFile {
  data: Buffer;
  mimeType: string;
  fileName: string;
}

// 경험 상세·목록에 실을 단서 칸. 바이트(data)는 빼서 목록 조회가 파일 크기만큼 무거워지지 않게 한다.
const CLUE_LIST_FIELDS = '_id type description text fileName createdAt';

@Injectable()
export class ExperiencesService {
  constructor(
    @InjectModel(Experience.name) private readonly experiences: Model<Experience>,
    @InjectModel(Clue.name) private readonly clues: Model<Clue>,
    @InjectModel(Fact.name) private readonly facts: Model<Fact>,
  ) {}

  async create(userId: string, input: ExperienceInput): Promise<ExperienceDto> {
    const created = await this.experiences.create({
      userId: new Types.ObjectId(userId),
      title: input.title,
      period: input.period,
    });
    return this.assemble(created.toObject());
  }

  // 토큰 사용자의 것만, 최근 수정순(R1·R6). 같은 시각이면 _id로 순서를 고정해 목록이 흔들리지 않게 한다.
  async listByUser(userId: string): Promise<ExperienceDto[]> {
    const docs = await this.experiences
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1, _id: -1 })
      .lean<ExperienceRecord[]>();
    return Promise.all(docs.map((doc) => this.assemble(doc)));
  }

  async get(userId: string, id: string): Promise<ExperienceDto> {
    return this.assemble(await this.findOwned(userId, id));
  }

  // 다른 기능(자소서 근거 카드)이 경험 상세와 같은 모양으로 여러 장을 받아 간다. 내 것이 아니거나 지운 경험은 조용히 빠지고, 순서는 받은 id 순서를 따른다.
  async getMany(userId: string, ids: Types.ObjectId[]): Promise<ExperienceDto[]> {
    if (!ids.length) return [];
    const docs = await this.experiences
      .find({ _id: { $in: ids }, userId: new Types.ObjectId(userId) })
      .lean<ExperienceRecord[]>();
    const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
    const ordered = ids.map((oid) => byId.get(String(oid))).filter((doc): doc is ExperienceRecord => !!doc);
    return Promise.all(ordered.map((doc) => this.assemble(doc)));
  }

  // 소유자 확인 뒤에만 고친다. 고친 칸이 없으면 updatedAt도 그대로 둬 목록 순서를 흔들지 않는다.
  async update(userId: string, id: string, input: Partial<ExperienceInput>): Promise<ExperienceDto> {
    const owned = await this.findOwned(userId, id);
    if (Object.keys(input).length === 0) return this.assemble(owned);
    const updated = await this.experiences
      .findOneAndUpdate({ _id: owned._id, userId: owned.userId }, { $set: input }, { returnDocument: 'after' })
      .lean<ExperienceRecord>();
    return this.assemble(assertOwner(updated, userId));
  }

  // 남의 경험에는 단서를 붙이지 않는다(404). 단서가 생기면 경험 updatedAt을 올려 목록 맨 앞으로 온다(R6).
  async addClue(userId: string, id: string, input: TextClueInput | FileClueInput): Promise<ClueDto> {
    const owned = await this.findOwned(userId, id);
    const fields =
      input.type === 'text'
        ? { type: input.type, text: input.text }
        : {
            type: input.type,
            description: input.description,
            fileName: input.fileName,
            mimeType: input.mimeType,
            size: input.size,
            data: input.data,
          };
    const created = await this.clues.create({ experienceId: owned._id, userId: owned.userId, ...fields });
    await this.experiences.updateOne({ _id: owned._id }, { $set: { updatedAt: new Date() } });
    return toClueDto(created.toObject());
  }

  // 경험 소유·이 경험의 단서·파일 단서인지를 모두 맞춰 본다. 하나라도 어긋나면 같은 404라 남의 파일이 있는지 알 수 없다(R1).
  async getClueFile(userId: string, id: string, clueId: string): Promise<ClueFile> {
    const owned = await this.findOwned(userId, id);
    const clueObjectId = parseObjectIdOr404(clueId);
    const clue = await this.clues
      .findOne({ _id: clueObjectId, experienceId: owned._id, userId: owned.userId })
      .lean<ClueRecord>();
    if (!clue || clue.type === 'text' || !clue.data || clue.fileName === null) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    }
    return {
      data: toBuffer(clue.data),
      mimeType: clue.mimeType || 'application/octet-stream',
      fileName: clue.fileName,
    };
  }

  // 사용자가 직접 쓴 사실은 확인을 거친 것이므로 바로 confirmed·manual로 카드에 들어간다(api.md 6절, R6).
  async addFact(userId: string, id: string, input: FactInput): Promise<FactDto> {
    const owned = await this.findOwned(userId, id);
    if (input.source === 'clue') await this.assertClueOfExperience(owned, input.clueId);
    const created = await this.facts.create({
      experienceId: owned._id,
      userId: owned.userId,
      item: input.item,
      text: input.text,
      status: 'confirmed',
      source: input.source,
      clueId: input.source === 'clue' ? input.clueId : null,
      origin: 'manual',
    });
    await this.touch(owned);
    return toFactDto(created.toObject());
  }

  // 점검 후보 확정(api.md 9절, R12·C1): 사용자가 고른 내 경험에 확인한 사실을 confirmed·origin check로 넣는다.
  // 경험 소유(404)·단서 소속(400)을 먼저 본 뒤 claim(후보 꺼내기)이 성공해야 만든다: 실패한 요청에 후보가 사라지거나 같은 후보가 두 번 들어가지 않는다.
  async addCheckFact(
    userId: string,
    experienceId: string,
    input: FactInput,
    claim: () => Promise<void>,
  ): Promise<FactDto> {
    const owned = await this.findOwned(userId, experienceId);
    if (input.source === 'clue') await this.assertClueOfExperience(owned, input.clueId);
    await claim();
    const created = await this.facts.create({
      experienceId: owned._id,
      userId: owned.userId,
      item: input.item,
      text: input.text,
      status: 'confirmed',
      source: input.source,
      clueId: input.source === 'clue' ? input.clueId : null,
      origin: 'check',
    });
    await this.touch(owned);
    return toFactDto(created.toObject());
  }

  // 보낸 칸만 고친다. 고친 뒤의 출처가 clue면 그 단서가 이 경험 것인지 다시 확인해, 고치는 길로 남의 단서가 붙지 않게 한다(C1).
  async updateFact(userId: string, id: string, factId: string, input: Partial<FactInput>): Promise<FactDto> {
    const owned = await this.findOwned(userId, id);
    const fact = await this.findFact(owned, factId);
    if (Object.keys(input).length === 0) return toFactDto(fact);
    const source = input.source ?? fact.source;
    if (input.clueId !== undefined && input.clueId !== null && source !== 'clue') {
      throw factValidationError([{ field: 'clueId', reason: FACT_REASONS.clueId }]);
    }
    if (source === 'clue') await this.assertClueOfExperience(owned, input.clueId ?? fact.clueId);
    const updated = await this.facts
      .findOneAndUpdate({ _id: fact._id, experienceId: owned._id }, { $set: input }, { returnDocument: 'after' })
      .lean<FactRecord>();
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    await this.touch(owned);
    return toFactDto(updated);
  }

  // 후보만 확정한다. 이미 확정된 사실을 다시 확정하면 출처가 조용히 덮이므로 409로 막는다(명세 06).
  // itemStatus는 대화 판정이라 건드리지 않고 updatedAt만 올린다(api.md 5절 끝).
  async confirmFact(userId: string, id: string, factId: string, input: ConfirmFactInput): Promise<FactDto> {
    const owned = await this.findOwned(userId, id);
    const fact = await this.findFact(owned, factId);
    if (fact.status !== 'candidate') {
      throw new ConflictException({ code: 'FACT_RESOLVED', message: '이미 확정된 사실입니다.' });
    }
    if (input.source === 'clue') await this.assertClueOfExperience(owned, input.clueId);
    const set: Partial<Fact> = {
      status: 'confirmed',
      source: input.source,
      clueId: input.source === 'clue' ? input.clueId : null,
    };
    if (input.text !== undefined) set.text = input.text;
    if (input.item !== undefined) set.item = input.item;
    // status 조건을 걸어 동시에 두 번 확정해도 한 번만 바뀐다.
    const updated = await this.facts
      .findOneAndUpdate(
        { _id: fact._id, experienceId: owned._id, status: 'candidate' },
        { $set: set },
        { returnDocument: 'after' },
      )
      .lean<FactRecord>();
    if (!updated) throw new ConflictException({ code: 'FACT_RESOLVED', message: '이미 확정된 사실입니다.' });
    await this.touch(owned);
    return toFactDto(updated);
  }

  // 이 경험의 사실만 지운다. 다른 경험 경로로 온 factId는 404라 경로와 자원이 어긋나도 지워지지 않는다(R1).
  async deleteFact(userId: string, id: string, factId: string): Promise<void> {
    const owned = await this.findOwned(userId, id);
    const fact = await this.findFact(owned, factId);
    await this.facts.deleteOne({ _id: fact._id, experienceId: owned._id });
    await this.touch(owned);
  }

  // 사실이 바뀌면 updatedAt만 올린다. itemStatus는 대화가 정하는 값이라 건드리지 않는다(api.md 5절 끝).
  private async touch(owned: ExperienceRecord): Promise<void> {
    await this.experiences.updateOne({ _id: owned._id }, { $set: { updatedAt: new Date() } });
  }

  private async findFact(owned: ExperienceRecord, factId: string): Promise<FactRecord> {
    const fact = await this.facts
      .findOne({ _id: parseObjectIdOr404(factId), experienceId: owned._id, userId: owned.userId })
      .lean<FactRecord>();
    if (!fact) throw new NotFoundException({ code: 'NOT_FOUND', message: '찾을 수 없습니다.' });
    return fact;
  }

  // clue 출처는 같은 경험의 단서여야 한다(명세 05). 다른 경험의 단서를 붙이면 R5 출처 보기가 엉뚱한 자료를 연다.
  private async assertClueOfExperience(owned: ExperienceRecord, clueId: Types.ObjectId | null): Promise<void> {
    const exists = clueId ? await this.clues.exists({ _id: clueId, experienceId: owned._id }) : null;
    if (!exists) throw factValidationError([{ field: 'clueId', reason: FACT_REASONS.clueId }]);
  }

  // 잘못된 id 형식·없는 id·남의 경험을 모두 같은 404로 돌려 존재 여부가 새지 않게 한다(R1).
  private async findOwned(userId: string, id: string): Promise<ExperienceRecord> {
    const objectId = parseObjectIdOr404(id);
    const doc = await this.experiences.findById(objectId).lean<ExperienceRecord>();
    return assertOwner(doc, userId);
  }

  // 단서·사실은 만든 순서대로 보여 줘야 사용자가 방금 올린 것을 끝에서 찾는다. 카드·후보 나누기는 toExperienceDto가 한다.
  private async assemble(doc: ExperienceRecord): Promise<ExperienceDto> {
    const [clues, facts] = await Promise.all([
      this.clues
        .find({ experienceId: doc._id })
        .select(CLUE_LIST_FIELDS)
        .sort({ createdAt: 1, _id: 1 })
        .lean<ClueRecord[]>(),
      this.facts.find({ experienceId: doc._id }).sort({ createdAt: 1, _id: 1 }).lean<FactRecord[]>(),
    ]);
    const related: ExperienceRelated = { clues: clues.map(toClueDto), facts: facts.map(toFactDto) };
    return toExperienceDto(doc, related);
  }
}

// lean 조회는 Buffer 대신 BSON Binary를 줄 수 있다. 올린 바이트를 그대로 돌려주려면 실제 Buffer로 바꿔야 한다.
function toBuffer(data: unknown): Buffer {
  if (Buffer.isBuffer(data)) return data;
  const bin = data as { buffer: Uint8Array };
  return Buffer.from(bin.buffer.buffer, bin.buffer.byteOffset, bin.buffer.byteLength);
}
