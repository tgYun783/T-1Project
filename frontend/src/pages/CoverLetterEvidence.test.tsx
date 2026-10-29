import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test/render'

// 시드 작성 자소서(라라테크 백엔드 지원): 문항 1 응답은 캡스톤·해커톤 카드 사실로 쓴 글이다.
const LETTER = '/cover-letters/seed-cl-2'
const CAPSTONE = '캡스톤디자인 학과 공지 알림 앱'
const HACKATHON = '교내 해커톤 동아리 회비 정산 웹'

function card(title: string) {
  return screen.getByRole('heading', { name: title }).closest('article') as HTMLElement
}

describe('J 작성함: 응답 문장과 근거 카드 짝', () => {
  it('오른쪽에 응답에 쓴 경험 카드를 세로로 두고, 처음에는 첫 문장의 근거 카드를 강조한다', async () => {
    renderApp(LETTER, { loggedIn: true })
    await screen.findByRole('heading', { name: '근거 경험 카드' })
    expect(card(CAPSTONE)).toHaveAttribute('aria-current', 'true')
    expect(card(HACKATHON)).not.toHaveAttribute('aria-current')
    const marked = card(CAPSTONE).querySelector('mark')
    expect(marked).toHaveTextContent('학과 공지가 홈페이지에만 올라와')
  })

  it('응답 문장을 누르면 그 문장의 근거 사실이 있는 카드가 강조되고 사실이 칠해진다', async () => {
    const user = userEvent.setup()
    renderApp(LETTER, { loggedIn: true })
    const sentence = await screen.findByRole('button', { name: /48시간 안에 시연까지 마쳤습니다/ })
    await user.click(sentence)
    expect(sentence).toHaveAttribute('aria-pressed', 'true')
    expect(card(HACKATHON)).toHaveAttribute('aria-current', 'true')
    expect(card(CAPSTONE)).not.toHaveAttribute('aria-current')
    const marks = [...card(HACKATHON).querySelectorAll('mark')].map((m) => m.textContent)
    expect(marks).toContain('5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다')
    expect(sentence.querySelector('mark')).not.toBeNull()
  })
})
