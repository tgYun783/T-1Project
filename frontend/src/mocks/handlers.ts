// docs/api.md를 따르는 목 API. 실제 서버가 붙으면 VITE_API_MOCK=false로 끈다.
// AI 결과는 specs/mock-data.md 「AI 고정 동작」대로 고정한다.
import { delay, http, HttpResponse } from 'msw'
import type { CoverLetterItem, Fact, FactSource, Item, JudgeResult, Message } from '@/api/types'
import {
  emptyCard,
  emptyStatus,
  getDb,
  getFile,
  ITEM_QUESTIONS,
  ITEMS,
  newId,
  now,
  save,
  saveFile,
  type StoredCheck,
  type StoredCheckSentence,
  type StoredCoverLetter,
  type StoredExperience,
  toCheck,
  toCheckSentence,
  toCoverLetter,
  toExperience,
  tokenFor,
  userFromToken,
} from '@/mocks/db'

const fail = (status: number, code: string, message: string) =>
  HttpResponse.json({ error: { code, message } }, { status })

const wait = (ms: number) => delay(import.meta.env.MODE === 'test' ? 0 : ms)
// AI를 부르는 목 경로는 응답 전에 800ms 기다린다(mock-data.md).
const AI_DELAY = 800

const publicUser = (u: { id: string; email: string }) => ({ id: u.id, email: u.email })

const unauthenticated = () => fail(401, 'UNAUTHENTICATED', '로그인이 필요해요.')
const notFound = () => fail(404, 'NOT_FOUND', '찾을 수 없어요.')
const invalid = (field: string, reason: string) =>
  HttpResponse.json(
    {
      error: { code: 'VALIDATION', message: '입력을 확인해 주세요.', details: [{ field, reason }] },
    },
    { status: 400 },
  )

const isItem = (value: unknown): value is Item => ITEMS.includes(value as Item)
const isFactSource = (value: unknown): value is FactSource => value === 'said' || value === 'clue'
const isBlank = (value: unknown) => typeof value !== 'string' || value.trim() === ''

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null)
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
}

/** 토큰의 계정이 가진 경험. 다른 계정의 것이면 null(→ 404, api.md 1절). */
function findExperience(request: Request, id: string) {
  const user = userFromToken(request.headers.get('Authorization'))
  if (!user) return { user: null, experience: null }
  const experience = getDb().experiences.find((e) => e.id === id && e.userId === user.id) ?? null
  return { user, experience }
}

function touch(experience: StoredExperience) {
  experience.updatedAt = now()
  save()
}

/** 출처가 clue면 이 경험의 단서 id가 있어야 한다. 문제가 있으면 오류 응답을 돌려준다. */
function checkClue(experience: StoredExperience, source: FactSource, clueId: unknown) {
  if (source !== 'clue') return null
  if (typeof clueId !== 'string' || !experience.clues.some((c) => c.id === clueId))
    return invalid('clueId', '이 경험의 단서를 골라 주세요.')
  return null
}

function removeFact(experience: StoredExperience, factId: string): Fact | null {
  const candidateIndex = experience.candidates.findIndex((f) => f.id === factId)
  if (candidateIndex >= 0) return experience.candidates.splice(candidateIndex, 1)[0]
  for (const item of ITEMS) {
    const index = experience.card[item].findIndex((f) => f.id === factId)
    if (index >= 0) return experience.card[item].splice(index, 1)[0]
  }
  return null
}

const authHandlers = [
  http.post('/api/auth/signup', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password)
      return fail(400, 'VALIDATION', '이메일과 비밀번호를 확인해 주세요.')
    const db = getDb()
    if (db.users.some((u) => u.email === email))
      return fail(409, 'EMAIL_TAKEN', '이미 가입된 이메일이에요.')
    const user = { id: newId(), email, password }
    db.users.push(user)
    save()
    return HttpResponse.json({ token: tokenFor(user.id), user: publicUser(user) }, { status: 201 })
  }),

  http.post('/api/auth/login', async ({ request }) => {
    await wait(300)
    const { email, password } = (await request.json()) as { email?: string; password?: string }
    const user = getDb().users.find((u) => u.email === email && u.password === password)
    if (!user) return fail(401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호가 맞지 않아요.')
    return HttpResponse.json({ token: tokenFor(user.id), user: publicUser(user) })
  }),

  http.get('/api/auth/me', ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    return HttpResponse.json({ user: publicUser(user) })
  }),
]

