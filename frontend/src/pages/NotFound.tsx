import { Link } from 'react-router-dom'

// 단계 색 큰 면 대신 흰 카드 하나: 이름표 크기 제목 + 이동 버튼(POLISH H5·H6·S2).
export default function NotFound() {
  return (
    <main className="wrap py-12 md:py-20">
      <div className="card mx-auto w-full max-w-[640px] gap-5 p-7">
        <span className="meta">404</span>
        <h1 className="page-title">없는 페이지예요</h1>
        <div>
          <Link to="/" className="btn btn-primary">
            홈으로
          </Link>
        </div>
      </div>
    </main>
  )
}
