import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { ActivityDraft, Resume as ResumeData } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { ErrorView, Loading } from '@/components/States'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'

export default function Resume() {
  const { data, error, loading, reload } = useLoad(async () => (await api.getResume()).resume)
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
  return <ResumeForm initial={data} />
}

function formatDay(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

type DraftForm = { id: string | null; title: string; period: string; summary: string }
const EMPTY_FORM: DraftForm = { id: null, title: '', period: '', summary: '' }

function ResumeForm({ initial }: { initial: ResumeData }) {
  const navigate = useNavigate()
  const [text, setText] = useState(initial.text ?? '')
  const [pasted, setPasted] = useState(Boolean(initial.text))
  const [updatedAt, setUpdatedAt] = useState(initial.updatedAt)
  const [drafts, setDrafts] = useState<ActivityDraft[]>(initial.drafts)
  // 고치기·직접 추가 폼은 하나만 연다.
  const [form, setForm] = useState<DraftForm | null>(null)
  const [formSubmitted, setFormSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const ai = useAiCall()

  function split(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || ai.busy) return
    void ai.run(
      () => api.splitResume(text),
      (res) => {
        setDrafts(res.resume.drafts)
        setUpdatedAt(res.resume.updatedAt)
        setPasted(true)
      },
    )
  }

  function openForm(next: DraftForm) {
    setForm(next)
    setFormSubmitted(false)
    setError(null)
  }

  async function saveForm(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setFormSubmitted(true)
    if (!form.title.trim()) return
    setError(null)
    const input = {
      title: form.title.trim(),
      period: form.period.trim(),
      summary: form.summary.trim(),
    }
    try {
      if (form.id) {
        const { draft } = await api.updateDraft(form.id, input)
        setDrafts((list) => list.map((d) => (d.id === draft.id ? draft : d)))
      } else {
        const { draft } = await api.addDraft(input)
        setDrafts((list) => [...list, draft])
      }
      setForm(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  async function removeDraft(id: string) {
    setError(null)
    try {
      await api.deleteDraft(id)
      setDrafts((list) => list.filter((d) => d.id !== id))
      if (form?.id === id) setForm(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  async function confirmAll() {
    if (drafts.length === 0 || confirming) return
    setConfirming(true)
    setError(null)
    try {
      const { experiences } = await api.confirmDrafts(drafts.map((d) => d.id))
      navigate(`/experiences/${experiences[0].id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setConfirming(false)
    }
  }

  // 고치기·직접 추가 폼. 고치기는 그 활동 자리에, 직접 추가는 점선 자리에 연다.
  const draftForm = form && (
    <form onSubmit={saveForm} noValidate className="inner-card grid gap-3">
      <div>
        <label htmlFor="draft-title" className="label mb-2 block">
          활동 이름
        </label>
        <input
          id="draft-title"
          className="field"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        {formSubmitted && !form.title.trim() && <p className="field-error">필수 입력이에요.</p>}
      </div>
      <div>
        <label htmlFor="draft-period" className="label mb-2 block">
          대략적 시기
        </label>
        <input
          id="draft-period"
          className="field"
          placeholder="예: 2025년 여름"
          value={form.period}
          onChange={(e) => setForm({ ...form, period: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor="draft-summary" className="label mb-2 block">
          한 줄 설명
        </label>
        <input
          id="draft-summary"
          className="field"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-sm btn-secondary">
          {form.id ? '저장' : '목록에 추가'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>
          취소
        </button>
      </div>
    </form>
  )

  // 두 칸(와이어프레임 resume.png): 왼쪽 이력서, 오른쪽 확인할 활동과 주 버튼(주인공). 폰은 위아래로 쌓는다.
  return (
    <main className="wrap grid gap-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid justify-items-start gap-2">
          <StageChip stage="experience" />
          <h1 className="page-title md:text-[36px]">이력서를 붙여넣으면 활동별로 나눠 드려요</h1>
        </div>
        <p className="meta">확인한 활동마다 경험 카드가 하나씩 생겨요</p>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <StageBlock stage="experience">
          <form onSubmit={split} className="grid gap-4">
            <div className="grid gap-3">
              <div className="card-head">
                <label htmlFor="resume-text" className="label">
                  이력서
                </label>
                {updatedAt && <span className="meta">마지막 수정 {formatDay(updatedAt)}</span>}
              </div>
              <textarea
                id="resume-text"
                className="field resize-y leading-[1.6]"
                rows={11}
                placeholder="이력서나 활동 목록을 그대로 붙여넣어 주세요"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              {pasted ? (
                <p className="text-ink-60 text-[15px]">
                  다시 붙여넣으면 새로 나온 활동만 목록에 더해요.
                </p>
              ) : (
                <span />
              )}
              <button
                type="submit"
                className="btn btn-secondary"
                disabled={ai.busy || !text.trim()}
              >
                활동 나누기
              </button>
            </div>
          </form>
        </StageBlock>

        {/* 제목과 개수를 한 줄에 두되, 제목의 부모가 목록 전체를 감싸도록 카드 자체를 두 열 격자로 쓴다. */}
        <StageBlock
          stage="experience"
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-4"
        >
          <h2 className="text-[17px] font-semibold">확인할 활동</h2>
          <span className="meta">{drafts.length}개</span>

          <ul className="col-span-2 grid gap-2.5">
            {drafts.map((draft) =>
              form?.id === draft.id ? (
                <li key={draft.id}>{draftForm}</li>
              ) : (
                <li key={draft.id} className="rounded-row bg-fill grid gap-1 px-3.5 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-[17px] font-semibold tracking-[-0.02em]">
                      {draft.title}
                    </span>
                    <span className="meta">{draft.period}</span>
                  </div>
                  {draft.summary && (
                    <p className="text-ink-60 line-clamp-2 text-[15px]">{draft.summary}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() =>
                        openForm({
                          id: draft.id,
                          title: draft.title,
                          period: draft.period,
                          summary: draft.summary,
                        })
                      }
                    >
                      고치기
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void removeDraft(draft.id)}
                    >
                      빼기
                    </button>
                  </div>
                </li>
              ),
            )}
            {/* 점선은 아직 비어 있는 자리에만 쓴다(POLISH M1). 빈 목록 안내와 직접 추가를 한 상자로 묶는다. */}
            <li>
              {form && !form.id ? (
                draftForm
              ) : (
                <div className="row-pending rounded-row flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                  <p className="text-[15px]">
                    {drafts.length === 0 ? '확인할 활동이 없어요' : '빠진 활동이 있나요?'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => openForm(EMPTY_FORM)}
                  >
                    활동 직접 추가
                  </button>
                </div>
              )}
            </li>
          </ul>

          {error && <p className="field-error col-span-2">{error}</p>}
          <button
            type="button"
            className="btn btn-primary col-span-2 w-full"
            disabled={drafts.length === 0 || confirming}
            onClick={() => void confirmAll()}
          >
            {confirming ? '경험 만드는 중' : '경험 만들기'}
          </button>
        </StageBlock>
      </div>
    </main>
  )
}