// api.md 4절
const experienceHandlers = [
  http.post('/api/experiences', async ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const { title, period } = await readJson(request)
    if (isBlank(title)) return invalid('title', '필수 입력이에요.')
    if (isBlank(period)) return invalid('period', '필수 입력이에요.')
    const at = now()
    const experience: StoredExperience = {
      id: newId(),
      userId: user.id,
      title: (title as string).trim(),
      period: (period as string).trim(),
      clues: [],
      itemStatus: emptyStatus(),
      card: emptyCard(),
      candidates: [],
      messages: [],
      createdAt: at,
      updatedAt: at,
    }
    getDb().experiences.push(experience)
    save()
    return HttpResponse.json({ experience: toExperience(experience) }, { status: 201 })
  }),

  http.get('/api/experiences', ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const experiences = getDb()
      .experiences.filter((e) => e.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toExperience)
    return HttpResponse.json({ experiences })
  }),

  http.get<{ id: string }>('/api/experiences/:id', ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    return HttpResponse.json({ experience: toExperience(experience) })
  }),

  http.patch<{ id: string }>('/api/experiences/:id', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const { title, period } = await readJson(request)
    if (title !== undefined && isBlank(title)) return invalid('title', '필수 입력이에요.')
    if (period !== undefined && isBlank(period)) return invalid('period', '필수 입력이에요.')
    if (typeof title === 'string') experience.title = title.trim()
    if (typeof period === 'string') experience.period = period.trim()
    touch(experience)
    return HttpResponse.json({ experience: toExperience(experience) })
  }),

  http.post<{ id: string }>('/api/experiences/:id/clues', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const id = newId()
    const createdAt = now()

    if (request.headers.get('Content-Type')?.includes('multipart/form-data')) {
      const form = await request.formData()
      const type = form.get('type')
      const file = form.get('file')
      const description = form.get('description')
      if (type !== 'photo' && type !== 'award' && type !== 'document')
        return invalid('type', '단서 종류를 골라 주세요.')
      if (!(file instanceof File)) return invalid('file', '파일을 골라 주세요.')
      saveFile(id, file)
      const clue = {
        id,
        type,
        description: typeof description === 'string' && description.trim() ? description : null,
        text: null,
        fileName: file.name,
        createdAt,
      } as const
      experience.clues.push(clue)
      touch(experience)
      return HttpResponse.json({ clue }, { status: 201 })
    }

    const { type, text } = await readJson(request)
    if (type !== 'text') return invalid('type', '단서 종류를 골라 주세요.')
    if (isBlank(text)) return invalid('text', '필수 입력이에요.')
    const clue = {
      id,
      type,
      description: null,
      text: text as string,
      fileName: null,
      createdAt,
    } as const
    experience.clues.push(clue)
    touch(experience)
    return HttpResponse.json({ clue }, { status: 201 })
  }),

  http.get<{ id: string; clueId: string }>(
    '/api/experiences/:id/clues/:clueId/file',
    ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      const file = experience?.clues.some((c) => c.id === params.clueId)
        ? getFile(params.clueId)
        : null
      if (!file) return notFound()
      return new HttpResponse(file, {
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
      })
    },
  ),
]

// api.md 5절. 질문·상태·후보는 mock-data.md 「경험 대화」 고정 동작.
const conversationHandlers = [
  http.get<{ id: string }>('/api/experiences/:id/conversation', ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    return HttpResponse.json({
      messages: experience.messages,
      itemStatus: experience.itemStatus,
      candidates: experience.candidates,
    })
  }),

  http.post<{ id: string }>(
    '/api/experiences/:id/conversation/start',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      await wait(AI_DELAY)
      // 이미 대화가 있으면 마지막 AI 질문을 돌려준다(대화 이어가기).
      const lastQuestion = experience.messages.findLast((m) => m.role === 'ai')
      if (lastQuestion)
        return HttpResponse.json({ question: lastQuestion, itemStatus: experience.itemStatus })
      const question: Message = { role: 'ai', text: ITEM_QUESTIONS.situation, createdAt: now() }
      experience.messages.push(question)
      touch(experience)
      return HttpResponse.json({ question, itemStatus: experience.itemStatus })
    },
  ),

  http.post<{ id: string }>(
    '/api/experiences/:id/conversation/answers',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const { text } = await readJson(request)
      if (isBlank(text)) return invalid('text', '답변을 입력해 주세요.')
      if (experience.messages.length === 0)
        return fail(409, 'CONVERSATION_NOT_STARTED', '대화를 먼저 시작해 주세요.')
      await wait(AI_DELAY)

      // 아직 explained가 아닌 첫 항목을 explained로 바꾸고, 그 다음 항목을 묻는다.
      // 다섯 항목이 모두 explained면 마지막 항목(의의)의 답으로 보고 같은 질문을 다시 낸다.
      const answered =
        ITEMS.find((item) => experience.itemStatus[item] !== 'explained') ?? 'meaning'
      experience.itemStatus = { ...experience.itemStatus, [answered]: 'explained' }
      const next = ITEMS.find((item) => experience.itemStatus[item] !== 'explained') ?? 'meaning'

      const answer: Message = { role: 'user', text: text as string, createdAt: now() }
      const question: Message = { role: 'ai', text: ITEM_QUESTIONS[next], createdAt: now() }
      const candidate: Fact = {
        id: newId(),
        item: answered,
        text: text as string,
        status: 'candidate',
        source: 'ai_unverified',
        clueId: null,
        origin: 'conversation',
        createdAt: answer.createdAt,
      }
      experience.messages.push(answer, question)
      experience.candidates.push(candidate)
      touch(experience)
      return HttpResponse.json({
        answer,
        question,
        itemStatus: experience.itemStatus,
        newCandidates: [candidate],
      })
    },
  ),
]

