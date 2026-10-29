import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Check, CoverLetter, CoverLetterItem, Experience, Fact } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { ErrorView, Loading } from '@/components/States'
import { ITEM_ORDER } from '@/lib/cards'
import { formatDate } from '@/lib/format'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import NotFound from '@/pages/NotFound'

export default function CoverLetterDetail() {
  const { id = '' } = useParams()
  const loaded = useLoad(async () => {
    const [{ coverLetter, experiences }, { checks }] = await Promise.all([
      api.getCoverLetter(id),
      api.listChecks(id),
    ])
    return { coverLetter, experiences, checks }
  }, [id])

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
  const { coverLetter, experiences, checks } = loaded.data
  const answered = coverLetter.items.filter((i) => i.answer !== null).length
  const startCheck = <CheckStart letterId={coverLetter.id} />
  const pastChecks = <PastChecks checks={checks} />
  return (
    <main className="wrap grid gap-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid justify-items-start gap-2">
          <StageChip stage="coverLetter" />
          <h1 className="page-title md:text-[36px]">{coverLetter.title ?? '제목 없는 자소서'}</h1>
        </div>
        <p className="meta">
          {coverLetter.kind === 'pasted'
            ? '붙여넣음'
            : `응답 ${answered} / 문항 ${coverLetter.items.length} · 작성함`}
        </p>
      </div>
      {coverLetter.kind === 'pasted' ? (
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
          <PastedBody key={coverLetter.id} letter={coverLetter} footer={startCheck} />
          {pastChecks}
        </div>
      ) : (
        <GeneratedLetter
          letter={coverLetter}
          experiences={experiences}
          footer={startCheck}
          below={pastChecks}
        />
      )}
    </main>
  )
}

function PastedBody({ letter, footer }: { letter: CoverLetter; footer: ReactNode }) {
  const [body, setBody] = useState(letter.body ?? '')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSubmitted(true)
    setSaved(false)
    setError(null)
    if (!body.trim()) return
    setSaving(true)
    try {
      await api.updateCoverLetter(letter.id, { body })
      setSaved(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <StageBlock stage="coverLetter" className="gap-4 p-7">
      <label htmlFor="cl-detail-body" className="text-[17px] font-semibold">
        본문
      </label>
      <textarea
        id="cl-detail-body"
        className="field resize-y text-[17px] leading-[1.75]"
        rows={12}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {submitted && !body.trim() && <p className="field-error">본문을 입력해 주세요.</p>}
      {error && <p className="field-error">{error}</p>}
      {saved && (
        <p role="status" className="meta">
          저장했어요.
        </p>
      )}
      <LetterFooter
        left={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              disabled={saving}
              onClick={save}
            >
              저장
            </button>
            <p className="text-ink-60 text-[15px]">
              자소서를 고치면 지난 점검은 오래됨으로 바뀌어요.
            </p>
          </>
        }
        right={footer}
      />
    </StageBlock>
  )
}

/** 자소서 카드 아래 줄: 왼쪽은 보조 행동, 오른쪽은 다음 단계(제출 전 점검). */
function LetterFooter({ left, right }: { left?: ReactNode; right: ReactNode }) {
  return (
    <div className="border-line flex flex-wrap items-start justify-between gap-3 border-t pt-4">
      <div className="flex flex-wrap items-center gap-3">{left}</div>
      {right}
    </div>
  )
}

/** 응답 글을 문장으로 나눈다. 문장을 누르면 그 문장의 근거 사실을 오른쪽에서 짝지어 보여 준다. */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim())
}

// 응답 문장과 카드 사실이 이만큼 이상 같은 글로 이어지면 그 사실을 근거로 본다.
const MIN_SHARED = 10

/** 문장과 사실이 가장 길게 겹치는 구간(문장 안 위치). 짧으면 null. */
function sharedRange(sentence: string, fact: string): [number, number] | null {
  let best = 0
  let end = 0
  let prev = new Array<number>(fact.length + 1).fill(0)
  for (let i = 1; i <= sentence.length; i++) {
    const cur = new Array<number>(fact.length + 1).fill(0)
    for (let j = 1; j <= fact.length; j++) {
      if (sentence[i - 1] === fact[j - 1]) {
        cur[j] = prev[j - 1] + 1
        if (cur[j] > best) {
          best = cur[j]
          end = i
        }
      }
    }
    prev = cur
  }
  let start = end - best
  while (start < end && /\s/.test(sentence[start])) start++
  while (end > start && /\s/.test(sentence[end - 1])) end--
  if (end - start < MIN_SHARED) return null
  // 어절 중간에서 끊기지 않게 양쪽을 띄어쓰기까지 넓힌다(끝의 문장 부호는 뺀다).
  while (start > 0 && !/\s/.test(sentence[start - 1])) start--
  while (end < sentence.length && !/[\s,.!?]/.test(sentence[end])) end++
  return [start, end]
}

