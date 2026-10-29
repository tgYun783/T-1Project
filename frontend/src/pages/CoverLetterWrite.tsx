import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { CoverLetter, CoverLetterItem, Experience } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { Meter } from '@/components/Meter'
import { CheckMark } from '@/components/CheckMark'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { ErrorView, Loading } from '@/components/States'
import { hasConfirmedFact, ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { STATUS_INFO } from '@/lib/status'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

export default function CoverLetterWrite() {
  const { id = '', itemId = '' } = useParams()
  // 문항을 옮길 때마다 다시 불러와 다른 문항에서 고른 카드·응답을 반영한다.
  const loaded = useLoad(async () => {
    const [{ coverLetter }, { experiences }] = await Promise.all([
      api.getCoverLetter(id),
      api.listExperiences(),
    ])
    return { coverLetter, experiences }
  }, [id, itemId])

  if (loaded.loading) {
    return (
      <main className="wrap pt-8">
        <Loading />
      </main>
    )
  }
  if (loaded.error?.status === 404) return <NotFound />
  if (loaded.error || !loaded.data) {
    return (
      <main className="wrap py-12">
        <ErrorView message="자소서를 불러오지 못했어요." onRetry={loaded.reload} />
      </main>
    )
  }
  const { coverLetter, experiences } = loaded.data
  const item = coverLetter.items.find((i) => i.id === itemId)
  if (!item) return <NotFound />
  return (
    <Write key={itemId} initialLetter={coverLetter} initialItem={item} experiences={experiences} />
  )
}

function Write({
  initialLetter,
  initialItem,
  experiences,
}: {
  initialLetter: CoverLetter
  initialItem: CoverLetterItem
  experiences: Experience[]
}) {
  const location = useLocation()
  const [letter, setLetter] = useState(initialLetter)
  const [item, setItem] = useState(initialItem)
  const [selected, setSelected] = useState<string[]>(initialItem.selectedExperienceIds)
  const [draft, setDraft] = useState(initialItem.answer ?? '')
  const [recDone, setRecDone] = useState(initialItem.recommendations.length > 0)
  const [noFacts, setNoFacts] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const rec = useAiCall()
  const gen = useAiCall()
  const started = useRef(false)

  const letterId = letter.id
  const index = letter.items.findIndex((i) => i.id === item.id)
  const next = letter.items[index + 1]
  const answered = letter.items.filter((i) => i.answer !== null).length
  const byId = new Map(experiences.map((e) => [e.id, e]))
  const recommended = item.recommendations.filter((r) => byId.has(r.experienceId))
  const recommendedIds = new Set(recommended.map((r) => r.experienceId))
  const others = experiences.filter((e) => hasConfirmedFact(e) && !recommendedIds.has(e.id))
  const showCards = recDone || noFacts || (!rec.busy && (rec.failed || rec.error !== null))

  function applyItem(next: CoverLetterItem) {
    setItem(next)
    setLetter((l) => ({ ...l, items: l.items.map((i) => (i.id === next.id ? next : i)) }))
  }

  useEffect(() => {
    if (started.current || initialItem.recommendations.length > 0) return
    started.current = true
    void rec.run(
      async () => {
        try {
          return await api.recommend(letterId, initialItem.id)
        } catch (e) {
          if (e instanceof ApiError && e.code === 'NO_CONFIRMED_FACTS') return null
          throw e
        }
      },
      (res) => {
        if (res) applyItem(res.item)
        else setNoFacts(true)
        setRecDone(true)
      },
    )
    // 들어올 때 한 번만 추천을 부른다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 이 문항을 쓰는 다른 문항 번호들(화면에서 계산). */
  function usedIn(experienceId: string): number[] {
    return letter.items
      .map((i, n) => ({ i, n: n + 1 }))
      .filter(({ i }) => i.id !== item.id && i.selectedExperienceIds.includes(experienceId))
      .map(({ n }) => n)
  }

  function toggle(experienceId: string) {
    setSelected((ids) =>
      ids.includes(experienceId) ? ids.filter((x) => x !== experienceId) : [...ids, experienceId],
    )
  }

  function make(confirmOverwrite = false) {
    if (gen.busy || selected.length === 0) return
    // 사용자가 고친 응답은 확인을 받은 뒤에만 덮어쓴다(C4).
    if (!confirmOverwrite && item.answer !== null && item.answerEdited) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    const ids = selected
    void gen.run(
      async () => {
        const picked = await api.selectExperiences(letterId, item.id, ids)
        applyItem(picked.item)
        try {
          return await api.makeAnswer(letterId, item.id, confirmOverwrite || undefined)
        } catch (e) {
          if (e instanceof ApiError && e.code === 'OVERWRITE_CONFIRM_REQUIRED') return null
          throw e
        }
      },
      (res) => {
        if (!res) {
          setConfirming(true)
          return
        }
        applyItem(res.item)
        setDraft(res.item.answer ?? '')
      },
    )
  }

  async function save() {
    if (!draft.trim()) {
      setSaveError('응답을 입력해 주세요.')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api.updateItemAnswer(letterId, item.id, draft)
      applyItem(res.item)
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : '요청을 처리하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const cardProps = (experience: Experience) => ({
    experience,
    pressed: selected.includes(experience.id),
    onToggle: () => toggle(experience.id),
    usedIn: usedIn(experience.id),
    returnTo: location.pathname,
  })

  return (
    <main className="wrap grid gap-5 py-8">
      <div className="grid justify-items-start gap-2">
        <StageChip stage="coverLetter" />
        <h1 className="page-title md:text-[36px]">{letter.title || '제목 없음'}</h1>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
        <StageBlock stage="coverLetter" className="gap-5 p-7">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <nav aria-label="문항 이동" className="flex flex-wrap gap-1.5">
              {letter.items.map((i, n) => {
                const current = i.id === item.id
                return (
                  <Link
                    key={i.id}
                    to={`/cover-letters/${letterId}/items/${i.id}`}
                    aria-current={current ? 'page' : undefined}
                    className={`rounded-pill focus-visible:outline-ink border px-3.5 py-1.5 text-[15px] transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      current ? 'border-ink bg-lilac' : 'border-line hover:bg-fill'
                    }`}
                  >
                    {`문항 ${n + 1}`}
                  </Link>
                )
              })}
            </nav>
            <div className="grid w-44 gap-1.5">
              <Meter cells={letter.items.map((i) => i.answer !== null)} />
              <p className="meta text-right">{`응답 ${answered} / 문항 ${letter.items.length}`}</p>
            </div>
          </div>

          <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{item.question}</h2>

          {item.answer !== null ? (
            <div className="grid gap-2">
              <label htmlFor="item-answer" className="label">
                응답
              </label>
              <textarea
                id="item-answer"
                className="field max-w-[64ch] resize-y text-[17px] leading-[1.75]"
                rows={9}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              {saveError && <p className="field-error">{saveError}</p>}
            </div>
          ) : (
            <div className="row-pending rounded-row px-3.5 py-3">
              <p className="text-[15px]">아직 만들지 않음</p>
            </div>
          )}

          <AiStatus busy={gen.busy} failed={gen.failed} error={gen.error} onRetry={gen.retry} />

          <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {item.answer !== null && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    disabled={saving || draft === item.answer}
                    onClick={() => void save()}
                  >
                    응답 저장
                  </button>
                  {next ? (
                    <Link
                      to={`/cover-letters/${letterId}/items/${next.id}`}
                      className="btn btn-sm btn-secondary"
                    >
                      다음 문항
                    </Link>
                  ) : (
                    <Link to={`/cover-letters/${letterId}`} className="btn btn-sm btn-secondary">
                      자소서 보기
                    </Link>
                  )}
                </>
              )}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={selected.length === 0 || gen.busy}
              onClick={() => make()}
            >
              이 문항 만들기
            </button>
          </div>
        </StageBlock>

        <aside className="grid gap-6">
          <section aria-label="추천 경험 카드" className="grid gap-3">
            <div className="card-head">
              <h2 className="text-[13px] font-semibold">추천 경험 카드</h2>
              {showCards && <span className="meta">{recommended.length}</span>}
            </div>
            <AiStatus busy={rec.busy} failed={rec.failed} error={rec.error} onRetry={rec.retry} />
            {rec.busy &&
              [0, 1].map((n) => <div key={n} aria-hidden className="skeleton rounded-card h-32" />)}
            {noFacts && (
              <div
                role="alert"
                className="row-pending rounded-row flex flex-col items-start gap-3 px-3.5 py-3"
              >
                <p className="text-[15px]">확정된 사실이 있는 경험 카드가 없어요.</p>
                <Link to="/experiences" className="btn btn-sm btn-secondary">
                  경험으로 가기
                </Link>
              </div>
            )}
            {showCards && recommended.length > 0 && (
              <ul className="grid gap-3">
                {recommended.map((r) => (
                  <CardOption
                    key={r.experienceId}
                    {...cardProps(byId.get(r.experienceId) as Experience)}
                    reason={r.reason}
                  />
                ))}
              </ul>
            )}
          </section>
          {showCards && others.length > 0 && (
            <section aria-label="다른 카드" className="grid gap-3">
              <h3 className="text-[13px] font-semibold">다른 카드</h3>
              <ul className="grid gap-3">
                {others.map((e) => (
                  <CardOption key={e.id} {...cardProps(e)} />
                ))}
              </ul>
            </section>
          )}
          {item.answer !== null && (
            <section aria-label="근거 경험 카드" className="grid gap-3">
              <div className="card-head">
                <h2 className="text-[13px] font-semibold">근거 경험 카드</h2>
                <span className="meta">{item.usedExperienceIds.length}</span>
              </div>
              <ul className="grid gap-2">
                {item.usedExperienceIds.map((experienceId) => (
                  <li key={experienceId} className="row font-semibold">
                    {byId.get(experienceId)?.title ?? '지운 경험'}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      {confirming && (
        <div className="bg-ink/40 fixed inset-0 z-10 flex items-center justify-center p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="overwrite-title"
            className="card w-full max-w-[480px] p-7"
          >
            <p id="overwrite-title" className="text-[17px]">
              고친 내용이 새 응답으로 바뀌어요. 계속할까요?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setConfirming(false)}
              >
                취소
              </button>
              <button type="button" className="btn btn-sm btn-primary" onClick={() => make(true)}>
                바꾸기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function CardOption({
  experience,
  reason,
  pressed,
  onToggle,
  usedIn,
  returnTo,
}: {
  experience: Experience
  reason?: string
  pressed: boolean
  onToggle: () => void
  usedIn: number[]
  returnTo: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <li
      className={`rounded-card grid gap-2 border px-4 py-3.5 transition-[border-color,box-shadow] duration-150 ${
        pressed ? 'border-ink ring-ink ring-1' : 'border-line'
      }`}
    >
      <button
        type="button"
        aria-pressed={pressed}
        className="rounded-row hover:bg-fill focus-visible:outline-ink -m-1.5 flex cursor-pointer items-start gap-2.5 p-1.5 text-left text-[15px] font-semibold transition-colors duration-150 outline-none focus-visible:outline-2"
        onClick={onToggle}
      >
        {pressed ? (
          <CheckMark />
        ) : (
          <span
            aria-hidden
            className="rounded-check border-ink size-[22px] shrink-0 border-[1.5px]"
          />
        )}
        {experience.title}
      </button>
      {(experience.period || usedIn.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {experience.period && <span className="meta">{experience.period}</span>}
          {usedIn.map((n) => (
            <span key={n} className="chip">{`문항 ${n}에 사용 중`}</span>
          ))}
        </div>
      )}
      {reason && <p className="text-ink-60 text-[15px]">{reason}</p>}
      <button
        type="button"
        aria-expanded={open}
        className="btn btn-ghost justify-self-start"
        onClick={() => setOpen((o) => !o)}
      >
        사실 보기
      </button>
      {open && (
        <div className="grid gap-2">
          <ul className="grid gap-1.5">
            {ITEM_ORDER.flatMap((key) =>
              experience.card[key].map((f) => (
                <li key={f.id} className="rounded-row bg-fill grid gap-0.5 px-3 py-2">
                  <span className="meta">
                    {ITEM_LABELS[key]} · {STATUS_INFO[f.source === 'clue' ? 'clue' : 'said'].label}
                  </span>
                  <span className="text-[15px]">{f.text}</span>
                </li>
              )),
            )}
          </ul>
          <Link
            to={`/experiences/${experience.id}?returnTo=${encodeURIComponent(returnTo)}`}
            className="btn btn-sm btn-secondary justify-self-start"
          >
            이 카드 보강하기
          </Link>
        </div>
      )}
    </li>
  )
}