// api.md 6절
const factHandlers = [
  http.post<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId/confirm',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const candidate = experience.candidates.find((f) => f.id === params.factId)
      if (!candidate) return notFound()
      const { text, item, source, clueId } = await readJson(request)
      // 확인하지 않은 것은 사실이 되지 않는다(C1): ai_unverified는 받지 않는다.
      if (!isFactSource(source))
        return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
      if (text !== undefined && isBlank(text)) return invalid('text', '필수 입력이에요.')
      if (item !== undefined && !isItem(item)) return invalid('item', '항목을 골라 주세요.')
      const clueError = checkClue(experience, source, clueId)
      if (clueError) return clueError

      removeFact(experience, candidate.id)
      const fact: Fact = {
        ...candidate,
        text: typeof text === 'string' ? text.trim() : candidate.text,
        item: isItem(item) ? item : candidate.item,
        status: 'confirmed',
        source,
        clueId: source === 'clue' ? (clueId as string) : null,
      }
      experience.card[fact.item].push(fact)
      touch(experience)
      return HttpResponse.json({ fact })
    },
  ),

  http.patch<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId',
    async ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      const { text, item, source, clueId } = await readJson(request)
      if (text !== undefined && isBlank(text)) return invalid('text', '필수 입력이에요.')
      if (item !== undefined && !isItem(item)) return invalid('item', '항목을 골라 주세요.')
      if (source !== undefined && !isFactSource(source))
        return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
      if (isFactSource(source)) {
        const clueError = checkClue(experience, source, clueId)
        if (clueError) return clueError
      }

      const fact =
        experience.candidates.find((f) => f.id === params.factId) ??
        ITEMS.flatMap((i) => experience.card[i]).find((f) => f.id === params.factId)
      if (!fact) return notFound()
      if (typeof text === 'string') fact.text = text.trim()
      // 후보의 출처는 확정할 때만 정한다(C1). 후보 고치기는 내용·항목만 바꾼다.
      if (fact.status === 'confirmed' && isFactSource(source)) {
        fact.source = source
        fact.clueId = source === 'clue' ? (clueId as string) : null
      }
      if (isItem(item) && item !== fact.item) {
        if (fact.status === 'confirmed') {
          removeFact(experience, fact.id)
          experience.card[item].push(fact)
        }
        fact.item = item
      }
      touch(experience)
      return HttpResponse.json({ fact })
    },
  ),

  http.delete<{ id: string; factId: string }>(
    '/api/experiences/:id/facts/:factId',
    ({ request, params }) => {
      const { user, experience } = findExperience(request, params.id)
      if (!user) return unauthenticated()
      if (!experience) return notFound()
      if (!removeFact(experience, params.factId)) return notFound()
      touch(experience)
      return new HttpResponse(null, { status: 204 })
    },
  ),

  http.post<{ id: string }>('/api/experiences/:id/facts', async ({ request, params }) => {
    const { user, experience } = findExperience(request, params.id)
    if (!user) return unauthenticated()
    if (!experience) return notFound()
    const { item, text, source, clueId } = await readJson(request)
    if (!isItem(item)) return invalid('item', '항목을 골라 주세요.')
    if (isBlank(text)) return invalid('text', '필수 입력이에요.')
    if (!isFactSource(source)) return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
    const clueError = checkClue(experience, source, clueId)
    if (clueError) return clueError
    // 사용자가 직접 쓴 것이므로 바로 확정한다.
    const fact: Fact = {
      id: newId(),
      item,
      text: (text as string).trim(),
      status: 'confirmed',
      source,
      clueId: source === 'clue' ? (clueId as string) : null,
      origin: 'manual',
      createdAt: now(),
    }
    experience.card[item].push(fact)
    touch(experience)
    return HttpResponse.json({ fact }, { status: 201 })
  }),
]

/** 토큰의 계정이 가진 자소서. 다른 계정의 것이면 null(→ 404, api.md 1절). */
function findCoverLetter(request: Request, id: string) {
  const user = userFromToken(request.headers.get('Authorization'))
  if (!user) return { user: null, coverLetter: null }
  const coverLetter = getDb().coverLetters.find((c) => c.id === id && c.userId === user.id) ?? null
  return { user, coverLetter }
}

function findLetterItem(request: Request, id: string, itemId: string) {
  const { user, coverLetter } = findCoverLetter(request, id)
  const item = coverLetter?.items.find((i) => i.id === itemId) ?? null
  return { user, coverLetter, item }
}

function touchLetter(coverLetter: StoredCoverLetter) {
  coverLetter.updatedAt = now()
  save()
}