function confirmedFacts(experience: Experience): Fact[] {
  return ITEM_ORDER.flatMap((key) => experience.card[key])
}

/** 이 문장의 근거 사실 id와 문장 안 강조 구간. */
function pairsFor(sentence: string, experiences: Experience[]) {
  const factIds = new Set<string>()
  const ranges: [number, number][] = []
  for (const exp of experiences) {
    for (const f of confirmedFacts(exp)) {
      const range = sharedRange(sentence, f.text)
      if (range) {
        factIds.add(f.id)
        ranges.push(range)
      }
    }
  }
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  return { factIds, ranges: merged }
}

type Active = { itemId: string; sentence: number | null }

function GeneratedLetter({
  letter,
  experiences,
  footer,
  below,
}: {
  letter: CoverLetter
  experiences: Experience[]
  footer: ReactNode
  below: ReactNode
}) {
  const byId = new Map(experiences.map((e) => [e.id, e]))
  const usedBy = (item: CoverLetterItem) =>
    item.usedExperienceIds.flatMap((expId) => byId.get(expId) ?? [])

  // 처음에는 첫 응답의, 근거 사실이 있는 첫 문장을 짝지어 보여 준다.
  const [active, setActive] = useState<Active | null>(() => {
    const first = letter.items.find((i) => i.answer !== null)
    if (!first?.answer) return null
    const used = usedBy(first)
    const index = splitSentences(first.answer).findIndex((s) => pairsFor(s, used).factIds.size > 0)
    return { itemId: first.id, sentence: index >= 0 ? index : null }
  })

  const activeItem = letter.items.find((i) => i.id === active?.itemId) ?? null
  const activeSentence =
    activeItem?.answer && active?.sentence != null
      ? (splitSentences(activeItem.answer)[active.sentence] ?? null)
      : null
  const pairs = activeItem && activeSentence ? pairsFor(activeSentence, usedBy(activeItem)) : null

  // 오른쪽 칸: 이 자소서의 응답에 쓴 경험 카드(처음 나온 순서).
  const usedCards: Experience[] = []
  for (const item of letter.items) {
    for (const exp of usedBy(item)) {
      if (!usedCards.includes(exp)) usedCards.push(exp)
    }
  }

  return (
    <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-5">
        <StageBlock stage="coverLetter" className="gap-0 p-7">
          {letter.items.map((item, i) => (
            <ItemView
              key={item.id}
              index={i}
              letterId={letter.id}
              item={item}
              active={item.id === active?.itemId}
              activeSentence={item.id === active?.itemId ? (active?.sentence ?? null) : null}
              ranges={item.id === active?.itemId ? (pairs?.ranges ?? []) : []}
              onPick={(sentence) => setActive({ itemId: item.id, sentence })}
            />
          ))}
          <LetterFooter right={footer} />
        </StageBlock>
        {below}
      </div>
      <aside aria-labelledby="evidence-title" className="grid gap-3">
        <div className="card-head">
          <h2 id="evidence-title" className="text-[13px] font-semibold">
            근거 경험 카드
          </h2>
          <span className="meta">{usedCards.length}</span>
        </div>
        {usedCards.length === 0 ? (
          <div className="row-pending rounded-row px-3.5 py-3">
            <p className="text-[15px]">아직 만든 응답이 없어요.</p>
          </div>
        ) : (
          usedCards.map((exp) => {
            const inActive = activeItem?.usedExperienceIds.includes(exp.id) ?? false
            const owner = inActive
              ? activeItem
              : letter.items.find((i) => i.usedExperienceIds.includes(exp.id))
            // 고른 문장의 근거 사실이 있으면 그 카드만, 없으면 그 응답에 쓴 카드를 강조한다.
            const on = pairs?.factIds.size
              ? confirmedFacts(exp).some((f) => pairs.factIds.has(f.id))
              : inActive
            return (
              <EvidenceCard
                key={exp.id}
                experience={exp}
                on={on}
                paired={pairs?.factIds ?? new Set()}
                returnTo={`/cover-letters/${letter.id}/items/${owner?.id ?? ''}`}
              />
            )
          })
        )}
      </aside>
    </div>
  )
}

