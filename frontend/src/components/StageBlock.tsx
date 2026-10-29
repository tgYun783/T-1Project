import type { ReactNode } from 'react'
import { STAGES, type Stage } from '@/lib/stages'

/** 단계 칩: 화면이 흐름의 몇 번째 단계인지 보여 준다. */
export function StageChip({ stage }: { stage: Stage }) {
  return <span className={`stage-chip ${STAGES[stage].bg}`}>{STAGES[stage].name}</span>
}

/** 단계 화면 안의 한 구역(흰 카드). */
export function StageBlock({
  stage,
  children,
  className = '',
}: {
  stage: Stage
  children: ReactNode
  className?: string
}) {
  return (
    <section data-stage={stage} className={`card ${className}`}>
      {children}
    </section>
  )
}