/** 자소서가 바뀌면 그 자소서의 기존 점검은 모두 오래됨이 된다(api.md 9절). */
function markChecksStale(coverLetter: StoredCoverLetter) {
  for (const check of getDb().checks) {
    if (check.coverLetterId === coverLetter.id) check.stale = true
  }
}

const optionalTitle = (title: unknown) =>
  typeof title === 'string' && title.trim() ? title.trim() : null

const confirmedFacts = (experience: StoredExperience) => ITEMS.flatMap((i) => experience.card[i])
const hasConfirmedFacts = (experience: StoredExperience) => confirmedFacts(experience).length > 0
const userExperiences = (userId: string) => getDb().experiences.filter((e) => e.userId === userId)

// 카드 추천 이유(mock-data.md 「카드 추천」).
const TEAM_REASON = '팀장으로 범위를 정한 경험이 문항과 맞아요'
const BUILD_REASON = '직접 만든 기능과 결과가 문항과 맞아요'
const HACKATHON_ID = 'seed-exp-hackathon'

/** 확정 사실이 있는 경험 모두를 추천한다. 협업·팀 문항이면 해커톤 카드를 앞에 두고 팀장 이유를 붙인다. */
function recommendFor(question: string, experiences: StoredExperience[]) {
  const team = /협업|팀/.test(question)
  const cards = experiences.filter(hasConfirmedFacts)
  if (team) cards.sort((a, b) => Number(b.id === HACKATHON_ID) - Number(a.id === HACKATHON_ID))
  return cards.map((e) => ({
    experienceId: e.id,
    reason: team && e.id === HACKATHON_ID ? TEAM_REASON : BUILD_REASON,
  }))
}

/** 고른 카드의 확정 사실만 이어 붙여 한 문단으로 만든다. 카드에 없는 숫자는 넣지 않는다. */
function answerFrom(experiences: StoredExperience[]) {
  return experiences
    .flatMap(confirmedFacts)
    .map((f) => f.text.trim())
    .map((text) => (/[.!?]$/.test(text) ? text : `${text}.`))
    .join(' ')
}

const noConfirmedFacts = (experienceIds: string[] = []) =>
  HttpResponse.json(
    {
      error: {
        code: 'NO_CONFIRMED_FACTS',
        message: '확정된 사실이 있는 경험 카드가 없어요.',
        details: experienceIds.map((experienceId) => ({
          field: 'experienceIds',
          reason: experienceId,
        })),
      },
    },
    { status: 400 },
  )

