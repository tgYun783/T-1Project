import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test/render'

describe('홈', () => {
  it('시드 계정은 새로 쓰기와 시드 자소서가 보인다', async () => {
    renderApp('/cover-letters', { loggedIn: true })
    expect(await screen.findByRole('link', { name: '새로 쓰기' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '쓴 자소서 붙여넣기' })).toBeInTheDocument()
    expect(screen.getByText('가나다소프트 백엔드 지원')).toBeInTheDocument()
    expect(screen.getByText(/붙여넣음/)).toBeInTheDocument()
  })

  it('S1: 소개 → 가입 → 잠금 안내와 이력서 입력', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getAllByRole('link', { name: '가입하기' })[0])
    await user.type(screen.getByLabelText('이메일'), 'fresh@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'freshpassword1')
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    expect(
      await screen.findByText('경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이력서 입력' })).toHaveAttribute('href', '/resume')
    expect(screen.queryByRole('link', { name: '새로 쓰기' })).not.toBeInTheDocument()
  })
})
