import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ExperienceDto } from '../experiences/experience.dto';
import { CoverLetterDto, CoverLetterItemDto } from './cover-letter.dto';
import {
  validateCreateCoverLetter,
  validateGenerateAnswer,
  validateGenerateCoverLetter,
  validateSelectExperiences,
  validateUpdateCoverLetter,
  validateUpdateItem,
} from './cover-letter.validation';
import { CoverLettersService } from './cover-letters.service';

// 자기소개서 API(api.md 7절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
@Controller('cover-letters')
export class CoverLettersController {
  constructor(private readonly service: CoverLettersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.createPasted(user.id, validateCreateCoverLetter(body)) };
  }

  // 문항별 작성(R8)의 출발점. 검증을 저장보다 먼저 해 빈 우대사항·문항으로 문서가 생기지 않게 한다.
  @Post('generate')
  @HttpCode(HttpStatus.CREATED)
  async generate(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.createGenerated(user.id, validateGenerateCoverLetter(body)) };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ coverLetters: CoverLetterDto[] }> {
    return { coverLetters: await this.service.listByUser(user.id) };
  }

  // 결과 화면(R13)이 자소서와 응답에 쓴 카드를 한 번에 그린다. 남의 것·없는 것·잘못된 id는 같은 404.
  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ coverLetter: CoverLetterDto; experiences: ExperienceDto[] }> {
    return this.service.get(user.id, id);
  }

  // 검증을 소유자 조회보다 먼저 해 빈 글 400 여부가 남의 자소서 존재와 무관하게 한다.
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ coverLetter: CoverLetterDto }> {
    return { coverLetter: await this.service.update(user.id, id, validateUpdateCoverLetter(body)) };
  }

  // 문항별 카드 추천(R8). 새 자원을 만들지 않고 문항의 추천만 바꾸므로 201이 아니라 200이다(api.md 7절).
  @Post(':id/items/:itemId/recommendations')
  @HttpCode(HttpStatus.OK)
  async recommend(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<{ item: CoverLetterItemDto }> {
    return { item: await this.service.recommend(user.id, id, itemId) };
  }

  // 문항 카드 고르기(R8·R13). 검증을 소유자 조회보다 먼저 해 형식 오류 400이 남의 자소서 존재와 무관하게 한다.
  @Put(':id/items/:itemId/experiences')
  @HttpCode(HttpStatus.OK)
  async selectExperiences(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<{ item: CoverLetterItemDto; usedElsewhere: { experienceId: string; itemIds: string[] }[] }> {
    const { experienceIds } = validateSelectExperiences(body);
    return this.service.selectExperiences(user.id, id, itemId, experienceIds);
  }

  // 문항 응답 생성(R8·C4). AI가 응답을 만드는 유일한 경로다. 문항만 바꾸므로 200이고, 검증을 소유자 조회보다 먼저 한다.
  @Post(':id/items/:itemId/answer')
  @HttpCode(HttpStatus.OK)
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<{ item: CoverLetterItemDto }> {
    return { item: await this.service.generateAnswer(user.id, id, itemId, validateGenerateAnswer(body)) };
  }

  // 사용자가 고친 응답 저장(R8·R13). 빈 글 400을 남의 자소서 존재와 무관하게 하려고 검증을 먼저 한다.
  @Patch(':id/items/:itemId')
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
  ): Promise<{ item: CoverLetterItemDto }> {
    return { item: await this.service.updateItem(user.id, id, itemId, validateUpdateItem(body)) };
  }
}
