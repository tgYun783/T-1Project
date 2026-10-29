import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Clue, Experience, ItemStatusMap, Message } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { StageBlock } from '@/components/StageBlock'
import { StatusRow } from '@/components/Status'
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

  return (
    <main className="wrap grid gap-4 pt-12 pb-12">
      {returnTo && (
        <div>
          <Link to={returnTo} className="btn btn-sm btn-secondary">
            문항으로 돌아가기
          </Link>
        </div>
      )}
      <StageBlock stage="experience">
        <Header experience={experience} onChange={setExperience} clueFailed={clueFailed} />
      </StageBlock>

      <div className="grid gap-4 md:grid-cols-2">
        <StageBlock stage="experience" className="grid content-start gap-4">
          <h2 className="h2">대화</h2>
          <ol className="grid gap-3" aria-label="대화 내용">
            {messages.map((m, i) => (
              <li key={i} className="inner-card flex gap-3">
                <span className="label">{m.role === 'ai' ? 'AI' : '나'}</span>
                <span className="text-[15px]">{m.text}</span>
              </li>
            ))}
          </ol>
          <form onSubmit={send} className="grid gap-3">
            <p className="meta">오른쪽 상태를 보고 충분하면 언제든 멈춰도 돼요.</p>
            <div>
              <label htmlFor="answer" className="label mb-2 block">
                답변
              </label>
              <textarea
                id="answer"
                className="field"
                rows={4}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            </div>
            <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />
            <div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={ai.busy || !answer.trim()}
              >
                보내기
              </button>
            </div>
          </form>
        </StageBlock>

        <div className="grid content-start gap-4">
          <StageBlock stage="experience" className="grid gap-3">
            <h2 className="h2">항목 상태</h2>
            <div className="grid gap-2" aria-live="polite">
              {ITEM_ORDER.map((item) => (
                <StatusRow key={item} kind={statusKind(itemStatus[item])}>
                  {ITEM_LABELS[item]}
                </StatusRow>
              ))}
            </div>
            <p className="meta">카드를 고쳐도 상태는 바뀌지 않아요. 다시 대화하면 갱신돼요.</p>
          </StageBlock>
          <CandidatePanel experience={experience} onChange={setExperience} />
          <CardPanel experience={experience} onChange={setExperience} />
        </div>
      </div>
    </main>
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
    <div className="grid gap-4">
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="h2">{experience.title}</h1>
            <p className="meta mt-2">{experience.period}</p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => {
              setTitle(experience.title)
              setPeriod(experience.period)
              setEditing(true)
            }}
          >
            수정
          </button>
        </div>
      )}

      {clueFailed && (
        <p role="alert" className="field-error">
          일부 단서를 올리지 못했어요. 아래 단서 추가로 다시 올려 주세요.
        </p>
      )}

      {experience.clues.length > 0 && (
        <ul className="grid gap-2" aria-label="단서 목록">
          {experience.clues.map((clue) => (
            <li key={clue.id} className="inner-card text-[15px]">
              {clue.type === 'text' ? (
                <span>{clue.text}</span>
              ) : (
                <>
                  <a
                    href={api.clueFileUrl(experience.id, clue.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {clueName(clue)}
                  </a>
                  <span className="meta ml-2">{clue.description ?? 'AI 질문에 안 쓰임'}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <AddClue
          experienceId={experience.id}
          onAdded={(clue) => {
            onChange({ ...experience, clues: [...experience.clues, clue] })
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setAdding(true)}
          >
            단서 추가
          </button>
        </div>
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
