import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Clue, Experience, ItemStatusMap, Message } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { Meter } from '@/components/Meter'
import { StatusChip } from '@/components/Status'
import { ErrorView, Loading } from '@/components/States'
import { ITEM_LABELS, ITEM_ORDER } from '@/lib/cards'
import { statusKind } from '@/lib/status'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import { CandidatePanel, CardPanel } from '@/pages/FactPanels'
import NotFound from '@/pages/NotFound'

type ClueKind = 'text' | 'photo' | 'award' | 'document'
const CLUE_KIND_LABELS: Record<ClueKind, string> = {
  text: '글',
  photo: '사진',
  award: '수상기록',
  document: '문서',
}

function clueName(clue: Clue): string {
  return clue.fileName ?? CLUE_KIND_LABELS[clue.type]
}

export default function ExperienceDetail() {
  const { id = '' } = useParams()
  const loaded = useLoad(async () => {
    const [{ experience }, conversation] = await Promise.all([
      api.getExperience(id),
      api.getConversation(id),
    ])
    return { experience, conversation }
  }, [id])

  if (loaded.loading) return <Loading />
  if (loaded.error?.status === 404) return <NotFound />
  if (loaded.error || !loaded.data) {
    return (
      <main className="wrap py-12">
        <ErrorView message="경험을 불러오지 못했어요." onRetry={loaded.reload} />
      </main>
    )
  }
  const { experience, conversation } = loaded.data
  return (
    <Detail
      key={id}
      initial={experience}
      initialMessages={conversation.messages}
      initialStatus={conversation.itemStatus}
    />
  )
}

