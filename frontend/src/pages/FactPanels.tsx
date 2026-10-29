import { useId, useState, type FormEvent } from 'react'
import { api, ApiError } from '@/api/client'
import type { Clue, Experience, Fact, FactSource, Item } from '@/api/types'
import { StageBlock } from '@/components/StageBlock'
import { StatusBadge, StatusRow } from '@/components/Status'
import { ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'

type FormValues = { item: Item; text: string; source: FactSource; clueId?: string }

function clueLabel(clue: Clue): string {
  return clue.text ?? clue.fileName ?? clue.description ?? '단서'
}

/** 확정·직접 추가·고치기가 같이 쓰는 입력 묶음. 내용은 늘 있고, 항목·출처는 고르는 화면에서만 보인다. */
function FactForm({
  clues,
  initial,
  withItem,
  withSource,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  clues: Clue[]
  initial: { item: Item; text: string; source?: FactSource; clueId?: string }
  withItem: boolean
  withSource: boolean
  submitLabel: string
  onSubmit: (values: FormValues) => Promise<void>
  onCancel: () => void
}) {
  const uid = useId()
  const [item, setItem] = useState<Item>(initial.item)
  const [text, setText] = useState(initial.text)
  const [source, setSource] = useState<FactSource>(initial.source ?? 'said')
  const [clueId, setClueId] = useState(initial.clueId ?? clues[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return setError('필수 입력이에요.')
    if (withSource && source === 'clue' && !clueId) return setError('단서를 골라 주세요.')
    try {
      await onSubmit({
        item,
        text: text.trim(),
        source,
        clueId: source === 'clue' ? clueId : undefined,
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="inner-card grid gap-3">
      {withItem && (
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
      )}
      <div>
        <label htmlFor={`${uid}-text`} className="label mb-2 block">
          내용
        </label>
        <textarea
          id={`${uid}-text`}
          className="field"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {withSource && (
        <>
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
                value={clueId}
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
        </>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn btn-sm btn-secondary">
          {submitLabel}
        </button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

/** 오른쪽 가운데: 사실 후보. 확인하기 전에는 사실이 아니다(C1). */
export function CandidatePanel({
  experience,
  onChange,
}: {
  experience: Experience
  onChange: (next: Experience) => void
}) {
  const [confirming, setConfirming] = useState<string | null>(null)

  async function confirm(candidate: Fact, v: FormValues) {
    const { fact } = await api.confirmFact(experience.id, candidate.id, {
      text: v.text,
      item: v.item,
      source: v.source,
      clueId: v.clueId,
    })
    onChange({
      ...experience,
      candidates: experience.candidates.filter((f) => f.id !== candidate.id),
      card: { ...experience.card, [fact.item]: [...experience.card[fact.item], fact] },
    })
    setConfirming(null)
  }

  async function discard(candidate: Fact) {
    await api.deleteFact(experience.id, candidate.id)
    onChange({
      ...experience,
      candidates: experience.candidates.filter((f) => f.id !== candidate.id),
    })
  }

  return (
    <StageBlock stage="experience" className="grid gap-3">
      <h2 className="h2">확인할 사실</h2>
      {experience.candidates.length === 0 && (
        <div className="row row-pending">확인할 사실이 없어요</div>
      )}
      {experience.candidates.map((c) => (
        <div key={c.id} className="grid gap-2">
          <div className="row row-pending items-start">
            <span>
              <span className="label mr-2">{ITEM_LABELS[c.item]}</span>
              {c.text}
            </span>
            <StatusBadge kind="ai_unverified" />
          </div>
          {confirming === c.id ? (
            <FactForm
              clues={experience.clues}
              initial={{ item: c.item, text: c.text }}
              withItem
              withSource
              submitLabel="카드에 넣기"
              onSubmit={(v) => confirm(c, v)}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => setConfirming(c.id)}
              >
                확정
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => void discard(c).catch(() => {})}
              >
                버리기
              </button>
            </div>
          )}
        </div>
      ))}
    </StageBlock>
  )
}

/** 오른쪽 아래: 경험 카드. 확정 사실만 들어간다. */
export function CardPanel({
  experience,
  onChange,
}: {
  experience: Experience
  onChange: (next: Experience) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  async function edit(fact: Fact, text: string) {
    const res = await api.updateFact(experience.id, fact.id, { text })
    onChange({
      ...experience,
      card: {
        ...experience.card,
        [fact.item]: experience.card[fact.item].map((f) => (f.id === fact.id ? res.fact : f)),
      },
    })
    setEditing(null)
  }

  async function remove(fact: Fact) {
    await api.deleteFact(experience.id, fact.id)
    onChange({
      ...experience,
      card: {
        ...experience.card,
        [fact.item]: experience.card[fact.item].filter((f) => f.id !== fact.id),
      },
    })
  }

  async function add(v: FormValues) {
    const { fact } = await api.addFact(experience.id, v)
    onChange({
      ...experience,
      card: { ...experience.card, [fact.item]: [...experience.card[fact.item], fact] },
    })
    setAdding(false)
  }

  return (
    <StageBlock stage="experience" className="grid gap-3">
      <h2 className="h2">경험 카드</h2>
      {ITEM_ORDER.map((item) => {
        const facts = experience.card[item]
        return (
          <section key={item} aria-label={`카드 ${ITEM_LABELS[item]}`} className="grid gap-2">
            <h3 className="label">{ITEM_LABELS[item]}</h3>
            {facts.length === 0 && <div className="row row-pending">비어 있음</div>}
            {facts.map((f) => (
              <div key={f.id} className="grid gap-2">
                <StatusRow kind={f.source === 'clue' ? 'clue' : 'said'}>{f.text}</StatusRow>
                {editing === f.id ? (
                  <FactForm
                    clues={experience.clues}
                    initial={{ item: f.item, text: f.text }}
                    withItem={false}
                    withSource={false}
                    submitLabel="저장"
                    onSubmit={(v) => edit(f, v.text)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="flex gap-3">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setEditing(f.id)}
                    >
                      고치기
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => void remove(f).catch(() => {})}
                    >
                      지우기
                    </button>
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}
      {adding ? (
        <FactForm
          clues={experience.clues}
          initial={{ item: 'situation', text: '' }}
          withItem
          withSource
          submitLabel="카드에 추가"
          onSubmit={add}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setAdding(true)}
          >
            직접 추가
          </button>
        </div>
      )}
    </StageBlock>
  )
}