// api.md 7·8절. 추천·응답은 mock-data.md 고정 동작.
const coverLetterHandlers = [
  http.post('/api/cover-letters', async ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const { title, body } = await readJson(request)
    if (isBlank(body)) return invalid('body', '본문을 입력해 주세요.')
    const at = now()
    const coverLetter: StoredCoverLetter = {
      id: newId(),
      userId: user.id,
      kind: 'pasted',
      title: optionalTitle(title),
      body: body as string,
      target: null,
      items: [],
      createdAt: at,
      updatedAt: at,
    }
    getDb().coverLetters.push(coverLetter)
    save()
    return HttpResponse.json({ coverLetter: toCoverLetter(coverLetter) }, { status: 201 })
  }),

  http.get('/api/cover-letters', ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const coverLetters = getDb()
      .coverLetters.filter((c) => c.userId === user.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(toCoverLetter)
    return HttpResponse.json({ coverLetters })
  }),

  http.post('/api/cover-letters/generate', async ({ request }) => {
    const user = userFromToken(request.headers.get('Authorization'))
    if (!user) return unauthenticated()
    const { title, preferred, talent, questions } = await readJson(request)
    if (isBlank(preferred)) return invalid('preferred', '필수 입력이에요.')
    if (isBlank(talent)) return invalid('talent', '필수 입력이에요.')
    const filled = Array.isArray(questions)
      ? questions.filter((q): q is string => !isBlank(q)).map((q) => q.trim())
      : []
    if (filled.length === 0) return invalid('questions', '필수 입력이에요.')
    const at = now()
    const coverLetter: StoredCoverLetter = {
      id: newId(),
      userId: user.id,
      kind: 'generated',
      title: optionalTitle(title),
      body: null,
      target: { preferred: (preferred as string).trim(), talent: (talent as string).trim() },
      items: filled.map((question): CoverLetterItem => ({
        id: newId(),
        question,
        recommendations: [],
        selectedExperienceIds: [],
        answer: null,
        usedExperienceIds: [],
        answerEdited: false,
      })),
      createdAt: at,
      updatedAt: at,
    }
    getDb().coverLetters.push(coverLetter)
    save()
    return HttpResponse.json({ coverLetter: toCoverLetter(coverLetter) }, { status: 201 })
  }),

  http.get<{ id: string }>('/api/cover-letters/:id', ({ request, params }) => {
    const { user, coverLetter } = findCoverLetter(request, params.id)
    if (!user) return unauthenticated()
    if (!coverLetter) return notFound()
    // 문항 응답들이 근거로 쓴 경험 카드(R13).
    const used = new Set(coverLetter.items.flatMap((i) => i.usedExperienceIds))
    const experiences = userExperiences(user.id)
      .filter((e) => used.has(e.id))
      .map(toExperience)
    return HttpResponse.json({ coverLetter: toCoverLetter(coverLetter), experiences })
  }),

  http.patch<{ id: string }>('/api/cover-letters/:id', async ({ request, params }) => {
    const { user, coverLetter } = findCoverLetter(request, params.id)
    if (!user) return unauthenticated()
    if (!coverLetter) return notFound()
    const { title, body } = await readJson(request)
    if (body !== undefined) {
      // 생성한 자소서의 응답은 문항별 API로 고친다.
      if (coverLetter.kind === 'generated')
        return invalid('body', '작성한 자소서는 문항별로 고쳐 주세요.')
      if (isBlank(body)) return invalid('body', '본문을 입력해 주세요.')
      coverLetter.body = body as string
    }
    if (title !== undefined) coverLetter.title = optionalTitle(title)
    markChecksStale(coverLetter)
    touchLetter(coverLetter)
    return HttpResponse.json({ coverLetter: toCoverLetter(coverLetter) })
  }),

  http.patch<{ id: string; itemId: string }>(
    '/api/cover-letters/:id/items/:itemId',
    async ({ request, params }) => {
      const { user, coverLetter, item } = findLetterItem(request, params.id, params.itemId)
      if (!user) return unauthenticated()
      if (!coverLetter || !item) return notFound()
      const { answer } = await readJson(request)
      if (isBlank(answer)) return invalid('answer', '응답을 입력해 주세요.')
      item.answer = answer as string
      item.answerEdited = true
      markChecksStale(coverLetter)
      touchLetter(coverLetter)
      return HttpResponse.json({ item })
    },
  ),

  http.post<{ id: string; itemId: string }>(
    '/api/cover-letters/:id/items/:itemId/recommendations',
    async ({ request, params }) => {
      const { user, coverLetter, item } = findLetterItem(request, params.id, params.itemId)
      if (!user) return unauthenticated()
      if (!coverLetter || !item) return notFound()
      const experiences = userExperiences(user.id)
      if (!experiences.some(hasConfirmedFacts)) return noConfirmedFacts()
      await wait(AI_DELAY)
      item.recommendations = recommendFor(item.question, experiences)
      touchLetter(coverLetter)
      return HttpResponse.json({ item })
    },
  ),

  http.put<{ id: string; itemId: string }>(
    '/api/cover-letters/:id/items/:itemId/experiences',
    async ({ request, params }) => {
      const { user, coverLetter, item } = findLetterItem(request, params.id, params.itemId)
      if (!user) return unauthenticated()
      if (!coverLetter || !item) return notFound()
      const { experienceIds } = await readJson(request)
      if (!Array.isArray(experienceIds) || experienceIds.some((id) => typeof id !== 'string'))
        return invalid('experienceIds', '카드를 골라 주세요.')
      const ids = [...new Set(experienceIds as string[])]
      const mine = userExperiences(user.id)
      const chosen: StoredExperience[] = []
      for (const id of ids) {
        const experience = mine.find((e) => e.id === id)
        if (!experience) return notFound()
        chosen.push(experience)
      }
      const empty = chosen.filter((e) => !hasConfirmedFacts(e))
      if (empty.length > 0) return noConfirmedFacts(empty.map((e) => e.id))

      item.selectedExperienceIds = ids
      // 이미 다른 문항에 쓴 카드는 막지 않고 알리기만 한다.
      const usedElsewhere = ids
        .map((experienceId) => ({
          experienceId,
          itemIds: coverLetter.items
            .filter((o) => o.id !== item.id && o.selectedExperienceIds.includes(experienceId))
            .map((o) => o.id),
        }))
        .filter((u) => u.itemIds.length > 0)
      touchLetter(coverLetter)
      return HttpResponse.json({ item, usedElsewhere })
    },
  ),

  http.post<{ id: string; itemId: string }>(
    '/api/cover-letters/:id/items/:itemId/answer',
    async ({ request, params }) => {
      const { user, coverLetter, item } = findLetterItem(request, params.id, params.itemId)
      if (!user) return unauthenticated()
      if (!coverLetter || !item) return notFound()
      const { confirmOverwrite } = await readJson(request)
      if (item.selectedExperienceIds.length === 0)
        return invalid('selectedExperienceIds', '이 문항에 쓸 카드를 골라 주세요.')
      // 사용자가 고친 응답은 확인을 받은 뒤에만 덮어쓴다(C4).
      if (item.answer !== null && item.answerEdited && confirmOverwrite !== true)
        return fail(409, 'OVERWRITE_CONFIRM_REQUIRED', '고친 내용이 새 응답으로 바뀌어요.')
      await wait(AI_DELAY)
      const mine = userExperiences(user.id)
      const used = item.selectedExperienceIds
        .map((id) => mine.find((e) => e.id === id))
        .filter((e): e is StoredExperience => e !== undefined)
      item.answer = answerFrom(used)
      item.usedExperienceIds = used.map((e) => e.id)
      item.answerEdited = false
      markChecksStale(coverLetter)
      touchLetter(coverLetter)
      return HttpResponse.json({ item })
    },
  ),
]

