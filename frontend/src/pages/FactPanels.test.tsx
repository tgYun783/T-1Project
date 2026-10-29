import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { getDb } from '@/mocks/db'
import { renderApp } from '@/test/render'

function expId(title: string) {
  const found = getDb().experiences.find((e) => e.title === title)
  if (!found) throw new Error('시드 경험이 없어요')
  return found.id
}

describe('사실 후보·경험 카드', () => {
  it('후보를 내가 말함으로 카드에 넣으면 카드에 보이고 후보에서 빠진다', async () => {
    renderApp(`/experiences/${expId('캡스톤디자인 학과 공지 알림 앱')}`, { loggedIn: true })
    const user = userEvent.setup()
    const text = '반복되는 불편을 자동화로 줄이는 데 관심이 생겼다'
    expect(await screen.findByText(text)).toBeInTheDocument()
    expect(screen.getByText('AI 제안·미확인')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '확정' }))
    expect(screen.getByLabelText('내용')).toHaveValue(text)
    await user.click(screen.getByRole('radio', { name: '내가 말함' }))
    await user.click(screen.getByRole('button', { name: '카드에 넣기' }))
    const meaning = await screen.findByRole('region', { name: '카드 의의' })
    expect(within(meaning).getByText(text)).toBeInTheDocument()
    expect(screen.getByText('확인할 사실이 없어요')).toBeInTheDocument()
  })

  it('후보를 버리면 후보에서 빠진다', async () => {
    renderApp(`/experiences/${expId('캡스톤디자인 학과 공지 알림 앱')}`, { loggedIn: true })
    const user = userEvent.setup()
    await screen.findByText('AI 제안·미확인')
    await user.click(screen.getByRole('button', { name: '버리기' }))
    expect(await screen.findByText('확인할 사실이 없어요')).toBeInTheDocument()
  })

  it('직접 추가로 넣은 사실을 고치고 지울 수 있다', async () => {
    renderApp(`/experiences/${expId('교내 해커톤 동아리 회비 정산 웹')}`, { loggedIn: true })
    const user = userEvent.setup()
    await screen.findByText('확인할 사실이 없어요')
    await user.click(screen.getByRole('button', { name: '직접 추가' }))
    await user.selectOptions(screen.getByLabelText('항목'), '상황')
    await user.type(screen.getByLabelText('내용'), '회비 정산이 엑셀로만 돼 있었다')
    await user.click(screen.getByRole('radio', { name: '내가 말함' }))
    await user.click(screen.getByRole('button', { name: '카드에 추가' }))
    const situation = await screen.findByRole('region', { name: '카드 상황' })
    expect(within(situation).getByText('회비 정산이 엑셀로만 돼 있었다')).toBeInTheDocument()

    await user.click(within(situation).getByRole('button', { name: '고치기' }))
    const field = screen.getByLabelText('내용')
    await user.clear(field)
    await user.type(field, '정산이 수작업이었다')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await within(situation).findByText('정산이 수작업이었다')).toBeInTheDocument()

    await user.click(within(situation).getByRole('button', { name: '지우기' }))
    expect(await within(situation).findByText('비어 있음')).toBeInTheDocument()
  })

  it('S2: 가입 → 이력서 입력 → 경험 만들기 → 직접 추가 → 카드에 추가 → 자소서에서 새로 쓰기', async () => {
    const user = userEvent.setup()
    renderApp('/signup')
    await user.type(screen.getByLabelText('이메일'), 's2@example.com')
    await user.type(screen.getByLabelText('비밀번호'), 'freshpassword1')
    await user.click(screen.getByRole('button', { name: '가입하기' }))
    await user.click(await screen.findByRole('link', { name: '이력서 입력' }))
    await user.click(await screen.findByRole('button', { name: '활동 직접 추가' }))
    await user.type(screen.getByLabelText('활동 이름'), '내 프로젝트')
    await user.type(screen.getByLabelText('대략적 시기'), '2025년 여름')
    await user.click(screen.getByRole('button', { name: '목록에 추가' }))
    await user.click(await screen.findByRole('button', { name: '경험 만들기' }))
    await user.click(await screen.findByRole('button', { name: '직접 추가' }))
    await user.selectOptions(screen.getByLabelText('항목'), '역할')
    await user.type(screen.getByLabelText('내용'), '백엔드를 맡았다')
    await user.click(screen.getByRole('radio', { name: '내가 말함' }))
    await user.click(screen.getByRole('button', { name: '카드에 추가' }))
    const role = await screen.findByRole('region', { name: '카드 역할' })
    expect(within(role).getByText('백엔드를 맡았다')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: '자소서' }))
    expect(await screen.findByRole('link', { name: '새로 쓰기' })).toBeInTheDocument()
  })
})
