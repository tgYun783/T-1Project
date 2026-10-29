import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { CoverLetter } from '@/api/types'
import { Meter } from '@/components/Meter'
import { ErrorView, Loading } from '@/components/States'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { isUnlocked } from '@/lib/cards'
import { formatDate } from '@/lib/format'
import { useLoad } from '@/lib/useLoad'

// 행 전체가 링크다. 제목은 이름표 크기로 두어 화면의 큰 제목과 겨루지 않는다(POLISH H1·H5).
function LetterRow({ letter }: { letter: CoverLetter }) {
  const generated = letter.kind === 'generated'
  const answered = letter.items.filter((item) => item.answer).length
  return (
    <li>
      <Link
        to={`/cover-letters/${letter.id}`}
        className="rounded-row bg-fill row-select focus-visible:outline-ink grid gap-2 px-4 py-3.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[17px] font-semibold tracking-[-0.02em]">
            {letter.title || '제목 없음'}
          </span>
          <span className="meta">{formatDate(letter.updatedAt)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="chip">{generated ? '작성함' : '붙여넣음'}</span>
          {generated && (
            <>
              <span className="meta">{`응답 ${answered} / 문항 ${letter.items.length}`}</span>
              <div className="w-24">
                <Meter cells={letter.items.map((item) => Boolean(item.answer))} />
              </div>
            </>
          )}
        </div>
      </Link>
    </li>
  )
}

export default function Home() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { experiences } = await api.listExperiences()
    if (!isUnlocked(experiences)) return { experiences, letters: [] as CoverLetter[] }
    const { coverLetters } = await api.listCoverLetters()
    return { experiences, letters: coverLetters }
  })

  if (loading) {
    return (
      <main className="wrap pt-12">
        <Loading />
      </main>
    )
  }
  if (error || !data) {
    return (
      <main className="wrap pt-12">
        <ErrorView message={error?.message ?? '불러오지 못했어요.'} onRetry={reload} />
      </main>
    )
  }

  // 잠긴 상태: 안내 한 문장이 주인공. 카드 하나를 본문 폭(640px)으로 둔다(POLISH D5).
  if (!isUnlocked(data.experiences)) {
    return (
      <main className="wrap py-12">
        <StageBlock stage="experience" className="max-w-[640px] gap-5 p-7">
          <StageChip stage="experience" />
          <p className="page-title">
            경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/resume" className="btn btn-primary">
              이력서 입력
            </Link>
            {data.experiences.length > 0 && (
              <Link to="/experiences" className="btn btn-secondary">
                경험 카드 확정하러 가기
              </Link>
            )}
          </div>
        </StageBlock>
      </main>
    )
  }

  return (
    <main className="wrap grid gap-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid justify-items-start gap-2">
          <StageChip stage="coverLetter" />
          <h1 className="page-title md:text-[36px]">내 자소서</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/cover-letters/paste" className="btn btn-secondary">
            쓴 자소서 붙여넣기
          </Link>
          <Link to="/cover-letters/new" className="btn btn-primary">
            새로 쓰기
          </Link>
        </div>
      </div>

      <StageBlock stage="coverLetter" className="max-w-[880px]">
        <div className="card-head">
          <h2 className="text-[17px] font-semibold">최근 수정순</h2>
          <span className="meta">{data.letters.length}개</span>
        </div>
        {data.letters.length === 0 ? (
          <div className="row-pending rounded-row px-4 py-5">
            <p className="text-[15px]">아직 자소서가 없어요</p>
          </div>
        ) : (
          <ul className="grid gap-2.5">
            {data.letters.map((letter) => (
              <LetterRow key={letter.id} letter={letter} />
            ))}
          </ul>
        )}
      </StageBlock>
    </main>
  )
}