type JudgeId = JudgeResult['id']
type SentenceRule = {
  text: string
  question: string
  criteria: JudgeId[]
  factItem: Item
  experienceId: string | null
}

const CAPSTONE_ID = 'seed-exp-capstone'

// 시드 자소서에서 고르는 네 문장과 첫 질문·판정 대상 기준(mock-data.md 「점검 문장 고르기」).
// 후보 항목·경험은 문장이 어느 경험의 어느 항목 이야기인지에 맞춘다.
const SEED_SENTENCE_RULES: SentenceRule[] = [
  {
    text: '저는 캡스톤디자인에서 학과 공지 알림 앱을 개발하며 데이터 기반으로 문제를 해결했습니다.',
    question: "여기서 '데이터 기반'은 어떤 데이터를 어떤 도구로 본 건가요?",
    criteria: ['J3', 'J4'],
    factItem: 'action',
    experienceId: CAPSTONE_ID,
  },
  {
    text: '공지 크롤러를 설계해 학생들의 공지 확인율을 40% 높였고,',
    question: '40%는 무엇과 비교해, 어느 기간에, 어떻게 잰 값인가요?',
    criteria: ['J1', 'J2', 'J4'],
    factItem: 'result',
    experienceId: CAPSTONE_ID,
  },
  {
    text: '팀을 주도해 일정 안에 배포를 마쳤습니다.',
    question: '팀을 주도했다고 하셨는데, 팀에서 본인이 직접 한 일은 무엇이었나요?',
    criteria: ['J2', 'J3'],
    factItem: 'role',
    experienceId: CAPSTONE_ID,
  },
  {
    text: '교내 해커톤에서는 팀장으로서 동아리 회비 정산 서비스를 기획해 수상권에 근접한 성과를 거두었습니다.',
    question: "'수상권에 근접한 성과'는 실제로 어떤 결과였나요?",
    criteria: ['J3', 'J4'],
    factItem: 'result',
    experienceId: HACKATHON_ID,
  },
]

const JUDGE_ORDER: JudgeId[] = ['J1', 'J2', 'J3', 'J4']
const UNKNOWN_ANSWER = /재지|모르|기억|없었/
const ENOUGH_LENGTH = 40
const FOLLOW_UP_QUESTION = '조금 더 구체적으로, 직접 한 행동과 확인한 결과를 말해 주세요.'
const FOLLOW_UPS = 3

const splitSentences = (text: string) =>
  (text.match(/[^.!?]+[.!?]*/g) ?? []).map((s) => s.trim()).filter((s) => s !== '')

/** 시드가 아닌 문장: 숫자·`주도`·`기반`·`성과`가 들면 고른다. 기준은 시드 문장의 짝을 따른다. */
function genericRule(sentence: string): SentenceRule | null {
  const number = /\d+(?:\.\d+)?%?/.exec(sentence)
  const lead = sentence.includes('주도')
  const base = sentence.includes('기반')
  const outcome = sentence.includes('성과')
  if (!number && !lead && !base && !outcome) return null

  const criteria: JudgeId[] = [
    ...(number ? (['J1', 'J2', 'J4'] as const) : []),
    ...(lead ? (['J2', 'J3'] as const) : []),
    ...(base || outcome ? (['J3', 'J4'] as const) : []),
  ]

  const [question, factItem]: [string, Item] = number
    ? [`이 숫자(${number[0]})는 무엇과 비교해, 어느 기간에, 어떻게 잰 값인가요?`, 'result']
    : lead
      ? ['주도했다고 하셨는데, 본인이 직접 한 일은 무엇이었나요?', 'role']
      : base
        ? ["여기서 '기반'은 무엇을 어떤 도구로 본 건가요?", 'action']
        : ["여기서 '성과'는 실제로 어떤 결과였나요?", 'result']

  // 캡스톤·해커톤 중 어느 쪽 이야기인지 알 수 있으면 그 경험을 후보 경험으로 둔다.
  const experienceId = /캡스톤|공지/.test(sentence)
    ? CAPSTONE_ID
    : /해커톤|회비/.test(sentence)
      ? HACKATHON_ID
      : null

  return {
    text: sentence,
    question,
    criteria: JUDGE_ORDER.filter((id) => criteria.includes(id)),
    factItem,
    experienceId,
  }
}

function pickRules(text: string): SentenceRule[] {
  return splitSentences(text).flatMap((sentence) => {
    const seeded = SEED_SENTENCE_RULES.filter((rule) => sentence.includes(rule.text))
    if (seeded.length > 0) return seeded
    const rule = genericRule(sentence)
    return rule ? [rule] : []
  })
}