function Detail({
  initial,
  initialMessages,
  initialStatus,
}: {
  initial: Experience
  initialMessages: Message[]
  initialStatus: ItemStatusMap
}) {
  const id = initial.id
  const location = useLocation()
  const [params] = useSearchParams()
  const returnTo = params.get('returnTo')
  const clueFailed = (location.state as { clueFailed?: boolean } | null)?.clueFailed === true

  const [experience, setExperience] = useState(initial)
  const [messages, setMessages] = useState(initialMessages)
  const [itemStatus, setItemStatus] = useState(initialStatus)
  const [answer, setAnswer] = useState('')
  const ai = useAiCall()
  const started = useRef(false)

  useEffect(() => {
    if (started.current || initialMessages.length > 0) return
    started.current = true
    void ai.run(
      () => api.startConversation(id),
      (res) => {
        setMessages([res.question])
        setItemStatus(res.itemStatus)
      },
    )
    // 처음 한 번만 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function send(e: FormEvent) {
    e.preventDefault()
    const text = answer.trim()
    if (!text || ai.busy) return
    void ai.run(
      () => api.answerConversation(id, text),
      (res) => {
        setMessages((list) => [...list, res.answer, res.question])
        setItemStatus(res.itemStatus)
        setAnswer('')
        void api
          .getExperience(id)
          .then(({ experience: next }) => setExperience(next))
          .catch(() => {})
      },
    )
  }

  const explained = ITEM_ORDER.filter((item) => itemStatus[item] === 'explained').length
  // 마지막 줄이 AI 질문이면, 아직 설명되지 않은 첫 항목을 지금 묻고 있다(목 대화도 이 순서로 묻는다).
  const asking =
    messages.at(-1)?.role === 'ai'
      ? ITEM_ORDER.find((item) => itemStatus[item] !== 'explained')
      : undefined

  // 세 칸(와이어프레임 ask.png): 왼쪽 활동 목록, 가운데 대화(주인공), 오른쪽 진행·사실·카드.
  // 1000px 아래는 활동 목록이 위로 올라가 가로로 흐르고, 폰은 위아래로 쌓는다.
  return (
    <main className="wrap grid items-start gap-5 py-8 md:grid-cols-[minmax(0,1fr)_300px] lg:grid-cols-[220px_minmax(0,1fr)_320px]">
      <ActivityList current={{ ...experience, itemStatus }} />

      <StageBlock stage="experience" className="gap-[18px]">
        {returnTo && (
          <div>
            <Link to={returnTo} className="btn btn-sm btn-secondary">
              문항으로 돌아가기
            </Link>
          </div>
        )}
        <StageChip stage="experience" />
        <Header experience={experience} onChange={setExperience} clueFailed={clueFailed} />

        <h2 className="sr-only">대화</h2>
        <ol className="grid gap-3" aria-label="대화 내용">
          {messages.map((m, i) => (
            <li
              key={i}
              // 메신저처럼 AI는 왼쪽 옅은 면, 내 답은 오른쪽 검정 말풍선(와이어프레임 .msg).
              className={`rounded-card grid max-w-[92%] gap-0.5 px-4 py-3 text-[15px] md:max-w-[82%] ${m.role === 'ai' ? 'bg-fill rounded-tl-check justify-self-start' : 'bg-ink text-ink-inverse rounded-tr-check justify-self-end'}`}
            >
              <span className="text-[13px] font-semibold opacity-70">
                {m.role === 'ai' ? 'AI' : '나'}
              </span>
              <span>{m.text}</span>
            </li>
          ))}
        </ol>
        <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />

        {/* 입력칸은 대화 바로 아래 붙인다(와이어프레임 .composer). */}
        <form
          onSubmit={send}
          className="border-line grid gap-2.5 border-t pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        >
          <div className="grid gap-1.5">
            <label htmlFor="answer" className="label">
              답변
            </label>
            <textarea
              id="answer"
              className="field resize-y"
              rows={3}
              placeholder="직접 확인한 것만 적어 주세요"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <p className="meta">오른쪽 상태를 보고 충분하면 언제든 멈춰도 돼요.</p>
          </div>
          <button
            type="submit"
            className="btn btn-primary justify-self-start md:mb-[26px]"
            disabled={ai.busy || !answer.trim()}
          >
            보내기
          </button>
        </form>
      </StageBlock>

      <div className="grid content-start gap-4">
        <StageBlock stage="experience" className="gap-3.5">
          <h2 className="label">항목 상태</h2>
          <div className="grid gap-3.5" aria-live="polite">
            <p className="text-[40px] leading-none font-light tracking-[-0.06em] tabular-nums">
              {explained}
              <span className="text-[20px]"> / {ITEM_ORDER.length}</span>
            </p>
            <Meter cells={ITEM_ORDER.map((item) => itemStatus[item] === 'explained')} />
            <div className="flex flex-wrap gap-1.5">
              {ITEM_ORDER.map((item) => (
                <StatusChip key={item} kind={statusKind(itemStatus[item])} asking={item === asking}>
                  {ITEM_LABELS[item]}
                </StatusChip>
              ))}
            </div>
          </div>
          <p className="meta">카드를 고쳐도 상태는 바뀌지 않아요. 다시 대화하면 갱신돼요.</p>
        </StageBlock>
        <CandidatePanel experience={experience} onChange={setExperience} />
        <CardPanel experience={experience} onChange={setExperience} />
      </div>
    </main>
  )
}

/** 활동 목록 한 줄 아래 메타: 시작 전이면 그렇게, 아니면 설명된 항목 수. */
function progressText(experience: Experience): string {
  if (ITEM_ORDER.every((item) => experience.itemStatus[item] === null)) return '아직 시작 안 함'
  const explained = ITEM_ORDER.filter((item) => experience.itemStatus[item] === 'explained').length
  return `설명됨 ${explained} / ${ITEM_ORDER.length}`
}

/** 왼쪽 활동 목록: 모든 경험, 지금 경험 강조, 누르면 그 경험으로 이동(specs/04). */
function ActivityList({ current }: { current: Experience }) {
  const { data } = useLoad(async () => (await api.listExperiences()).experiences)
  const list = (data ?? [current]).map((e) => (e.id === current.id ? { ...e, ...current } : e))
  return (
    <nav
      aria-label="활동 목록"
      className="grid min-w-0 content-start gap-3 md:max-lg:col-span-full"
    >
      <h2 className="label">활동</h2>
      <ul className="grid gap-1.5 md:max-lg:auto-cols-[minmax(180px,1fr)] md:max-lg:grid-flow-col md:max-lg:overflow-x-auto">
        {list.map((e) => (
          <li key={e.id}>
            <Link
              to={`/experiences/${e.id}`}
              aria-current={e.id === current.id ? 'page' : undefined}
              aria-describedby={`rail-progress-${e.id}`}
              // 지금 경험은 단계 색으로 표시한다(와이어프레임 .rail a.on).
              className={`rounded-row focus-visible:outline-ink grid gap-0.5 border px-3 py-2.5 transition-[background-color] duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${e.id === current.id ? 'border-ink bg-lime' : 'hover:bg-fill border-transparent'}`}
            >
              <span className="text-[15px] font-semibold">{e.title}</span>
              {/* 링크 이름은 활동 이름만, 진행 정도는 설명으로 읽힌다. */}
              <span id={`rail-progress-${e.id}`} className="meta" aria-hidden>
                {progressText(e)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/resume" className="btn btn-sm btn-secondary">
        이력서에서 활동 추가
      </Link>
    </nav>
  )
}

function Header({
  experience,
  onChange,
  clueFailed,
}: {
  experience: Experience
  onChange: (next: Experience) => void
  clueFailed: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(experience.title)
  const [period, setPeriod] = useState(experience.period)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !period.trim()) {
      setError('필수 입력이에요.')
      return
    }
    try {
      const res = await api.updateExperience(experience.id, {
        title: title.trim(),
        period: period.trim(),
      })
      onChange({ ...experience, ...res.experience })
      setEditing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  return (
    <div className="grid gap-1.5">
      {editing ? (
        <form onSubmit={save} noValidate className="grid gap-3">
          <div>
            <label htmlFor="edit-title" className="label mb-2 block">
              제목
            </label>
            <input
              id="edit-title"
              className="field"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="edit-period" className="label mb-2 block">
              대략적 시기
            </label>
            <input
              id="edit-period"
              className="field"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </div>
          {error && <p className="field-error">{error}</p>}
          <div>
            <button type="submit" className="btn btn-sm btn-primary">
              저장
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="page-title">{experience.title}</h1>
            <button
              type="button"
              className="btn btn-sm btn-secondary shrink-0"
              onClick={() => {
                setTitle(experience.title)
                setPeriod(experience.period)
                setEditing(true)
              }}
            >
              수정
            </button>
          </div>
          <p className="meta">{experience.period}</p>
        </>
      )}

      {/* 이 활동을 이력서에서 어떻게 적었는지(와이어프레임 .quote). */}
      {experience.summary && (
        <p className="border-ink text-ink-60 mt-1 border-l-[3px] py-0.5 pl-3 text-[15px]">
          이력서: {experience.summary}
        </p>
      )}

      {clueFailed && (
        <p role="alert" className="field-error">
          일부 단서를 올리지 못했어요. 아래 단서 추가로 다시 올려 주세요.
        </p>
      )}

      {/* 단서는 칩으로 한 줄에 늘어놓고, 끝에 가벼운 `단서 추가`(와이어프레임). */}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {experience.clues.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="단서 목록">
            {experience.clues.map((clue) => (
              <li key={clue.id} className="chip text-[15px] whitespace-normal">
                <span className="meta">단서</span>
                {clue.type === 'text' ? (
                  <span>{clue.text}</span>
                ) : (
                  <>
                    <a
                      href={api.clueFileUrl(experience.id, clue.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-[3px]"
                    >
                      {clueName(clue)}
                    </a>
                    <span className="meta">{clue.description ?? 'AI 질문에 안 쓰임'}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!adding && (
          <button type="button" className="btn btn-ghost" onClick={() => setAdding(true)}>
            단서 추가
          </button>
        )}
      </div>

      {adding && (
        <AddClue
          experienceId={experience.id}
          onAdded={(clue) => {
            onChange({ ...experience, clues: [...experience.clues, clue] })
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  )
}

function AddClue({
  experienceId,
  onAdded,
  onCancel,
}: {
  experienceId: string
  onAdded: (clue: Clue) => void
  onCancel: () => void
}) {
  const [kind, setKind] = useState<ClueKind>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      let res: { clue: Clue }
      if (kind === 'text') {
        if (!text.trim()) return setError('필수 입력이에요.')
        res = await api.addClue(experienceId, { type: 'text', text: text.trim() })
      } else {
        if (!file) return setError('파일을 골라 주세요.')
        res = await api.addClue(experienceId, {
          type: kind,
          file,
          description: description.trim() || undefined,
        })
      }
      onAdded(res.clue)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '요청을 처리하지 못했어요.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="inner-card grid gap-3">
      <div>
        <label htmlFor="add-clue-kind" className="label mb-2 block">
          종류
        </label>
        <select
          id="add-clue-kind"
          className="field"
          value={kind}
          onChange={(e) => setKind(e.target.value as ClueKind)}
        >
          {(Object.keys(CLUE_KIND_LABELS) as ClueKind[]).map((k) => (
            <option key={k} value={k}>
              {CLUE_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      {kind === 'text' ? (
        <div>
          <label htmlFor="add-clue-text" className="label mb-2 block">
            단서 내용
          </label>
          <textarea
            id="add-clue-text"
            className="field"
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
      ) : (
        <>
          <div>
            <label htmlFor="add-clue-file" className="label mb-2 block">
              파일
            </label>
            <input
              id="add-clue-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div>
            <label htmlFor="add-clue-desc" className="label mb-2 block">
              설명
            </label>
            <input
              id="add-clue-desc"
              className="field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="meta mt-2">
              설명을 쓰지 않은 파일은 보관만 되고 AI 질문에는 쓰이지 않아요.
            </p>
          </div>
        </>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" className="btn btn-sm btn-secondary">
          올리기
        </button>
        <button type="button" className="btn btn-sm btn-secondary" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}