function ItemView({
  index,
  letterId,
  item,
  active,
  activeSentence,
  ranges,
  onPick,
}: {
  index: number
  letterId: string
  item: CoverLetterItem
  active: boolean
  activeSentence: number | null
  ranges: [number, number][]
  onPick: (sentence: number) => void
}) {
  const itemPath = `/cover-letters/${letterId}/items/${item.id}`
  return (
    <article className="border-line grid gap-3 py-6 first:pt-0 [&+&]:border-t">
      <span className={`chip justify-self-start ${active ? 'border-ink bg-lilac' : ''}`}>
        문항 {index + 1}
      </span>
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">{item.question}</h2>
      {item.answer === null ? (
        <div className="row-pending rounded-row flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
          <p className="text-[15px]">아직 만들지 않음</p>
          <Link to={itemPath} className="btn btn-sm btn-secondary">
            이 문항 쓰기
          </Link>
        </div>
      ) : (
        <>
          <p className="max-w-[64ch] text-[17px] leading-[1.75]">
            {splitSentences(item.answer).map((sentence, n) => (
              <span key={n}>
                {n > 0 && ' '}
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={activeSentence === n}
                  className="rounded-check hover:bg-fill focus-visible:outline-ink cursor-pointer transition-colors duration-150 outline-none focus-visible:outline-2"
                  onClick={() => onPick(n)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onPick(n)
                    }
                  }}
                >
                  {activeSentence === n ? <Marked text={sentence} ranges={ranges} /> : sentence}
                </span>
              </span>
            ))}
          </p>
          <div>
            <Link to={itemPath} className="btn btn-sm btn-secondary">
              카드 다시 고르기
            </Link>
          </div>
        </>
      )}
    </article>
  )
}

/** 근거 사실과 겹치는 구간을 크림색으로 칠한다. */
function Marked({ text, ranges }: { text: string; ranges: [number, number][] }) {
  const parts: ReactNode[] = []
  let at = 0
  ranges.forEach(([s, e], i) => {
    if (s > at) parts.push(text.slice(at, s))
    parts.push(
      <mark key={i} className="bg-cream rounded-check text-ink px-0.5">
        {text.slice(s, e)}
      </mark>,
    )
    at = e
  })
  parts.push(text.slice(at))
  return <>{parts}</>
}

function EvidenceCard({
  experience,
  on,
  paired,
  returnTo,
}: {
  experience: Experience
  on: boolean
  paired: Set<string>
  returnTo: string
}) {
  const explained = ITEM_ORDER.filter((k) => experience.itemStatus[k] === 'explained').length
  return (
    <article
      aria-current={on ? 'true' : undefined}
      className={`rounded-card grid gap-2 border px-4 py-3.5 transition-[border-color,box-shadow] duration-150 ${
        on ? 'border-ink ring-ink ring-1' : 'border-line'
      }`}
    >
      <h3 className="text-[15px] font-semibold">{experience.title}</h3>
      <p className="meta">
        {experience.period} · 설명됨 {explained} / 5
      </p>
      <ul className="grid list-disc gap-1 pl-[18px] text-[15px]">
        {confirmedFacts(experience).map((f) => (
          <li key={f.id}>
            {on && paired.has(f.id) ? (
              <mark className="bg-cream rounded-check text-ink px-0.5">{f.text}</mark>
            ) : (
              f.text
            )}
          </li>
        ))}
      </ul>
      <Link
        to={`/experiences/${experience.id}?returnTo=${encodeURIComponent(returnTo)}`}
        className="btn btn-sm btn-secondary justify-self-start"
      >
        보강하기
      </Link>
    </article>
  )
}

function CheckStart({ letterId }: { letterId: string }) {
  const navigate = useNavigate()
  const ai = useAiCall()

  function start() {
    void ai.run(
      () => api.createCheck(letterId),
      ({ check }) => navigate(`/checks/${check.id}`),
    )
  }

  return (
    <div className="grid justify-items-end gap-3">
      <button type="button" className="btn btn-primary" disabled={ai.busy} onClick={start}>
        제출 전 점검 시작
      </button>
      <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />
    </div>
  )
}

function PastChecks({ checks }: { checks: Check[] }) {
  const sorted = [...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return (
    <StageBlock stage="check" className="gap-3">
      <div className="card-head">
        <div className="flex flex-wrap items-center gap-2">
          <StageChip stage="check" />
          <h2 className="text-[17px] font-semibold">지난 점검</h2>
        </div>
        <span className="meta">{sorted.length}</span>
      </div>
      {sorted.length === 0 ? (
        <div className="row-pending rounded-row px-3.5 py-3">
          <p className="text-[15px]">아직 점검한 적이 없어요.</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {sorted.map((c) => {
            const done = c.sentences.filter(
              (s) => s.status !== 'pending' && s.status !== 'in_progress',
            ).length
            return (
              <li key={c.id}>
                <Link
                  to={`/checks/${c.id}`}
                  className="row row-select focus-visible:outline-ink flex-wrap items-center outline-none focus-visible:outline-2"
                >
                  <span className="grid gap-0.5">
                    <span className="text-[15px]">{formatDate(c.createdAt)}</span>
                    <span className="meta">
                      끝난 문장 {done} / 전체 {c.sentences.length}
                    </span>
                  </span>
                  {c.stale && <span className="chip chip-need">오래됨</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </StageBlock>
  )
}
