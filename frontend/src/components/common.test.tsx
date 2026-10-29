import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, ApiError, getToken } from '@/api/client'
import { AuthProvider } from '@/auth/AuthProvider'
import { AiStatus } from '@/components/AiStatus'
import { RequireAuth, RequireUnlocked } from '@/components/guards'
import Layout from '@/components/Layout'
import { StatusRow } from '@/components/Status'
import { useAiCall } from '@/lib/useAiCall'
import { renderApp } from '@/test/render'
import { server } from '@/test/setup'

// 화면이 아직 없는 주소는 글자만 있는 자리 표시로 대신해 보호 규칙만 본다.
function renderGuarded(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/login" element={<p>로그인 화면</p>} />
            <Route path="/cover-letters" element={<p>홈 잠금 안내</p>} />
            <Route element={<RequireAuth />}>
              <Route path="/experiences" element={<p>경험 목록 화면</p>} />
              <Route element={<RequireUnlocked />}>
                <Route path="/cover-letters/paste" element={<p>붙여넣기 화면</p>} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('로그인 보호', () => {
  it('로그인 안 한 채 /experiences면 로그인 화면으로 간다', async () => {
    renderGuarded('/experiences')
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
    expect(screen.queryByText('경험 목록 화면')).not.toBeInTheDocument()
  })

  it('로그인했으면 보호된 화면이 열린다', async () => {
    await api.login('seeker@example.com', 'loopthon-2026')
    renderGuarded('/experiences')
    expect(await screen.findByText('경험 목록 화면')).toBeInTheDocument()
  })

  it('API가 401을 주면 토큰이 지워지고 로그인 화면으로 간다', async () => {
    await api.login('seeker@example.com', 'loopthon-2026')
    renderGuarded('/experiences')
    await screen.findByText('경험 목록 화면')
    await expect(
      (server.use(
        http.get('/api/experiences', () =>
          HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'x' } }, { status: 401 }),
        ),
      ),
      api.listExperiences()),
    ).rejects.toBeInstanceOf(ApiError)
    expect(getToken()).toBeNull()
    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
  })
})

describe('자소서 잠금', () => {
  it('확정 카드가 없는 계정은 /cover-letters/paste에서 홈으로 간다', async () => {
    await api.signup('new@example.com', 'password-1234')
    renderGuarded('/cover-letters/paste')
    expect(await screen.findByText('홈 잠금 안내')).toBeInTheDocument()
    expect(screen.queryByText('붙여넣기 화면')).not.toBeInTheDocument()
  })

  it('확정 카드가 있는 계정은 /cover-letters/paste가 열린다', async () => {
    await api.login('seeker@example.com', 'loopthon-2026')
    renderGuarded('/cover-letters/paste')
    expect(await screen.findByText('붙여넣기 화면')).toBeInTheDocument()
  })
})

describe('헤더', () => {
  it('로그인 전에는 로그인·가입하기가 보인다', async () => {
    renderApp('/nope')
    expect(await screen.findByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '가입하기' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })

  it('로그인 후에는 자소서·경험 메뉴와 로그아웃이 보이고, 로그아웃하면 토큰이 지워진다', async () => {
    renderApp('/nope', { loggedIn: true })
    const header = within(await screen.findByRole('banner'))
    expect(await header.findByRole('link', { name: '자소서' })).toHaveAttribute(
      'href',
      '/cover-letters',
    )
    expect(header.getByRole('link', { name: '경험' })).toHaveAttribute('href', '/experiences')
    await userEvent.click(header.getByRole('button', { name: '로그아웃' }))
    expect(getToken()).toBeNull()
    expect(
      await within(screen.getByRole('banner')).findByRole('link', { name: '로그인' }),
    ).toBeInTheDocument()
  })
})

function AiProbe({ fail }: { fail: { current: boolean } }) {
  const { busy, failed, error, run, retry } = useAiCall()
  const call = async () => {
    if (fail.current) throw new ApiError(502, 'AI_UNAVAILABLE', 'x')
    return '완료'
  }
  return (
    <div>
      <button type="button" disabled={busy} onClick={() => run(call)}>
        실행
      </button>
      <AiStatus busy={busy} failed={failed} error={error} onRetry={retry} />
    </div>
  )
}

describe('AI 호출 표시', () => {
  it('502면 실패 안내와 다시 시도가 보이고, 다시 시도하면 같은 요청을 다시 보낸다', async () => {
    const fail = { current: true }
    render(<AiProbe fail={fail} />)
    await userEvent.click(screen.getByRole('button', { name: '실행' }))
    expect(await screen.findByText('AI 호출에 실패했어요. 다시 시도해 주세요.')).toBeInTheDocument()
    fail.current = false
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(screen.queryByText(/AI 호출에 실패했어요/)).not.toBeInTheDocument())
  })

  it('진행 중에는 버튼이 잠기고 AI가 생각하는 중이에요가 보인다', async () => {
    let finish: () => void = () => {}
    function Slow() {
      const { busy, failed, error, run, retry } = useAiCall()
      return (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => new Promise<void>((resolve) => (finish = resolve)))}
          >
            실행
          </button>
          <AiStatus busy={busy} failed={failed} error={error} onRetry={retry} />
        </div>
      )
    }
    render(<Slow />)
    await userEvent.click(screen.getByRole('button', { name: '실행' }))
    expect(screen.getByText('AI가 생각하는 중이에요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '실행' })).toBeDisabled()
    finish()
    await waitFor(() =>
      expect(screen.queryByText('AI가 생각하는 중이에요')).not.toBeInTheDocument(),
    )
  })
})

describe('상태 표시', () => {
  it('상태 값마다 정해진 글자를 보여 주고, 아직 안 된 것은 점선 행이다', () => {
    render(
      <>
        <StatusRow kind="explained">상황</StatusRow>
        <StatusRow kind="unasked">역할</StatusRow>
        <StatusRow kind="said">행동</StatusRow>
      </>,
    )
    expect(screen.getByText('설명됨').closest('.row')).not.toHaveClass('row-pending')
    expect(screen.getByText('아직 묻지 않음').closest('.row')).toHaveClass('row-pending')
    expect(screen.getByText('내가 말함').closest('.row')).not.toHaveClass('row-pending')
  })
})
