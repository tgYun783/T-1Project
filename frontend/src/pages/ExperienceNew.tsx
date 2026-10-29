import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import { StageBlock } from '@/components/StageBlock'

type FileKind = 'photo' | 'award' | 'document'
type FileDraft = {
  key: number
  type: 'file'
  kind: FileKind
  file: File | null
  description: string
}
type TextDraft = { key: number; type: 'text'; text: string }
type Draft = FileDraft | TextDraft

const KIND_LABELS: Record<FileKind, string> = { photo: '사진', award: '수상기록', document: '문서' }

export default function ExperienceNew() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [period, setPeriod] = useState('')
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nextKey, setNextKey] = useState(1)

  function addFile() {
    setDrafts((list) => [
      ...list,
      { key: nextKey, type: 'file', kind: 'photo', file: null, description: '' },
    ])
    setNextKey((k) => k + 1)
  }
  function addText() {
    setDrafts((list) => [...list, { key: nextKey, type: 'text', text: '' }])
    setNextKey((k) => k + 1)
  }
  function patchFile(key: number, change: Partial<FileDraft>) {
    setDrafts((list) =>
      list.map((d) => (d.key === key && d.type === 'file' ? { ...d, ...change } : d)),
    )
  }
  function patchText(key: number, text: string) {
    setDrafts((list) => list.map((d) => (d.key === key && d.type === 'text' ? { ...d, text } : d)))
  }
  function remove(key: number) {
    setDrafts((list) => list.filter((d) => d.key !== key))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setError(null)
    if (!title.trim() || !period.trim()) return
    setBusy(true)
    let id: string
    try {
      const res = await api.createExperience({ title: title.trim(), period: period.trim() })
      id = res.experience.id
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
      setBusy(false)
      return
    }
    let clueFailed = false
    for (const draft of drafts) {
      try {
        if (draft.type === 'text') {
          if (draft.text.trim()) await api.addClue(id, { type: 'text', text: draft.text.trim() })
        } else if (draft.file) {
          await api.addClue(id, {
            type: draft.kind,
            file: draft.file,
            description: draft.description.trim() || undefined,
          })
        }
      } catch {
        clueFailed = true
      }
    }
    navigate(`/experiences/${id}`, { state: clueFailed ? { clueFailed: true } : undefined })
  }

  return (
    <main className="wrap grid gap-4 pt-12">
      <StageBlock stage="experience">
        <h1 className="h2">경험 등록</h1>
      </StageBlock>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5 py-6">
        <div>
          <label htmlFor="exp-title" className="label mb-2 block">
            제목
          </label>
          <input
            id="exp-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {submitted && !title.trim() && <p className="field-error">필수 입력이에요.</p>}
        </div>
        <div>
          <label htmlFor="exp-period" className="label mb-2 block">
            대략적 시기
          </label>
          <input
            id="exp-period"
            className="field"
            placeholder="예: 2025년 여름"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
          {submitted && !period.trim() && <p className="field-error">필수 입력이에요.</p>}
        </div>

        <div className="grid gap-3">
          {drafts.map((draft) =>
            draft.type === 'text' ? (
              <div key={draft.key} className="inner-card grid gap-3">
                <div>
                  <label htmlFor={`clue-text-${draft.key}`} className="label mb-2 block">
                    단서 내용
                  </label>
                  <textarea
                    id={`clue-text-${draft.key}`}
                    className="field"
                    rows={3}
                    value={draft.text}
                    onChange={(e) => patchText(draft.key, e.target.value)}
                  />
                </div>
                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => remove(draft.key)}
                  >
                    빼기
                  </button>
                </div>
              </div>
            ) : (
              <div key={draft.key} className="inner-card grid gap-3">
                <div>
                  <label htmlFor={`clue-kind-${draft.key}`} className="label mb-2 block">
                    종류
                  </label>
                  <select
                    id={`clue-kind-${draft.key}`}
                    className="field"
                    value={draft.kind}
                    onChange={(e) => patchFile(draft.key, { kind: e.target.value as FileKind })}
                  >
                    {(Object.keys(KIND_LABELS) as FileKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {KIND_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`clue-file-${draft.key}`} className="label mb-2 block">
                    파일
                  </label>
                  <input
                    id={`clue-file-${draft.key}`}
                    type="file"
                    onChange={(e) => patchFile(draft.key, { file: e.target.files?.[0] ?? null })}
                  />
                </div>
                <div>
                  <label htmlFor={`clue-desc-${draft.key}`} className="label mb-2 block">
                    설명
                  </label>
                  <input
                    id={`clue-desc-${draft.key}`}
                    className="field"
                    value={draft.description}
                    onChange={(e) => patchFile(draft.key, { description: e.target.value })}
                  />
                  <p className="meta mt-2">
                    설명을 쓰지 않은 파일은 보관만 되고 AI 질문에는 쓰이지 않아요.
                  </p>
                </div>
                <div>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => remove(draft.key)}
                  >
                    빼기
                  </button>
                </div>
              </div>
            ),
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" className="btn btn-sm btn-secondary" onClick={addFile}>
              파일 추가
            </button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addText}>
              글로 추가
            </button>
          </div>
        </div>

        {error && <p className="field-error">{error}</p>}
        <div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            대화 시작
          </button>
        </div>
      </form>
    </main>
  )
}
