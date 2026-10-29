import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { Check, CheckSentence, JudgeResult, SentenceStatus } from '@/api/types'
import { AiStatus } from '@/components/AiStatus'
import { Meter } from '@/components/Meter'
import { StageBlock, StageChip } from '@/components/StageBlock'
import { ErrorView, Loading } from '@/components/States'
import { STATUS_INFO, statusKind } from '@/lib/status'
import { useAiCall } from '@/lib/useAiCall'
import { useLoad } from '@/lib/useLoad'
import { CheckCandidates, FixActions } from '@/pages/CheckExtras'
import NotFound from '@/pages/NotFound'

const JUDGE_LABELS: Record<JudgeResult['id'], string> = {
  J1: 'J1 수치의 출처',
  J2: 'J2 본인의 행동',
  J3: 'J3 표현의 실체',
  J4: 'J4 단정',
}

const JUDGE_RESULT_LABELS: Record<JudgeResult['result'], string> = {
  met: '충족',
  missing: '빠짐',
}

const isFinished = (s: CheckSentence) =>
  s.status === 'explained' || s.status === 'needs_more' || s.status === 'unknown'

// 문장 상태 칩: 대기 = 빈 칩, 진행 중 = 검정, 설명됨 = 초록 점, 덜 된 것 = 점선(와이어프레임 check).
const SENTENCE_CHIP: Record<SentenceStatus, string> = {
  pending: '',
  in_progress: 'chip-next',
  explained: 'chip-ok',
  needs_more: 'chip-need',
  unknown: 'chip-need',
}

function SentenceChip({ status }: { status: SentenceStatus }) {
  return (
    <span className={`chip ${SENTENCE_CHIP[status]} justify-self-start`}>
      {STATUS_INFO[statusKind(status)].label}
    </span>
  )
}

export default function CheckPage() {
  const { checkId = '' } = useParams()
  const loaded = useLoad(() => api.getCheck(checkId), [checkId])

  if (loaded.loading) return <Loading />
  if (loaded.error?.status === 404) return <NotFound />
  if (loaded.error || !loaded.data) {
    return (
      <main className="wrap py-12">
        <ErrorView message="점검을 불러오지 못했어요." onRetry={loaded.reload} />
      </main>
    )
  }
  // 주소가 바뀐 직후에는 이전 점검이 잠깐 남아 있으므로, 불러온 점검 id로 화면을 새로 만든다.
  return <CheckView key={loaded.data.check.id} initial={loaded.data.check} />
}

