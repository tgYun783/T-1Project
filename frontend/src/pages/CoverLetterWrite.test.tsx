import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { api, setToken } from '@/api/client'
import { getDb, tokenFor } from '@/mocks/db'
import { server } from '@/test/setup'
import { renderApp } from '@/test/render'

const CAPSTONE = '캡스톤디자인 학과 공지 알림 앱'
const HACKATHON = '교내 해커톤 동아리 회비 정산 웹'
const QUESTION = '직무 관련 경험을 바탕으로 본인의 강점을 서술하시오'
// 추천 800ms + 응답 800ms를 기다린다.
const AI_WAIT = { timeout: 4000 }

function expId(title: string) {
  const found = getDb().experiences.find((e) => e.title === title)
  if (!found) throw new Error('시드 경험이 없어요')
  return found.id
}

async function makeLetter(questions: string[]) {
  setToken(tokenFor(getDb().users[0].id))
  const { coverLetter } = await api.generateCoverLetter({
    preferred: 'REST API 설계 경험, 협업 도구 사용 경험',
    talent: '문제를 끝까지 파고드는 사람',
    questions,
  })
  return coverLetter
}

describe('I 문항별 작성', () => {
  it('들어오면 추천 카드와 이유가 보인다', async () => {
    const letter = await makeLetter([QUESTION])
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[0].id}`, { loggedIn: true })
    expect(await screen.findByText(QUESTION)).toBeInTheDocument()
    expect(screen.getByText('응답 0 / 문항 1')).toBeInTheDocument()
    const rec = screen.getByRole('region', { name: '추천 경험 카드' })
    expect(await within(rec).findByRole('button', { name: CAPSTONE }, AI_WAIT)).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(within(rec).getAllByText('직접 만든 기능과 결과가 문항과 맞아요')).toHaveLength(2)
    expect(screen.getByRole('button', { name: '이 문항 만들기' })).toBeDisabled()
  })

  it('추천에 없는 카드는 다른 카드 아래에서 켤 수 있고, 사실 보기로 확정 사실과 보강 버튼이 보인다', async () => {
    const letter = await makeLetter([QUESTION])
    server.use(
      http.post('/api/cover-letters/:id/items/:itemId/recommendations', () =>
        HttpResponse.json({
          item: {
            ...letter.items[0],
            recommendations: [{ experienceId: expId(CAPSTONE), reason: '맞아요' }],
          },
        }),
      ),
    )
    const user = userEvent.setup()
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[0].id}`, { loggedIn: true })
    const others = await screen.findByRole('region', { name: '다른 카드' }, AI_WAIT)
    const toggle = within(others).getByRole('button', { name: HACKATHON })
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '이 문항 만들기' })).toBeEnabled()
    await user.click(within(others).getByRole('button', { name: '사실 보기' }))
    expect(
      within(others).getByText('5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다'),
    ).toBeInTheDocument()
    expect(within(others).getByRole('link', { name: '이 카드 보강하기' })).toHaveAttribute(
      'href',
      `/experiences/${expId(HACKATHON)}?returnTo=${encodeURIComponent(
        `/cover-letters/${letter.id}/items/${letter.items[0].id}`,
      )}`,
    )
  })

  it('캡스톤 카드를 켜고 이 문항 만들기 → 응답과 근거 경험 카드가 보인다', async () => {
    const letter = await makeLetter([QUESTION])
    const user = userEvent.setup()
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[0].id}`, { loggedIn: true })
    await user.click(await screen.findByRole('button', { name: CAPSTONE }, AI_WAIT))
    await user.click(screen.getByRole('button', { name: '이 문항 만들기' }))
    const answer = (await screen.findByLabelText('응답', {}, AI_WAIT)) as HTMLTextAreaElement
    expect(answer.value).toContain('백엔드와 공지 크롤러를 맡았다')
    expect(answer.value).not.toContain('40%')
    const used = screen.getByRole('region', { name: '근거 경험 카드' })
    expect(within(used).getByText(CAPSTONE)).toBeInTheDocument()
    expect(within(used).queryByText(HACKATHON)).not.toBeInTheDocument()
    expect(screen.getByText('응답 1 / 문항 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '자소서 보기' })).toHaveAttribute(
      'href',
      `/cover-letters/${letter.id}`,
    )
  })

  it('다른 문항에서 고른 카드에 문항 1에 사용 중이 보이고, 문항 번호로 옮겨 간다', async () => {
    const letter = await makeLetter([QUESTION, '협업 경험을 쓰시오'])
    await api.selectExperiences(letter.id, letter.items[0].id, [expId(CAPSTONE)])
    const user = userEvent.setup()
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[1].id}`, { loggedIn: true })
    expect(await screen.findByText('문항 1에 사용 중', {}, AI_WAIT)).toBeInTheDocument()
    expect(screen.getByText('팀장으로 범위를 정한 경험이 문항과 맞아요')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '문항 1' }))
    expect(await screen.findByText(QUESTION)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: CAPSTONE }, AI_WAIT)).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('응답을 고쳐 저장한 뒤 이 문항 만들기 → 확인창에서 바꾸기를 눌러야 바뀐다', async () => {
    const letter = await makeLetter([QUESTION])
    const user = userEvent.setup()
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[0].id}`, { loggedIn: true })
    await user.click(await screen.findByRole('button', { name: CAPSTONE }, AI_WAIT))
    await user.click(screen.getByRole('button', { name: '이 문항 만들기' }))
    const answer = await screen.findByLabelText('응답', {}, AI_WAIT)
    const generated = (answer as HTMLTextAreaElement).value
    await user.clear(answer)
    await user.type(answer, '내가 고친 응답')
    await user.click(screen.getByRole('button', { name: '응답 저장' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '응답 저장' })).toBeDisabled())

    await user.click(screen.getByRole('button', { name: '이 문항 만들기' }))
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText('고친 내용이 새 응답으로 바뀌어요. 계속할까요?'),
    ).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('응답')).toHaveValue('내가 고친 응답')

    await user.click(screen.getByRole('button', { name: '이 문항 만들기' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '바꾸기' }))
    await waitFor(() => expect(screen.getByLabelText('응답')).toHaveValue(generated), AI_WAIT)
  })

  it('AI 호출에 실패하면 안내와 다시 시도가 보이고, 다시 시도로 추천을 다시 부른다', async () => {
    const letter = await makeLetter([QUESTION])
    server.use(
      http.post(
        '/api/cover-letters/:id/items/:itemId/recommendations',
        () =>
          HttpResponse.json({ error: { code: 'AI_UNAVAILABLE', message: 'x' } }, { status: 502 }),
        { once: true },
      ),
    )
    const user = userEvent.setup()
    renderApp(`/cover-letters/${letter.id}/items/${letter.items[0].id}`, { loggedIn: true })
    expect(await screen.findByText('AI 호출에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('button', { name: CAPSTONE }, AI_WAIT)).toBeInTheDocument()
  })

  it('S5: 새로 쓰기 → 입력 → 작성 시작 → 캡스톤 카드 켜기 → 이 문항 만들기 → 응답과 근거 카드', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters', { loggedIn: true })
    await user.click(await screen.findByRole('link', { name: '새로 쓰기' }))
    await user.type(
      await screen.findByLabelText('우대사항'),
      'REST API 설계 경험, 협업 도구 사용 경험',
    )
    await user.type(screen.getByLabelText('인재상'), '문제를 끝까지 파고드는 사람')
    await user.type(screen.getByLabelText('문항 1'), QUESTION)
    await user.click(screen.getByRole('button', { name: '작성 시작' }))
    expect(await screen.findByRole('heading', { name: QUESTION })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: CAPSTONE }, AI_WAIT))
    await user.click(screen.getByRole('button', { name: '이 문항 만들기' }))
    expect(await screen.findByLabelText('응답', {}, AI_WAIT)).not.toHaveValue('')
    const used = screen.getByRole('region', { name: '근거 경험 카드' })
    expect(within(used).getByText(CAPSTONE)).toBeInTheDocument()
    // 시드의 작성한 자소서(라라테크)는 빼고, 이 흐름에서 새로 생긴 것만 센다.
    expect(
      getDb().coverLetters.filter((c) => c.kind === 'generated' && !c.id.startsWith('seed-')),
    ).toHaveLength(1)
  }, 10000)
})
