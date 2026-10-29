import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../auth/current-user.decorator';
import { FactDto } from '../experiences/experience.dto';
import {
  AnswerResultDto,
  CheckDto,
  CheckSentenceDto,
  validateAnswerText,
  validateConfirmCandidate,
} from './check.dto';
import { ChecksService } from './checks.service';

// 제출 전 점검 API(api.md 9절). @Public()이 없으므로 전역 가드가 토큰을 요구하고, 사용자는 토큰에서만 얻는다.
// 경로가 cover-letters/:id/checks와 checks/:checkId 두 갈래라 컨트롤러 prefix를 비워 둔다.
@Controller()
export class ChecksController {
  constructor(private readonly service: ChecksService) {}

  // 점검 만들기(R9). 새 점검 문서가 생기므로 201이다.
  @Post('cover-letters/:id/checks')
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ check: CheckDto }> {
    return { check: await this.service.create(user.id, id) };
  }

  // 새로고침 뒤 진행 중인 점검을 다시 찾는 목록(R11, 최신순).
  @Get('cover-letters/:id/checks')
  async list(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<{ checks: CheckDto[] }> {
    return { checks: await this.service.listByCoverLetter(user.id, id) };
  }

  @Get('checks/:checkId')
  async get(@CurrentUser() user: AuthUser, @Param('checkId') checkId: string): Promise<{ check: CheckDto }> {
    return { check: await this.service.get(user.id, checkId) };
  }

  // 문장 첫 질문(R10). 새 자원이 아니라 문장 상태를 바꾸므로 200이다(api.md 9절).
  @Post('checks/:checkId/sentences/:sentenceId/start')
  @HttpCode(HttpStatus.OK)
  async start(
    @CurrentUser() user: AuthUser,
    @Param('checkId') checkId: string,
    @Param('sentenceId') sentenceId: string,
  ): Promise<{ sentence: CheckSentenceDto }> {
    return { sentence: await this.service.start(user.id, checkId, sentenceId) };
  }

  // 답하기(R10~R12). 본문 검증을 소유자 조회보다 먼저 해 400 여부로 남의 점검을 떠볼 수 없게 한다.
  @Post('checks/:checkId/sentences/:sentenceId/answers')
  @HttpCode(HttpStatus.OK)
  async answer(
    @CurrentUser() user: AuthUser,
    @Param('checkId') checkId: string,
    @Param('sentenceId') sentenceId: string,
    @Body() body: unknown,
  ): Promise<AnswerResultDto> {
    return this.service.answer(user.id, checkId, sentenceId, validateAnswerText(body));
  }

  // 점검 후보 확정(R12·C1). 사실이 생기지만 경로가 후보 처리 동작이라 api.md 9절대로 200이다.
  // 본문 검증을 소유자 조회보다 먼저 해 400 여부로 남의 점검을 떠볼 수 없게 한다.
  @Post('checks/:checkId/candidates/:factId/confirm')
  @HttpCode(HttpStatus.OK)
  async confirmCandidate(
    @CurrentUser() user: AuthUser,
    @Param('checkId') checkId: string,
    @Param('factId') factId: string,
    @Body() body: unknown,
  ): Promise<{ fact: FactDto }> {
    return { fact: await this.service.confirmCandidate(user.id, checkId, factId, validateConfirmCandidate(body)) };
  }

  // 후보 버리기(R12). 돌려줄 본문이 없으므로 204.
  @Delete('checks/:checkId/candidates/:factId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCandidate(
    @CurrentUser() user: AuthUser,
    @Param('checkId') checkId: string,
    @Param('factId') factId: string,
  ): Promise<void> {
    await this.service.deleteCandidate(user.id, checkId, factId);
  }
}
