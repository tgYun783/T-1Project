import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '@/App'
import { api, setToken } from '@/api/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { getDb, tokenFor } from '@/mocks/db'
import { renderApp } from '@/test/render'

const CAPSTONE = '캡스톤디자인 학과 공지 알림 앱'
const AI_WAIT = { timeout: 4000 }

function seedLetterId() {
  return getDb().coverLetters[0].id
}

function Probe() {
  return <p data-testid="path">{useLocation().pathname}</p>
}

describe('J 자소서 상세', () => {
  it('붙여넣음: 본문을 고쳐 저장하고, 비우면 안내가 보인다', async () => {
    const user = userEvent.setup()
    renderApp(`/cover-letters/${seedLetterId()}`, { loggedIn: true })
    const body = await screen.findByLabelText('본문')
    expect((body as HTMLTextAreaElement).value).toContain('공지 확인율을 40% 높였고')
    await user.clear(body)
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByText('본문을 입력해 주세요.')).toBeInTheDocument()
    await user.type(body, '고친 본문입니다.')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('저장했어요.')
    const { coverLetter } = await api.getCoverLetter(seedLetterId())
    expect(coverLetter.body).toBe('고친 본문입니다.')
    expect(screen.getByText('자소서를 고치면 지난 점검은 오래됨으로 바뀌어요.')).toBeInTheDocument()
  })

  it('S6 입구: 제출 전 점검 시작을 누르면 점검 화면 주소로 간다', async () => {
    const user = userEvent.setup()
    setToken(tokenFor(getDb().users[0].id))
    render(
      <MemoryRouter initialEntries={[`/cover-letters/${seedLetterId()}`]}>
        <AuthProvider>
          <Probe />
          <App />
        </AuthProvider>
      </MemoryRouter>,
    )
    await user.click(await screen.findByRole('button', { name: '제출 전 점검 시작' }))
    await waitFor(
      () => expect(screen.getByTestId('path')).toHaveTextContent(/^\/checks\//),
      AI_WAIT,
    )
  })

  it('지난 점검이 끝난 문장 수와 함께 보이고, 자소서를 고치면 오래됨이 된다', async () => {
    setToken(tokenFor(getDb().users[0].id))
    await api.createCheck(seedLetterId())
    const { unmount } = renderApp(`/cover-letters/${seedLetterId()}`, { loggedIn: true })
    const past = await screen.findByRole('link', { name: /끝난 문장 0 \/ 전체 4/ })
    expect(within(past).queryByText('오래됨')).not.toBeInTheDocument()
    unmount()
    await api.updateCoverLetter(seedLetterId(), { body: '바뀐 본문' })
    renderApp(`/cover-letters/${seedLetterId()}`, { loggedIn: true })
    const stale = await screen.findByRole('link', { name: /끝난 문장 0 \/ 전체 4/ })
    expect(within(stale).getByText('오래됨')).toBeInTheDocument()
  })

  it('작성함: 응답 없는 문항은 이 문항 쓰기, 응답 있는 문항은 근거 카드와 보강하기가 보인다', async () => {
    setToken(tokenFor(getDb().users[0].id))
    const capstone = getDb().experiences.find((e) => e.title === CAPSTONE)!
    const { coverLetter } = await api.generateCoverLetter({
      preferred: 'REST API 설계 경험',
      talent: '끝까지 파고드는 사람',
      questions: ['첫째 문항', '둘째 문항'],
    })
    const [first] = coverLetter.items
    await api.recommend(coverLetter.id, first.id)
    await api.selectExperiences(coverLetter.id, first.id, [capstone.id])
    await api.makeAnswer(coverLetter.id, first.id)
    renderApp(`/cover-letters/${coverLetter.id}`, { loggedIn: true })
    expect(await screen.findByText('첫째 문항')).toBeInTheDocument()
    expect(screen.getByText('아직 만들지 않음')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이 문항 쓰기' })).toHaveAttribute(
      'href',
      `/cover-letters/${coverLetter.id}/items/${coverLetter.items[1].id}`,
    )
    expect(screen.getByText(CAPSTONE)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '보강하기' })).toHaveAttribute(
      'href',
      `/experiences/${capstone.id}?returnTo=${encodeURIComponent(
        `/cover-letters/${coverLetter.id}/items/${first.id}`,
      )}`,
    )
    expect(screen.getByRole('link', { name: '카드 다시 고르기' })).toBeInTheDocument()
  })
})
