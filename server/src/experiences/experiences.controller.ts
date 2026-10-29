import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { ClueFileInterceptor } from './clue-file.interceptor';
import { UploadedClueFile, validateFileClue, validateTextClue } from './clue.validation';
import {
  ConversationAnswerDto,
  ConversationDto,
  ConversationService,
  ConversationStartDto,
} from './conversation.service';
import { validateAnswer } from './conversation.validation';
import { ClueDto, ExperienceDto, FactDto } from './experience.dto';
import { validateCreateExperience, validateUpdateExperience } from './experience.validation';
import { validateConfirmFact, validateCreateFact, validateUpdateFact } from './fact.validation';
import { ExperiencesService } from './experiences.service';

// RFC 5987: 한글 이름은 filename*로 싣고, 옛 브라우저용 filename에는 ASCII만 남긴다. 헤더 주입을 막으려 따옴표·제어문자도 바꾼다.
function contentDisposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// 경험 API(api.md 4절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
@Controller('experiences')
export class ExperiencesController {
  constructor(
    private readonly service: ExperiencesService,
    private readonly conversation: ConversationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.create(user.id, validateCreateExperience(body)) };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ experiences: ExperienceDto[] }> {
    return { experiences: await this.service.listByUser(user.id) };
  }

  @Get(':id')
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.get(user.id, id) };
  }

  // 같은 경로가 JSON 텍스트 단서와 multipart 파일 단서를 받는다(api.md 4절). 본문 형식으로 갈라 각자 규칙으로 검증한다.
  // 검증을 소유자 조회보다 먼저 해 400 여부가 남의 경험 존재와 무관하게 한다.
  @Post(':id/clues')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(ClueFileInterceptor)
  async addClue(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body: unknown,
    @UploadedFile() file: UploadedClueFile | undefined,
  ): Promise<{ clue: ClueDto }> {
    const input = req.is('multipart/form-data') ? validateFileClue(body, file) : validateTextClue(body);
    return { clue: await this.service.addClue(user.id, id, input) };
  }

  // 올린 바이트·형식·이름을 그대로 돌려준다(R5). attachment·nosniff로 사용자가 올린 HTML 등이 우리 화면에서 실행되지 않게 한다.
  @Get(':id/clues/:clueId/file')
  async getClueFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('clueId') clueId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.getClueFile(user.id, id, clueId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.data, {
      type: file.mimeType,
      length: file.data.length,
      disposition: contentDisposition(file.fileName),
    });
  }

  // 대화 화면이 처음 열릴 때 그리는 값(api.md 5절). 대화 전이면 messages가 빈 배열이다.
  @Get(':id/conversation')
  async getConversation(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ConversationDto> {
    return this.conversation.get(user.id, id);
  }

  // 새 질문을 만들 때도 기존 질문을 돌려줄 때도 api.md 5절대로 200으로 고정한다(Nest POST 기본 201이 아님).
  @Post(':id/conversation/start')
  @HttpCode(HttpStatus.OK)
  async startConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<ConversationStartDto> {
    return this.conversation.start(user.id, id);
  }

  // 답하기도 api.md 5절대로 200. 본문 검증을 소유자 조회보다 먼저 해 400 여부로 남의 경험을 떠볼 수 없게 한다.
  @Post(':id/conversation/answers')
  @HttpCode(HttpStatus.OK)
  async answerConversation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ConversationAnswerDto> {
    return this.conversation.answer(user.id, id, validateAnswer(body));
  }

  // 사용자가 카드에 직접 쓰는 사실(api.md 6절). 형식 검증을 소유자 조회보다 먼저 해 400 여부로 남의 경험을 떠볼 수 없게 한다.
  @Post(':id/facts')
  @HttpCode(HttpStatus.CREATED)
  async addFact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ fact: FactDto }> {
    return { fact: await this.service.addFact(user.id, id, validateCreateFact(body)) };
  }

  // AI 후보를 사용자가 확인해 카드에 넣는다(api.md 6절). Nest POST 기본 201이 아니라 api.md대로 200.
  // 형식 검증을 소유자 조회보다 먼저 해 400 여부로 남의 경험을 떠볼 수 없게 한다.
  @Post(':id/facts/:factId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmFact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('factId') factId: string,
    @Body() body: unknown,
  ): Promise<{ fact: FactDto }> {
    return { fact: await this.service.confirmFact(user.id, id, factId, validateConfirmFact(body)) };
  }

  @Patch(':id/facts/:factId')
  async updateFact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('factId') factId: string,
    @Body() body: unknown,
  ): Promise<{ fact: FactDto }> {
    return { fact: await this.service.updateFact(user.id, id, factId, validateUpdateFact(body)) };
  }

  // 지운 뒤 돌려줄 자원이 없으므로 204 빈 본문(api.md 6절).
  @Delete(':id/facts/:factId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('factId') factId: string,
  ): Promise<void> {
    await this.service.deleteFact(user.id, id, factId);
  }

  // 입력 검증을 DB 조회보다 먼저 한다: 400 여부가 자원 존재와 무관해져 남의 경험이 있는지 떠볼 수 없다.
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<{ experience: ExperienceDto }> {
    return { experience: await this.service.update(user.id, id, validateUpdateExperience(body)) };
  }
}
