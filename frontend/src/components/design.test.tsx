import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Meter } from '@/components/Meter'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { StatusChip } from '@/components/Status'

describe('디자인 기반 컴포넌트', () => {
  it('단계 칩은 단계 번호와 이름을 단계 색으로 보여 준다', () => {
    render(<StageChip stage="coverLetter" />)
    expect(screen.getByText('2 자소서 쓰기')).toHaveClass('stage-chip', 'bg-lilac')
  })

  it('단계 구역은 단계 색을 칠하지 않은 흰 카드다', () => {
    render(<StageBlock stage="experience">내용</StageBlock>)
    const block = screen.getByText('내용')
    expect(block).toHaveClass('card')
    expect(block).not.toHaveClass('bg-lime')
  })

  it('상태 칩은 상태 글자와 모양을 같이 바꾼다', () => {
    render(
      <>
        <StatusChip kind="explained">상황</StatusChip>
        <StatusChip kind="needs_more">역할</StatusChip>
        <StatusChip kind="unasked" asking>
          행동
        </StatusChip>
        <StatusChip kind="unknown" asking>
          결과
        </StatusChip>
      </>,
    )
    expect(screen.getByText('설명됨').parentElement).toHaveClass('chip-ok')
    expect(screen.getByText('추가 확인 필요').parentElement).toHaveClass('chip-need')
    // 아직 묻지 않은 항목은 '지금 묻는 중'으로, 상태가 있는 항목은 상태 글자 뒤에 덧붙인다.
    const asking = screen.getAllByText('지금 묻는 중')
    expect(asking).toHaveLength(2)
    asking.forEach((el) => expect(el.parentElement).toHaveClass('chip-next'))
    expect(screen.getByText('모름·경험 없음').parentElement).toHaveClass('chip-next')
    expect(screen.queryByText('아직 묻지 않음')).not.toBeInTheDocument()
  })

  it('진행 막대는 끝난 칸만 채운다', () => {
    const { container } = render(<Meter cells={[true, false, true]} />)
    const cells = container.querySelectorAll('.meter > span')
    expect(cells).toHaveLength(3)
    expect([...cells].map((c) => c.hasAttribute('data-filled'))).toEqual([true, false, true])
  })
})
