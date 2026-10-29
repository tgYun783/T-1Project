import type {
  AuthResult,
  Check,
  CheckSentence,
  Clue,
  CoverLetter,
  CoverLetterItem,
  Experience,
  Fact,
  FactSource,
  Item,
  ItemStatusMap,
  Message,
  User,
} from '@/api/types'

export class ApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 't1-token'
/** 401을 받아 토큰을 지웠을 때 window에 알리는 이벤트. AuthProvider가 듣고 로그인 상태를 비운다. */
export const UNAUTHORIZED_EVENT = 't1-unauthorized'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // 저장소를 못 쓰면 토큰을 남기지 못한다.
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 위와 같음
  }
}

// 주소는 항상 상대 경로. 토큰은 localStorage에 두고 모든 요청에 Bearer로 보낸다.
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  const init: RequestInit = { method, headers }
  if (body instanceof FormData) {
    init.body = body
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError(0, 'NETWORK', '서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.')
  }
  if (res.status === 204) return undefined as T

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401) {
      clearToken()
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    const error = data?.error
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? '요청을 처리하지 못했어요.',
    )
  }
  return data as T
}

async function authenticate(path: string, email: string, password: string) {
  const res = await request<AuthResult>('POST', path, { email, password })
  setToken(res.token)
  return res
}

export type ClueInput =
  | { type: 'text'; text: string }
  | { type: 'photo' | 'award' | 'document'; file: File; description?: string }
export type ConfirmFactInput = {
  text?: string
  item?: Item
  source: FactSource
  clueId?: string
}
export type FactPatch = { text?: string; item?: Item; source?: FactSource; clueId?: string }
export type GenerateInput = {
  title?: string
  preferred: string
  talent: string
  questions: string[]
}
export type ConfirmCandidateInput = {
  experienceId: string
  item: Item
  text?: string
  source: FactSource
  clueId?: string
}

const exp = (id: string) => `/experiences/${id}`
const letterItem = (id: string, itemId: string) => `/cover-letters/${id}/items/${itemId}`
const checkSentence = (checkId: string, sentenceId: string) =>
  `/checks/${checkId}/sentences/${sentenceId}`

export const api = {
  signup: (email: string, password: string) => authenticate('/auth/signup', email, password),
  login: (email: string, password: string) => authenticate('/auth/login', email, password),
  me: () => request<{ user: User }>('GET', '/auth/me'),

  createExperience: (input: { title: string; period: string }) =>
    request<{ experience: Experience }>('POST', '/experiences', input),
  listExperiences: () => request<{ experiences: Experience[] }>('GET', '/experiences'),
  getExperience: (id: string) => request<{ experience: Experience }>('GET', exp(id)),
  updateExperience: (id: string, input: { title?: string; period?: string }) =>
    request<{ experience: Experience }>('PATCH', exp(id), input),
  addClue: (id: string, input: ClueInput) => {
    if (input.type === 'text') return request<{ clue: Clue }>('POST', `${exp(id)}/clues`, input)
    const form = new FormData()
    form.append('type', input.type)
    form.append('file', input.file)
    if (input.description) form.append('description', input.description)
    return request<{ clue: Clue }>('POST', `${exp(id)}/clues`, form)
  },
  clueFileUrl: (id: string, clueId: string) => `/api${exp(id)}/clues/${clueId}/file`,

  getConversation: (id: string) =>
    request<{ messages: Message[]; itemStatus: ItemStatusMap; candidates: Fact[] }>(
      'GET',
      `${exp(id)}/conversation`,
    ),
  startConversation: (id: string) =>
    request<{ question: Message; itemStatus: ItemStatusMap }>(
      'POST',
      `${exp(id)}/conversation/start`,
    ),
  answerConversation: (id: string, text: string) =>
    request<{
      answer: Message
      question: Message
      itemStatus: ItemStatusMap
      newCandidates: Fact[]
    }>('POST', `${exp(id)}/conversation/answers`, { text }),

  confirmFact: (id: string, factId: string, input: ConfirmFactInput) =>
    request<{ fact: Fact }>('POST', `${exp(id)}/facts/${factId}/confirm`, input),
  updateFact: (id: string, factId: string, input: FactPatch) =>
    request<{ fact: Fact }>('PATCH', `${exp(id)}/facts/${factId}`, input),
  deleteFact: (id: string, factId: string) => request<void>('DELETE', `${exp(id)}/facts/${factId}`),
  addFact: (id: string, input: { item: Item; text: string; source: FactSource; clueId?: string }) =>
    request<{ fact: Fact }>('POST', `${exp(id)}/facts`, input),

  createCoverLetter: (input: { title?: string; body: string }) =>
    request<{ coverLetter: CoverLetter }>('POST', '/cover-letters', input),
  listCoverLetters: () => request<{ coverLetters: CoverLetter[] }>('GET', '/cover-letters'),
  getCoverLetter: (id: string) =>
    request<{ coverLetter: CoverLetter; experiences: Experience[] }>('GET', `/cover-letters/${id}`),
  updateCoverLetter: (id: string, input: { title?: string; body?: string }) =>
    request<{ coverLetter: CoverLetter }>('PATCH', `/cover-letters/${id}`, input),
  updateItemAnswer: (id: string, itemId: string, answer: string) =>
    request<{ item: CoverLetterItem }>('PATCH', letterItem(id, itemId), { answer }),
  generateCoverLetter: (input: GenerateInput) =>
    request<{ coverLetter: CoverLetter }>('POST', '/cover-letters/generate', input),
  recommend: (id: string, itemId: string) =>
    request<{ item: CoverLetterItem }>('POST', `${letterItem(id, itemId)}/recommendations`),
  selectExperiences: (id: string, itemId: string, experienceIds: string[]) =>
    request<{
      item: CoverLetterItem
      usedElsewhere: { experienceId: string; itemIds: string[] }[]
    }>('PUT', `${letterItem(id, itemId)}/experiences`, { experienceIds }),
  makeAnswer: (id: string, itemId: string, confirmOverwrite?: boolean) =>
    request<{ item: CoverLetterItem }>(
      'POST',
      `${letterItem(id, itemId)}/answer`,
      confirmOverwrite === undefined ? {} : { confirmOverwrite },
    ),

  createCheck: (coverLetterId: string) =>
    request<{ check: Check }>('POST', `/cover-letters/${coverLetterId}/checks`),
  getCheck: (checkId: string) => request<{ check: Check }>('GET', `/checks/${checkId}`),
  listChecks: (coverLetterId: string) =>
    request<{ checks: Check[] }>('GET', `/cover-letters/${coverLetterId}/checks`),
  startSentence: (checkId: string, sentenceId: string) =>
    request<{ sentence: CheckSentence }>('POST', `${checkSentence(checkId, sentenceId)}/start`),
  answerSentence: (checkId: string, sentenceId: string, text: string) =>
    // 점검 후보는 제안 경험(experienceId)을 함께 단다(api.md 9절).
    request<{ sentence: CheckSentence; newCandidates: Check['candidates'] }>(
      'POST',
      `${checkSentence(checkId, sentenceId)}/answers`,
      { text },
    ),
  confirmCandidate: (checkId: string, factId: string, input: ConfirmCandidateInput) =>
    request<{ fact: Fact }>('POST', `/checks/${checkId}/candidates/${factId}/confirm`, input),
  discardCandidate: (checkId: string, factId: string) =>
    request<void>('DELETE', `/checks/${checkId}/candidates/${factId}`),
}
