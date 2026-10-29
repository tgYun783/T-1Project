import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { StageBlock, StageChip } from '@/components/StageBlock'

export default function CoverLetterPaste() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!body.trim()) return
    setBusy(true)
    try {
      const { coverLetter } = await api.createCoverLetter({
        title: title.trim() || undefined,
        body,
      })
      navigate(`/cover-letters/${coverLetter.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setBusy(false)
    }
  }

  // 단계 칩 + 이름표 크기 제목, 입력칸은 본문 폭 카드 하나에 둔다(POLISH H5·M2·D5).
  return (
    <main className="wrap grid gap-5 py-8">
      <div className="grid justify-items-start gap-2">
        <StageChip stage="coverLetter" />
        <h1 className="page-title md:text-[36px]">쓴 자소서 붙여넣기</h1>
      </div>
      <StageBlock stage="coverLetter" className="max-w-[720px] p-7">
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
          <div>
            <label htmlFor="cl-title" className="label mb-2 block">
              제목
            </label>
            <input
              id="cl-title"
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="cl-body" className="label mb-2 block">
              본문
            </label>
            <textarea
              id="cl-body"
              className="field resize-y leading-[1.6]"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            {submitted && !body.trim() && <p className="field-error">본문을 입력해 주세요.</p>}
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              저장
            </button>
          </div>
        </form>
      </StageBlock>
    </main>
  )
}