/** 붙여넣은 자소서는 본문, 생성한 자소서는 문항 응답마다 주장 문장을 고른다. */
function pickSentences(coverLetter: StoredCoverLetter, userId: string): StoredCheckSentence[] {
  const mine = new Set(userExperiences(userId).map((e) => e.id))
  const sources =
    coverLetter.kind === 'pasted'
      ? [{ text: coverLetter.body ?? '', itemId: null, experienceId: undefined }]
      : coverLetter.items
          .filter((i) => i.answer !== null)
          .map((i) => ({
            text: i.answer ?? '',
            itemId: i.id,
            // 생성 자소서의 문장이면 그 문항의 근거 카드 하나를 제안한다.
            experienceId: i.usedExperienceIds[0] ?? null,
          }))
  return sources.flatMap(({ text, itemId, experienceId }) =>
    pickRules(text).map((rule) => {
      const suggested = experienceId === undefined ? rule.experienceId : experienceId
      return {
        id: newId(),
        text: rule.text,
        coverLetterItemId: itemId,
        status: 'pending' as const,
        turns: [],
        followUpsLeft: FOLLOW_UPS,
        criteria: rule.criteria,
        factItem: rule.factItem,
        experienceId: suggested && mine.has(suggested) ? suggested : null,
      }
    }),
  )
}

/** 문장 첫 질문은 그 문장을 고를 때 쓴 규칙의 질문이다. */
function firstQuestion(sentence: StoredCheckSentence) {
  const seeded = SEED_SENTENCE_RULES.find((rule) => rule.text === sentence.text)
  return seeded?.question ?? genericRule(sentence.text)?.question ?? FOLLOW_UP_QUESTION
}

/** 답을 판정하고 문장 상태를 바꾼다(mock-data.md 「점검 답 판정」). */
function judgeAnswer(sentence: StoredCheckSentence, text: string) {
  const turn = sentence.turns[sentence.turns.length - 1]
  turn.answer = text
  // 모름 판정을 J1~J4보다 먼저 한다(R11).
  if (UNKNOWN_ANSWER.test(text)) {
    sentence.status = 'unknown'
    return
  }
  if (text.trim().length >= ENOUGH_LENGTH) {
    turn.judge = sentence.criteria.map((id) => ({ id, result: 'met' }))
    sentence.status = 'explained'
    return
  }
  turn.judge = sentence.criteria.map((id, i) => ({ id, result: i === 0 ? 'missing' : 'met' }))
  if (sentence.followUpsLeft > 0) {
    sentence.turns.push({ question: FOLLOW_UP_QUESTION, answer: null, judge: [] })
    sentence.followUpsLeft -= 1
  } else {
    sentence.status = 'needs_more'
  }
}

/** 토큰의 계정이 가진 점검. 다른 계정의 것이면 null(→ 404, api.md 1절). */
function findCheck(request: Request, checkId: string) {
  const user = userFromToken(request.headers.get('Authorization'))
  if (!user) return { user: null, check: null }
  const check = getDb().checks.find((c) => c.id === checkId && c.userId === user.id) ?? null
  return { user, check }
}

function findSentence(request: Request, checkId: string, sentenceId: string) {
  const { user, check } = findCheck(request, checkId)
  const sentence = check?.sentences.find((s) => s.id === sentenceId) ?? null
  return { user, check, sentence }
}

const checkStale = () => fail(409, 'CHECK_STALE', '자소서가 바뀌어 이 점검은 더 진행할 수 없어요.')
const candidateResolved = () => fail(409, 'CANDIDATE_RESOLVED', '이미 저장하거나 버린 후보예요.')