function CheckView({ initial }: { initial: Check }) {
  const navigate = useNavigate()
  const [check, setCheck] = useState(initial)
  const [currentId, setCurrentId] = useState<string | null>(
    () =>
      (
        initial.sentences.find((s) => s.status === 'in_progress') ??
        initial.sentences.find((s) => s.status === 'pending') ??
        initial.sentences[0]
      )?.id ?? null,
  )
  const [answer, setAnswer] = useState('')
  const ai = useAiCall()
  const restart = useAiCall()
  const started = useRef(false)

  const checkId = check.id
  const { sentences, stale } = check
  const current = sentences.find((s) => s.id === currentId) ?? null
  const done = sentences.filter(isFinished).length
  const nextPending = sentences.find((s) => s.status === 'pending')

  function applySentence(next: CheckSentence) {
    setCheck((c) => ({ ...c, sentences: c.sentences.map((s) => (s.id === next.id ? next : s)) }))
  }

  /** 오래된 점검이면 409 CHECK_STALE을 받는다. 그때는 같은 화면을 오래됨으로 바꾼다. */
  async function unlessStale<T>(call: () => Promise<T>): Promise<T | null> {
    try {
      return await call()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CHECK_STALE') return null
      throw e
    }
  }

  function start(sentenceId: string) {
    setCurrentId(sentenceId)
    void ai.run(
      () => unlessStale(() => api.startSentence(checkId, sentenceId)),
      (res) => {
        if (!res) setCheck((c) => ({ ...c, stale: true }))
        else applySentence(res.sentence)
      },
    )
  }

  useEffect(() => {
    if (started.current || initial.stale) return
    started.current = true
    // 들어올 때 진행 중인 문장이 없으면 첫 대기 문장을 시작한다.
    if (initial.sentences.some((s) => s.status === 'in_progress')) return
    const first = initial.sentences.find((s) => s.status === 'pending')
    if (first) start(first.id)
    // 처음 한 번만 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function send(e: FormEvent) {
    e.preventDefault()
    const text = answer.trim()
    if (!current || !text || ai.busy || stale) return
    const sentenceId = current.id
    void ai.run(
      () => unlessStale(() => api.answerSentence(checkId, sentenceId, text)),
      (res) => {
        if (!res) {
          setCheck((c) => ({ ...c, stale: true }))
          return
        }
        applySentence(res.sentence)
        setCheck((c) => ({
          ...c,
          candidates: [
            ...c.candidates,
            ...res.newCandidates.filter((n) => !c.candidates.some((o) => o.id === n.id)),
          ],
        }))
        setAnswer('')
      },
    )
  }

  function startNewCheck() {
    void restart.run(
      () => api.createCheck(check.coverLetterId),
      (res) => navigate(`/checks/${res.check.id}`),
    )
  }

  const answering = current?.status === 'in_progress' || (stale && current?.status === 'pending')

  return (
    <main className="wrap grid gap-5 py-8">
      {stale && (
        <div
          role="alert"
          className="rounded-card bg-pink flex flex-wrap items-center justify-between gap-4 px-5 py-4"
        >
          <p className="text-[15px]">자소서가 바뀌어 이 점검은 더 진행할 수 없어요.</p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={restart.busy}
            onClick={startNewCheck}
          >
            새 점검 시작
          </button>
          <AiStatus
            busy={restart.busy}
            failed={restart.failed}
            error={restart.error}
            onRetry={restart.retry}
          />
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid justify-items-start gap-2">
          <StageChip stage="check" />
          <h1 className="page-title md:text-[36px]">면접관처럼 문장마다 근거를 물어봐요</h1>
        </div>
        <div className="grid min-w-[200px] gap-1.5">
          <p className="meta">{`끝난 문장 ${done} / 전체 ${sentences.length}`}</p>
          <Meter cells={sentences.map(isFinished)} />
        </div>
      </div>

      <div className="grid items-start gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="grid content-start gap-2.5">
          <h2 className="label">점검할 문장</h2>
          {sentences.length === 0 ? (
            <div className="row-pending rounded-row flex flex-col items-start gap-4 p-5">
              <p className="text-[15px]">점검할 주장 문장을 찾지 못했어요.</p>
              <Link
                to={`/cover-letters/${check.coverLetterId}`}
                className="btn btn-sm btn-secondary"
              >
                자소서로 돌아가기
              </Link>
            </div>
          ) : (
            <ul className="grid gap-2.5" aria-label="점검할 문장 목록">
              {sentences.map((s) => {
                const on = s.id === currentId
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      aria-current={on ? 'true' : undefined}
                      onClick={() => setCurrentId(s.id)}
                      className={`rounded-row focus-visible:outline-ink grid w-full cursor-pointer gap-1.5 border px-3.5 py-3 text-left text-[15px] transition-[background-color,border-color] duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${on ? 'border-ink bg-cream shadow-[inset_0_0_0_1px_var(--color-ink)]' : 'border-line bg-canvas hover:bg-fill'}`}
                    >
                      <SentenceChip status={s.status} />
                      <span>{s.text}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>

        <div className="grid content-start gap-5">
          {current && (
            <StageBlock stage="check" className="md:p-7">
              <section aria-label="현재 문장" className="grid gap-5">
                <div className="grid gap-3">
                  <SentenceChip status={current.status} />
                  <blockquote className="text-[22px] leading-[1.5] tracking-[-0.02em]">
                    <span aria-hidden>“</span>
                    <span>{current.text}</span>
                    <span aria-hidden>”</span>
                  </blockquote>
                </div>

                {current.turns.length > 0 && (
                  <ol className="grid gap-4" aria-label="질문과 답">
                    {current.turns.map((turn, i) => (
                      <li key={i} className="grid gap-1.5 text-[15px]">
                        <p className="font-semibold">
                          <span>질문</span>
                          <span aria-hidden> · </span>
                          <span>{turn.question}</span>
                        </p>
                        {turn.answer !== null && (
                          <p>
                            <span className="text-ink-60">내 답</span>
                            <span aria-hidden className="text-ink-60">
                              {' · '}
                            </span>
                            <span>{turn.answer}</span>
                          </p>
                        )}
                        {turn.judge.length > 0 && (
                          <ul className="mt-1 flex flex-wrap gap-1.5" aria-label="판정">
                            {turn.judge.map((j) => (
                              <li
                                key={j.id}
                                className={`chip ${j.result === 'met' ? 'chip-ok' : 'chip-miss'}`}
                              >
                                <span>{JUDGE_LABELS[j.id]}</span>
                                <span aria-hidden>·</span>
                                <span>{JUDGE_RESULT_LABELS[j.result]}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}

                <AiStatus busy={ai.busy} failed={ai.failed} error={ai.error} onRetry={ai.retry} />

                {answering && (
                  <form
                    onSubmit={send}
                    className="border-line grid gap-3 border-t pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                  >
                    <div className="grid gap-1.5">
                      <label htmlFor="check-answer" className="label">
                        답변
                      </label>
                      <textarea
                        id="check-answer"
                        className="field resize-y"
                        rows={3}
                        value={answer}
                        disabled={stale}
                        onChange={(e) => setAnswer(e.target.value)}
                      />
                      <p className="meta">{`남은 추가 질문 ${current.followUpsLeft}개`}</p>
                    </div>
                    <button
                      type="submit"
                      className={`btn justify-self-start md:mb-6 ${stale ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={stale || ai.busy || !answer.trim()}
                    >
                      답하기
                    </button>
                  </form>
                )}

                {isFinished(current) && (
                  <div className="border-line grid gap-3 border-t pt-4">
                    {nextPending ? (
                      <div>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          disabled={stale || ai.busy}
                          onClick={() => start(nextPending.id)}
                        >
                          다음 문장
                        </button>
                      </div>
                    ) : (
                      <p className="text-[15px]">모든 문장을 점검했어요.</p>
                    )}
                    {(current.status === 'needs_more' || current.status === 'unknown') && (
                      <FixActions key={current.id} check={check} sentence={current} />
                    )}
                  </div>
                )}
              </section>
            </StageBlock>
          )}

          <CheckCandidates
            check={check}
            onResolved={(factId) =>
              setCheck((c) => ({ ...c, candidates: c.candidates.filter((f) => f.id !== factId) }))
            }
          />
        </div>
      </div>
    </main>
  )
}
