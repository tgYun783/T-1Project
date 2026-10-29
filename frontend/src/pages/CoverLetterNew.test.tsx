import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp } from '@/test/render'

describe('H 작성 시작', () => {
  it('필수 칸이 비면 안내가 보이고, 문항 추가·빼기가 된다', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters/new', { loggedIn: true })
    await screen.findByLabelText('문항 1')
    expect(screen.queryByRole('button', { name: '빼기' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '작성 시작' }))
    expect(screen.getAllByText('필수 입력이에요.')).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: '문항 추가' }))
    expect(screen.getByLabelText('문항 2')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: '빼기' })[1])
    expect(screen.queryByLabelText('문항 2')).not.toBeInTheDocument()
  })

  it('입력 후 작성 시작하면 문항별 작성 주소로 간다', async () => {
    const user = userEvent.setup()
    renderApp('/cover-letters/new', { loggedIn: true })
    await user.type(await screen.findByLabelText('우대사항'), '백엔드 경험')
    await user.type(screen.getByLabelText('인재상'), '협업하는 사람')
    await user.type(screen.getByLabelText('문항 1'), '협업 경험을 쓰세요')
    await user.click(screen.getByRole('button', { name: '작성 시작' }))
    expect(await screen.findByRole('heading', { name: '협업 경험을 쓰세요' })).toBeInTheDocument()
  })
})
