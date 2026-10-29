import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { Experience } from '@/api/types'
import { Meter } from '@/components/Meter'
import { Empty, ErrorView, Loading } from '@/components/States'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { useLoad } from '@/lib/useLoad'

// 경험마다 흰 카드 하나. 다섯 항목은 진행 막대 + 칩으로 묶는다(POLISH M5).
// 확정 사실이 있는 항목은 흰 칩(초록 점), 없는 항목은 점선 칩(specs/03-experiences.md D).
function ExperienceRow({ experience }: { experience: Experience }) {
  const pending = experience.candidates.length
  const filled = ITEM_ORDER.map((item) => experience.card[item].length > 0)
  return (
    <li className="relative">
      <StageBlock stage="experience" className="row-select h-full">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {/* 제목 링크를 카드 전체로 넓혀 카드 어디를 눌러도 상세로 간다. */}
          <Link
            to={`/experiences/${experience.id}`}
            className="focus-visible:outline-ink rounded-check text-[17px] font-semibold tracking-[-0.02em] outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {experience.title}
          </Link>
          <span className="meta">{experience.period}</span>
        </div>
        <div className="grid gap-2">
          <div className="card-head min-h-7">
            <span className="meta">{`확정 항목 ${filled.filter(Boolean).length} / 5`}</span>
            {pending > 0 && <span className="chip">확인 대기 {pending}</span>}
          </div>
          <Meter cells={filled} />
        </div>
        <ul className="flex flex-wrap gap-2">
          {ITEM_ORDER.map((item, i) => (
            <li key={item} className={`chip ${filled[i] ? 'chip-ok' : 'chip-need'}`}>
              {ITEM_LABELS[item]}
            </li>
          ))}
        </ul>
      </StageBlock>
    </li>
  )
}

export default function Experiences() {
  const { data, error, loading, reload } = useLoad(async () => {
    const { experiences } = await api.listExperiences()
    return experiences
  })

  return (
    <main className="wrap grid gap-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid justify-items-start gap-2">
          <StageChip stage="experience" />
          <h1 className="page-title md:text-[36px]">경험</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {data && data.length > 0 && <span className="meta">{data.length}개</span>}
          <Link to="/resume" className="btn btn-primary">
            이력서에서 활동 추가
          </Link>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorView message={error?.message ?? '불러오지 못했어요.'} onRetry={reload} />
      ) : data.length === 0 ? (
        <div className="max-w-[640px]">
          <Empty text="아직 경험이 없어요" to="/resume" action="이력서 입력" />
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((experience) => (
            <ExperienceRow key={experience.id} experience={experience} />
          ))}
        </ul>
      )}
    </main>
  )
}
