import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/context'
import { StageBlock, type Stage } from '@/components/StageBlock'

const STEPS: { stage: Stage; title: string; text: string }[] = [
  { stage: 'experience', title: '1 경험 꺼내기', text: '대화로 경험을 풀어 쓰고 사실로 확정해요.' },
  {
    stage: 'coverLetter',
    title: '2 자소서 쓰기',
    text: '확정한 경험 카드로 문항마다 초안을 만들어요.',
  },
  {
    stage: 'check',
    title: '3 제출 전 점검',
    text: '주장 문장마다 근거를 묻고 설명할 수 있는지 봐요.',
  },
]

export default function Intro() {
  const { user } = useAuth()
  if (user) return <Navigate to="/cover-letters" replace />

  return (
    <main className="wrap grid gap-4 pt-12">
      <h1 className="display">
        경험을 대화로 꺼내 사실을 확정하고, 제출 전에 자소서의 주장 문장마다 근거를 물어 설명할 수
        있는지 점검해요.
      </h1>
      <div className="grid gap-4 md:grid-cols-3">
        {STEPS.map(({ stage, title, text }) => (
          <StageBlock key={stage} stage={stage} className="min-h-[200px] justify-between">
            <h2 className="h2">{title}</h2>
            <p>{text}</p>
          </StageBlock>
        ))}
      </div>
      <section className="block-card bg-coral min-h-[200px] justify-end">
        <div className="flex flex-wrap gap-3">
          <Link to="/signup" className="btn btn-primary">
            가입하기
          </Link>
          <Link to="/login" className="btn btn-secondary">
            로그인
          </Link>
        </div>
      </section>
    </main>
  )
}
