import type { ReactNode } from 'react'
import { CheckMark } from '@/components/CheckMark'
import { STATUS_INFO, type StatusKind } from '@/lib/status'

/** 상태 글자. 설명됨은 초록 체크가 앞에 붙는다. 상태는 항상 글자로도 적는다. */
export function StatusBadge({ kind }: { kind: StatusKind }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {kind === 'explained' && <CheckMark />}
      {STATUS_INFO[kind].label}
    </span>
  )
}

/**
 * 상태 칩: 된 것은 초록 점, 아직 안 된 것은 점선, 지금 묻는 것은 검정(와이어프레임 .chip).
 * 이름(항목 이름 등)과 상태 글자를 함께 적는다. 아직 묻지 않은 항목을 지금 묻는 중이면 그 글자로 바꾼다.
 */
export function StatusChip({
  kind,
  asking = false,
  children,
}: {
  kind: StatusKind
  asking?: boolean
  children?: ReactNode
}) {
  const shape = asking ? 'chip-next' : STATUS_INFO[kind].dashed ? 'chip-need' : 'chip-ok'
  const label = asking && kind === 'unasked' ? '지금 묻는 중' : STATUS_INFO[kind].label
  return (
    <span className={`chip ${shape}`}>
      {children && <span>{children}</span>}
      {children && <span aria-hidden>·</span>}
      <span>{label}</span>
      {asking && kind !== 'unasked' && (
        <>
          <span aria-hidden>·</span>
          <span>지금 묻는 중</span>
        </>
      )}
    </span>
  )
}

/** 상태 행: 아직 안 된 것은 점선 행, 된 것은 흰 행(DESIGN.md 5절). */
export function StatusRow({
  kind,
  children,
  className = '',
}: {
  kind: StatusKind
  children?: ReactNode
  className?: string
}) {
  const dashed = STATUS_INFO[kind].dashed
  return (
    <div className={`row ${dashed ? 'row-pending' : ''} items-center ${className}`}>
      <span>{children}</span>
      <StatusBadge kind={kind} />
    </div>
  )
}
