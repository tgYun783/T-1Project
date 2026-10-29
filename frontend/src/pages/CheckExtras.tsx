import { useId, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Check, CheckSentence, Clue, Experience, FactSource, Item } from '@/api/types'
import { StageBlock } from '@/components/StageBlock'
import { ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { useLoad } from '@/lib/useLoad'

function clueLabel(clue: Clue): string {
  return clue.text ?? clue.fileName ?? clue.description ?? '단서'
}

/** 끝난 문장이 추가 확인 필요·모름일 때: 자소서에서 고치기, 관련 경험 대화 이어가기. AI는 문장을 고쳐 주지 않는다(C4). */
export function FixActions({ check, sentence }: { check: Check; sentence: CheckSentence }) {
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const letter = useLoad(() => api.getCoverLetter(check.coverLetterId), [check.coverLetterId])
  const experiences = useLoad(() => api.listExperiences(), [])

  const cl = letter.data?.coverLetter
  const itemId = sentence.coverLetterItemId
  const item = cl?.items.find((i) => i.id === itemId)
  const fixPath =
    cl?.kind === 'generated' && itemId
      ? `/cover-letters/${check.coverLetterId}/items/${itemId}`
      : `/cover-letters/${check.coverLetterId}`

  const all = experiences.data?.experiences ?? []
  let choices: Experience[] = all
  if (cl?.kind === 'generated' && item) {
    const ids =
      item.usedExperienceIds.length > 0 ? item.usedExperienceIds : item.selectedExperienceIds
    choices = all.filter((e) => ids.includes(e.id))
  }

  function openExperience() {
    if (choices.length === 1) navigate(`/experiences/${choices[0].id}`)
    else setPicking((p) => !p)
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => navigate(fixPath)}
        >
          자소서에서 고치기
        </button>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={choices.length === 0}
          onClick={openExperience}
        >
          관련 경험 대화 이어가기
        </button>
      </div>
      {picking && choices.length > 1 && (
        <ul className="grid gap-2" aria-label="관련 경험 목록">
          {choices.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="row w-full items-center text-left"
                onClick={() => navigate(`/experiences/${e.id}`)}
              >
                {e.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type Candidate = Check['candidates'][number]

function CandidateRow({
  checkId,
  candidate,
  experiences,
  onDone,
}: {
  checkId: string
  candidate: Candidate
  experiences: Experience[]
  onDone: () => void
}) {
  const uid = useId()
  const [open, setOpen] = useState(false)
  const [experienceId, setExperienceId] = useState(
    candidate.experienceId ?? experiences[0]?.id ?? '',
  )
  const [item, setItem] = useState<Item>(candidate.item)
  const [source, setSource] = useState<FactSource>('said')
  const [clueId, setClueId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pickedExperience = experienceId || experiences[0]?.id || ''
  const clues = experiences.find((e) => e.id === pickedExperience)?.clues ?? []
  const pickedClue = clues.some((c) => c.id === clueId) ? clueId : (clues[0]?.id ?? '')

  async function run(call: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await call()
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CANDIDATE_RESOLVED') onDone()
      else setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  function save(e: FormEvent) {
    e.preventDefault()
    if (!pickedExperience) return setError('경험을 골라 주세요.')
    if (source === 'clue' && !pickedClue) return setError('단서를 골라 주세요.')
    void run(() =>
      api.confirmCandidate(checkId, candidate.id, {
        experienceId: pickedExperience,
        item,
        source,
        clueId: source === 'clue' ? pickedClue : undefined,
      }),
    )
  }

  return (
    <li className="row row-pending grid justify-normal gap-3">
      <div className="flex items-center justify-between gap-3">
        <span>{candidate.text}</span>
        <span className="meta whitespace-nowrap">AI 제안·미확인</span>
      </div>
      {!open && (
        <div className="flex gap-3">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setOpen(true)}>
            카드에 저장
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            disabled={busy}
            onClick={() => void run(() => api.discardCandidate(checkId, candidate.id))}
          >
            버리기
          </button>
        </div>
      )}
      {open && (
        <form onSubmit={save} noValidate className="inner-card grid gap-3">
          <div>
            <label htmlFor={`${uid}-exp`} className="label mb-2 block">
              경험
            </label>
            <select
              id={`${uid}-exp`}
              className="field"
              value={pickedExperience}
              onChange={(e) => setExperienceId(e.target.value)}
            >
              {experiences.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-item`} className="label mb-2 block">
              항목
            </label>
            <select
              id={`${uid}-item`}
              className="field"
              value={item}
              onChange={(e) => setItem(e.target.value as Item)}
            >
              {ITEM_ORDER.map((i) => (
                <option key={i} value={i}>
                  {ITEM_LABELS[i]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-4 text-[15px]">
            {(['said', 'clue'] as const).map((s) => (
              <label key={s} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`${uid}-source`}
                  checked={source === s}
                  onChange={() => setSource(s)}
                />
                {s === 'said' ? '내가 말함' : '자료로 확인'}
              </label>
            ))}
          </div>
          {source === 'clue' && (
            <div>
              <label htmlFor={`${uid}-clue`} className="label mb-2 block">
                단서
              </label>
              <select
                id={`${uid}-clue`}
                className="field"
                value={pickedClue}
                onChange={(e) => setClueId(e.target.value)}
              >
                {clues.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clueLabel(c)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="field-error">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" className="btn btn-sm btn-secondary" disabled={busy}>
              저장
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setOpen(false)}
            >
              취소
            </button>
          </div>
        </form>
      )}
      {!open && error && <p className="field-error">{error}</p>}
    </li>
  )
}

/** 점검 답에서 나온 사실 후보. 확인하기 전에는 사실이 아니다(C1, R12). */
export function CheckCandidates({
  check,
  onResolved,
}: {
  check: Check
  onResolved: (factId: string) => void
}) {
  const experiences = useLoad(() => api.listExperiences(), [])
  if (check.candidates.length === 0) return null
  return (
    <StageBlock stage="check" className="grid content-start gap-3">
      <div className="card-head">
        <h2 className="text-[17px] font-semibold">카드에 넣을 사실</h2>
        <span className="meta">{check.candidates.length}</span>
      </div>
      <ul className="grid gap-2" aria-label="카드에 넣을 사실 목록">
        {check.candidates.map((c) => (
          <CandidateRow
            key={`${c.id}-${experiences.data ? 'ready' : 'loading'}`}
            checkId={check.id}
            candidate={c}
            experiences={experiences.data?.experiences ?? []}
            onDone={() => onResolved(c.id)}
          />
        ))}
      </ul>
    </StageBlock>
  )
}
