import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { api, setToken } from '@/api/client'
import { getDb, tokenFor } from '@/mocks/db'
import { server } from '@/test/setup'
import { renderApp } from '@/test/render'

const AI_WAIT = { timeout: 4000 }
const FIRST_QUESTION = "여기서 '데이터 기반'은 어떤 데이터를 어떤 도구로 본 건가요?"
const SECOND_QUESTION = '40%는 무엇과 비교해, 어느 기간에, 어떻게 잰 값인가요?'
const FOLLOW_UP = '조금 더 구체적으로, 직접 한 행동과 확인한 결과를 말해 주세요.'
const LONG_ANSWER =
  '공지 게시판 글 목록을 크롤러 로그로 모아 엑셀로 정리했고, 마감 직전 공지가 많다는 걸 직접 확인했습니다.'
const S6_ANSWER = '실제로 재지는 않았고, 공지를 놓쳤다는 말이 줄었다는 반응만 들었습니다.'

async function seedCheck() {
  setToken(tokenFor(getDb().users[0].id))
  const { check } = await api.createCheck(getDb().coverLetters[0].id)
  return check
}

const currentPanel = () => screen.getByRole('region', { name: '현재 문장' })

describe('K 제출 전 점검', () => {
  it('시드 자소서 점검: 문장 목록과 첫 질문이 보인다', async () => {
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(await screen.findByRole('heading', { name: '점검할 문장' })).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '점검할 문장 목록' })
    expect(within(list).getAllByRole('button')).toHaveLength(4)
    for (const s of check.sentences) expect(within(list).getByText(s.text)).toBeInTheDocument()
    expect(screen.getByText('끝난 문장 0 / 전체 4')).toBeInTheDocument()

    expect(await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)).toBeInTheDocument()
    expect(within(currentPanel()).getByText('진행 중')).toBeInTheDocument()
    expect(screen.getByText('남은 추가 질문 3개')).toBeInTheDocument()
    expect(within(list).getAllByText('대기')).toHaveLength(3)
    expect((await api.getCheck(check.id)).check.sentences[0].status).toBe('in_progress')
  }, 10000)

  it('답하기 → 답이 기록에 쌓이고 판정·다음 질문, 끝나면 상태와 다음 문장. 점수는 없다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)
    const send = screen.getByRole('button', { name: '답하기' })
    expect(send).toBeDisabled()

    await user.type(screen.getByLabelText('답변'), '엑셀로 봤어요.')
    await user.click(send)
    expect(await screen.findByText(FOLLOW_UP, {}, AI_WAIT)).toBeInTheDocument()
    const turns = within(currentPanel()).getByRole('list', { name: '질문과 답' })
    expect(within(turns).getByText('엑셀로 봤어요.')).toBeInTheDocument()
    expect(within(turns).getAllByText('내 답')).toHaveLength(1)
    const judge = within(turns).getByRole('list', { name: '판정' })
    expect(within(judge).getByText('J3 표현의 실체')).toBeInTheDocument()
    expect(within(judge).getByText('빠짐')).toBeInTheDocument()
    expect(within(judge).getByText('J4 단정')).toBeInTheDocument()
    expect(within(judge).getByText('충족')).toBeInTheDocument()
    expect(screen.getByText('남은 추가 질문 2개')).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toHaveValue('')

    await user.type(screen.getByLabelText('답변'), LONG_ANSWER)
    await user.click(screen.getByRole('button', { name: '답하기' }))
    expect(await within(currentPanel()).findByText('설명됨', {}, AI_WAIT)).toBeInTheDocument()
    expect(screen.getByText('끝난 문장 1 / 전체 4')).toBeInTheDocument()
    expect(screen.queryByLabelText('답변')).not.toBeInTheDocument()
    expect(screen.queryByText(/점수/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다음 문장' }))
    expect(await screen.findByText(SECOND_QUESTION, {}, AI_WAIT)).toBeInTheDocument()
    expect(within(currentPanel()).getByText(check.sentences[1].text)).toBeInTheDocument()
  }, 15000)

  it('목록에서 문장을 누르면 그 문장을 오른쪽에 연다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)
    const list = screen.getByRole('list', { name: '점검할 문장 목록' })
    await user.click(within(list).getByText(check.sentences[3].text))
    expect(within(currentPanel()).getByText(check.sentences[3].text)).toBeInTheDocument()
    expect(within(currentPanel()).getByText('대기')).toBeInTheDocument()
    expect(screen.queryByText(FIRST_QUESTION)).not.toBeInTheDocument()
    await user.click(within(list).getByText(check.sentences[0].text))
    expect(screen.getByText(FIRST_QUESTION)).toBeInTheDocument()
  }, 10000)

  it('S6: 자소서 → 시드 자소서 → 제출 전 점검 시작 → 답하기 → 기록과 상태 글자', async () => {
    const user = userEvent.setup()
    renderApp('/experiences', { loggedIn: true })
    await user.click(await screen.findByRole('link', { name: '자소서' }))
    await user.click(await screen.findByRole('link', { name: /가나다소프트 백엔드 지원/ }))
    await user.click(await screen.findByRole('button', { name: '제출 전 점검 시작' }))
    expect(await screen.findByRole('heading', { name: '점검할 문장' }, AI_WAIT)).toBeInTheDocument()
    expect(await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)).toBeInTheDocument()
    await user.type(screen.getByLabelText('답변'), S6_ANSWER)
    await user.click(screen.getByRole('button', { name: '답하기' }))
    expect(
      await within(currentPanel()).findByText('모름·경험 없음', {}, AI_WAIT),
    ).toBeInTheDocument()
    const turns = within(currentPanel()).getByRole('list', { name: '질문과 답' })
    expect(within(turns).getByText(S6_ANSWER)).toBeInTheDocument()
    const list = screen.getByRole('list', { name: '점검할 문장 목록' })
    expect(within(list).getByText('모름·경험 없음')).toBeInTheDocument()
    expect(screen.queryByText(/점수/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 문장' })).toBeInTheDocument()
  }, 15000)

  it('stale 점검이면 안내 띠와 새 점검 시작이 보이고 답하기가 잠기며, 새 점검 시작으로 새 점검을 연다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    await api.startSentence(check.id, check.sentences[0].id)
    await api.updateCoverLetter(check.coverLetterId, { body: getDb().coverLetters[0].body + ' ' })
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(
      await screen.findByText('자소서가 바뀌어 이 점검은 더 진행할 수 없어요.'),
    ).toBeInTheDocument()
    // 기록은 그대로 보인다.
    expect(screen.getByText(FIRST_QUESTION)).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toBeDisabled()
    expect(screen.getByRole('button', { name: '답하기' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '새 점검 시작' }))
    await waitFor(
      () =>
        expect(
          screen.queryByText('자소서가 바뀌어 이 점검은 더 진행할 수 없어요.'),
        ).not.toBeInTheDocument(),
      AI_WAIT,
    )
    expect(await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toBeEnabled()
    expect(getDb().checks).toHaveLength(2)
  }, 15000)

  it('stale 점검의 대기 문장도 답하기가, 끝난 문장은 다음 문장이 잠긴다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    getDb().checks[0].stale = true
    getDb().checks[0].sentences[0].status = 'explained'
    getDb().checks[0].sentences[0].turns = [
      { question: FIRST_QUESTION, answer: LONG_ANSWER, judge: [] },
    ]
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(await screen.findByRole('button', { name: '새 점검 시작' })).toBeInTheDocument()
    expect(within(currentPanel()).getByText(check.sentences[1].text)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '답하기' })).toBeDisabled()
    const list = screen.getByRole('list', { name: '점검할 문장 목록' })
    await user.click(within(list).getByText(check.sentences[0].text))
    expect(screen.getByRole('button', { name: '다음 문장' })).toBeDisabled()
  })

  it('답하기에서 409 CHECK_STALE을 받으면 같은 화면을 오래됨으로 바꾼다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)
    await api.updateCoverLetter(check.coverLetterId, { body: '바뀐 본문입니다.' })
    await user.type(screen.getByLabelText('답변'), '엑셀로 봤어요.')
    await user.click(screen.getByRole('button', { name: '답하기' }))
    expect(
      await screen.findByText('자소서가 바뀌어 이 점검은 더 진행할 수 없어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '답하기' })).toBeDisabled()
    expect(screen.getByLabelText('답변')).toHaveValue('엑셀로 봤어요.')
  }, 10000)

  it('AI 호출에 실패하면 안내와 다시 시도가 보이고, 다시 시도로 문장을 다시 시작한다', async () => {
    const user = userEvent.setup()
    const check = await seedCheck()
    server.use(
      http.post(
        '/api/checks/:checkId/sentences/:sentenceId/start',
        () =>
          HttpResponse.json({ error: { code: 'AI_UNAVAILABLE', message: 'x' } }, { status: 502 }),
        { once: true },
      ),
    )
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(await screen.findByText('AI 호출에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByText(FIRST_QUESTION, {}, AI_WAIT)).toBeInTheDocument()
  }, 10000)

  it('남은 문장이 없으면 모든 문장을 점검했어요', async () => {
    const check = await seedCheck()
    for (const s of getDb().checks[0].sentences) {
      s.status = 'explained'
      s.turns = [{ question: '질문', answer: LONG_ANSWER, judge: [] }]
    }
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(await screen.findByText('모든 문장을 점검했어요.')).toBeInTheDocument()
    expect(screen.getByText('끝난 문장 4 / 전체 4')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다음 문장' })).not.toBeInTheDocument()
  })

  it('점검할 문장이 없으면 안내와 자소서로 돌아가기가 보인다', async () => {
    setToken(tokenFor(getDb().users[0].id))
    const { coverLetter } = await api.createCoverLetter({ body: '저는 꼼꼼한 사람입니다.' })
    const { check } = await api.createCheck(coverLetter.id)
    renderApp(`/checks/${check.id}`, { loggedIn: true })
    expect(await screen.findByText('점검할 주장 문장을 찾지 못했어요.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자소서로 돌아가기' })).toHaveAttribute(
      'href',
      `/cover-letters/${coverLetter.id}`,
    )
  }, 10000)

  it('없는 점검이면 없는 페이지예요', async () => {
    renderApp('/checks/nope', { loggedIn: true })
    expect(await screen.findByText('없는 페이지예요')).toBeInTheDocument()
  })
})
