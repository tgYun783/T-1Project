import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { getDb } from '@/mocks/db'
import { server } from '@/test/setup'
import { renderApp } from '@/test/render'

function expId(title: string) {
  const found = getDb().experiences.find((e) => e.title === title)
  if (!found) throw new Error('시드 경험이 없어요')
  return found.id
}

describe('경험 상세', () => {
  it('대화가 없는 경험에 들어오면 첫 질문이 보인다', async () => {
    renderApp(`/experiences/${expId('교내 해커톤 동아리 회비 정산 웹')}`, { loggedIn: true })
    expect(
      await screen.findByText('이 경험에서 해결하려던 문제는 무엇이었나요?'),
    ).toBeInTheDocument()
    expect(screen.getAllByText('아직 묻지 않음').length).toBeGreaterThan(0)
  })

  it('답변을 보내면 답과 다음 질문이 보이고 항목 상태가 바뀐다', async () => {
    renderApp(`/experiences/${expId('교내 해커톤 동아리 회비 정산 웹')}`, { loggedIn: true })
    const user = userEvent.setup()
    await screen.findByText('이 경험에서 해결하려던 문제는 무엇이었나요?')
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    await user.type(screen.getByLabelText('답변'), '동아리 회비 정산이 엉망이었다')
    await user.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByText('그때 본인이 맡은 역할은 무엇이었나요?')).toBeInTheDocument()
    expect(
      within(screen.getByRole('list', { name: '대화 내용' })).getByText(
        '동아리 회비 정산이 엉망이었다',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('설명됨')).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toHaveValue('')
  })

  it('AI 실패면 다시 시도가 보이고 답변이 남는다', async () => {
    renderApp(`/experiences/${expId('캡스톤디자인 학과 공지 알림 앱')}`, { loggedIn: true })
    const user = userEvent.setup()
    await screen.findByRole('heading', { name: '상황' })
    server.use(
      http.post('/api/experiences/:id/conversation/answers', () =>
        HttpResponse.json({ error: { code: 'AI_UNAVAILABLE', message: 'x' } }, { status: 502 }),
      ),
    )
    await user.type(await screen.findByLabelText('답변'), '의미는 이렇다')
    await user.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByLabelText('답변')).toHaveValue('의미는 이렇다')
  })

  it('수정으로 제목을 바꿔 저장한다', async () => {
    renderApp(`/experiences/${expId('캡스톤디자인 학과 공지 알림 앱')}`, { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '수정' }))
    const title = screen.getByLabelText('제목')
    await user.clear(title)
    await user.type(title, '바뀐 제목')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('heading', { name: '바뀐 제목' })).toBeInTheDocument()
    await waitFor(() => expect(getDb().experiences.some((e) => e.title === '바뀐 제목')).toBe(true))
  })

  it('returnTo가 있으면 문항으로 돌아가기가 보인다', async () => {
    renderApp(
      `/experiences/${expId('캡스톤디자인 학과 공지 알림 앱')}?returnTo=/cover-letters/c1/items/i1`,
      { loggedIn: true },
    )
    expect(await screen.findByRole('link', { name: '문항으로 돌아가기' })).toHaveAttribute(
      'href',
      '/cover-letters/c1/items/i1',
    )
  })
})
