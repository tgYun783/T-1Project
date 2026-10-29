import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { getDb } from '@/mocks/db'
import { server } from '@/test/setup'
import { renderApp } from '@/test/render'

const NEW_LINE = '- 오픈소스 기여 「번역 문서 개선」 (2024년 겨울, 개인)'

describe('이력서 입력', () => {
  it('시드 이력서 글과 확인할 활동이 보인다', async () => {
    renderApp('/resume', { loggedIn: true })
    const box = await screen.findByLabelText('이력서')
    expect((box as HTMLTextAreaElement).value).toContain('프로그래밍 동아리 운영진')
    expect(screen.getByText('다시 붙여넣으면 새로 나온 활동만 목록에 더해요.')).toBeInTheDocument()
    const drafts = screen.getByRole('heading', { name: '확인할 활동' }).parentElement!
    expect(within(drafts).getByText('프로그래밍 동아리 운영진')).toBeInTheDocument()
    expect(within(drafts).getByText('2024년')).toBeInTheDocument()
  })

  it('이력서를 붙여넣고 활동 나누기를 누르면 새 활동만 더해진다', async () => {
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    const box = await screen.findByLabelText('이력서')
    await user.type(box, `{Enter}${NEW_LINE}`)
    await user.click(screen.getByRole('button', { name: '활동 나누기' }))
    expect(await screen.findByText('오픈소스 기여 번역 문서 개선')).toBeInTheDocument()
    expect(screen.getAllByText('프로그래밍 동아리 운영진')).toHaveLength(1)
  })

  it('이력서가 비면 활동 나누기가 잠긴다', async () => {
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    await user.clear(await screen.findByLabelText('이력서'))
    expect(screen.getByRole('button', { name: '활동 나누기' })).toBeDisabled()
  })

  it('AI 실패면 다시 시도가 보이고 활동 직접 추가는 그대로 쓸 수 있다', async () => {
    server.use(
      http.post('/api/resume', () =>
        HttpResponse.json({ error: { code: 'AI_UNAVAILABLE', message: 'x' } }, { status: 502 }),
      ),
    )
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '활동 나누기' }))
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '활동 직접 추가' }))
    await user.type(screen.getByLabelText('활동 이름'), '직접 쓴 활동')
    await user.click(screen.getByRole('button', { name: '목록에 추가' }))
    expect(await screen.findByText('직접 쓴 활동')).toBeInTheDocument()
  })

  it('활동 이름이 비면 필수 입력이에요가 보인다', async () => {
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '활동 직접 추가' }))
    await user.click(screen.getByRole('button', { name: '목록에 추가' }))
    expect(screen.getByText('필수 입력이에요.')).toBeInTheDocument()
  })

  it('고치기로 시기를 바꾸고 빼기로 활동을 지운다', async () => {
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '고치기' }))
    const period = screen.getByLabelText('대략적 시기')
    await user.clear(period)
    await user.type(period, '2023년')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('2023년')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '빼기' }))
    expect(await screen.findByText('확인할 활동이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '경험 만들기' })).toBeDisabled()
  })

  it('경험 만들기를 누르면 경험이 생기고 첫 경험 상세로 간다', async () => {
    renderApp('/resume', { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '경험 만들기' }))
    expect(
      await screen.findByRole('heading', { name: '프로그래밍 동아리 운영진' }),
    ).toBeInTheDocument()
    expect(getDb().experiences.some((e) => e.title === '프로그래밍 동아리 운영진')).toBe(true)
  })
})

describe('경험 상세 왼쪽 활동 목록', () => {
  it('모든 경험이 보이고 누르면 그 경험으로 이동한다', async () => {
    const id = getDb().experiences[0].id
    renderApp(`/experiences/${id}`, { loggedIn: true })
    const user = userEvent.setup()
    const nav = await screen.findByRole('navigation', { name: '활동 목록' })
    await waitFor(() => expect(within(nav).getAllByRole('link')).toHaveLength(3))
    expect(within(nav).getByRole('link', { name: '이력서에서 활동 추가' })).toHaveAttribute(
      'href',
      '/resume',
    )
    await user.click(within(nav).getByRole('link', { name: '교내 해커톤 동아리 회비 정산 웹' }))
    expect(
      await screen.findByRole('heading', { name: '교내 해커톤 동아리 회비 정산 웹' }),
    ).toBeInTheDocument()
  })
})
