/** 진행 막대: 칸 하나에 값 하나, 끝난 것은 채운 칸. 숫자는 옆이나 아래 글자로 따로 적는다. */
export function Meter({ cells }: { cells: boolean[] }) {
  return (
    <div className="meter" aria-hidden>
      {cells.map((filled, i) => (
        <span key={i} data-filled={filled ? '' : undefined} />
      ))}
    </div>
  )
}