// api.md 9절. 문장 고르기·판정은 mock-data.md 고정 동작.
const checkHandlers = [
  http.post<{ id: string }>('/api/cover-letters/:id/checks', async ({ request, params }) => {
    const { user, coverLetter } = findCoverLetter(request, params.id)
    if (!user) return unauthenticated()
    if (!coverLetter) return notFound()
    await wait(AI_DELAY)
    const check: StoredCheck = {
      id: newId(),
      userId: user.id,
      coverLetterId: coverLetter.id,
      stale: false,
      sentences: pickSentences(coverLetter, user.id),
      candidates: [],
      resolvedCandidateIds: [],
      createdAt: now(),
    }
    getDb().checks.push(check)
    save()
    return HttpResponse.json({ check: toCheck(check) }, { status: 201 })
  }),

  http.get<{ id: string }>('/api/cover-letters/:id/checks', ({ request, params }) => {
    const { user, coverLetter } = findCoverLetter(request, params.id)
    if (!user) return unauthenticated()
    if (!coverLetter) return notFound()
    // 최신순: 나중에 만든 점검이 앞에 온다.
    const checks = getDb()
      .checks.filter((c) => c.coverLetterId === coverLetter.id)
      .reverse()
      .map(toCheck)
    return HttpResponse.json({ checks })
  }),

  http.get<{ checkId: string }>('/api/checks/:checkId', ({ request, params }) => {
    const { user, check } = findCheck(request, params.checkId)
    if (!user) return unauthenticated()
    if (!check) return notFound()
    return HttpResponse.json({ check: toCheck(check) })
  }),

  http.post<{ checkId: string; sentenceId: string }>(
    '/api/checks/:checkId/sentences/:sentenceId/start',
    async ({ request, params }) => {
      const { user, check, sentence } = findSentence(request, params.checkId, params.sentenceId)
      if (!user) return unauthenticated()
      if (!check || !sentence) return notFound()
      if (check.stale) return checkStale()
      // 이미 시작했으면 지금 상태를 그대로 돌려준다.
      if (sentence.status !== 'pending')
        return HttpResponse.json({ sentence: toCheckSentence(sentence) })
      await wait(AI_DELAY)
      sentence.turns.push({ question: firstQuestion(sentence), answer: null, judge: [] })
      sentence.status = 'in_progress'
      save()
      return HttpResponse.json({ sentence: toCheckSentence(sentence) })
    },
  ),

  http.post<{ checkId: string; sentenceId: string }>(
    '/api/checks/:checkId/sentences/:sentenceId/answers',
    async ({ request, params }) => {
      const { user, check, sentence } = findSentence(request, params.checkId, params.sentenceId)
      if (!user) return unauthenticated()
      if (!check || !sentence) return notFound()
      const { text } = await readJson(request)
      if (isBlank(text)) return invalid('text', '답변을 입력해 주세요.')
      if (check.stale) return checkStale()
      if (sentence.status === 'pending')
        return fail(409, 'SENTENCE_NOT_STARTED', '문장 점검을 먼저 시작해 주세요.')
      if (sentence.status !== 'in_progress')
        return fail(409, 'SENTENCE_FINISHED', '이미 끝난 문장이에요.')
      await wait(AI_DELAY)

      const answer = text as string
      judgeAnswer(sentence, answer)
      // 답 글 전체를 후보 하나로 만든다(R12).
      const candidate: Fact & { experienceId: string | null } = {
        id: newId(),
        item: sentence.factItem,
        text: answer,
        status: 'candidate',
        source: 'ai_unverified',
        clueId: null,
        origin: 'check',
        createdAt: now(),
        experienceId: sentence.experienceId,
      }
      check.candidates.push(candidate)
      save()
      return HttpResponse.json({ sentence: toCheckSentence(sentence), newCandidates: [candidate] })
    },
  ),

  http.post<{ checkId: string; factId: string }>(
    '/api/checks/:checkId/candidates/:factId/confirm',
    async ({ request, params }) => {
      const { user, check } = findCheck(request, params.checkId)
      if (!user) return unauthenticated()
      if (!check) return notFound()
      if (check.resolvedCandidateIds.includes(params.factId)) return candidateResolved()
      const candidate = check.candidates.find((f) => f.id === params.factId)
      if (!candidate) return notFound()
      const { experienceId, item, text, source, clueId } = await readJson(request)
      // 확인하지 않은 것은 사실이 되지 않는다(C1): ai_unverified는 받지 않는다.
      if (!isFactSource(source))
        return invalid('source', '내가 말함 또는 자료로 확인을 골라 주세요.')
      if (!isItem(item)) return invalid('item', '항목을 골라 주세요.')
      if (text !== undefined && isBlank(text)) return invalid('text', '필수 입력이에요.')
      if (typeof experienceId !== 'string') return invalid('experienceId', '경험을 골라 주세요.')
      const experience = userExperiences(user.id).find((e) => e.id === experienceId)
      if (!experience) return notFound()
      const clueError = checkClue(experience, source, clueId)
      if (clueError) return clueError

      const fact: Fact = {
        id: candidate.id,
        item,
        text: typeof text === 'string' ? text.trim() : candidate.text,
        status: 'confirmed',
        source,
        clueId: source === 'clue' ? (clueId as string) : null,
        origin: 'check',
        createdAt: candidate.createdAt,
      }
      experience.card[item].push(fact)
      check.candidates = check.candidates.filter((f) => f.id !== candidate.id)
      check.resolvedCandidateIds.push(candidate.id)
      touch(experience)
      return HttpResponse.json({ fact })
    },
  ),

  http.delete<{ checkId: string; factId: string }>(
    '/api/checks/:checkId/candidates/:factId',
    ({ request, params }) => {
      const { user, check } = findCheck(request, params.checkId)
      if (!user) return unauthenticated()
      if (!check) return notFound()
      if (check.resolvedCandidateIds.includes(params.factId)) return candidateResolved()
      if (!check.candidates.some((f) => f.id === params.factId)) return notFound()
      check.candidates = check.candidates.filter((f) => f.id !== params.factId)
      check.resolvedCandidateIds.push(params.factId)
      save()
      return new HttpResponse(null, { status: 204 })
    },
  ),
]

export const handlers = [
  ...authHandlers,
  ...experienceHandlers,
  ...conversationHandlers,
  ...factHandlers,
  ...coverLetterHandlers,
  ...checkHandlers,
]
