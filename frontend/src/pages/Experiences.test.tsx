import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDb } from '@/mocks/db'
import { renderApp } from '@/test/render'

describe('경험 목록', () => {
  it('시드 경험 두 개와 항목 칸이 보인다', async () => {
    renderApp('/experiences', { loggedIn: true })
    expect(await screen.findByText('캡스톤디자인 학과 공지 알림 앱')).toBeInTheDocument()
    expect(screen.getByText('교내 해커톤 동아리 회비 정산 웹')).toBeInTheDocument()
    expect(screen.getAllByText('상황')).toHaveLength(2)
    expect(screen.getByRole('link', { name: '이력서에서 활동 추가' })).toHaveAttribute(
      'href',
      '/resume',
    )
  })

  it('경험이 없으면 점선 행과 이력서 입력 버튼이 보인다', async () => {
    getDb().experiences = []
    renderApp('/experiences', { loggedIn: true })
    expect(await screen.findByText('아직 경험이 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '이력서 입력' })).toHaveAttribute('href', '/resume')
  })

  it('경험 제목을 누르면 경험 상세가 열린다', async () => {
    renderApp('/experiences', { loggedIn: true })
    const user = userEvent.setup()
    await user.click(await screen.findByRole('link', { name: '교내 해커톤 동아리 회비 정산 웹' }))
    expect(
      await screen.findByRole('heading', { name: '교내 해커톤 동아리 회비 정산 웹' }),
    ).toBeInTheDocument()
    // 대화가 없는 경험이라 첫 질문까지 기다려야 테스트가 끝난 뒤 상태 갱신이 남지 않는다.
    expect(
      await screen.findByText('이 경험에서 해결하려던 문제는 무엇이었나요?'),
    ).toBeInTheDocument()
    expect(screen.queryByText('없는 페이지예요')).not.toBeInTheDocument()
  })
})
