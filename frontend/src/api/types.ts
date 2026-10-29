// docs/api.md 2절 데이터 모양. 서버 명세가 바뀌면 이 파일부터 고친다.

export type Item = 'situation' | 'role' | 'action' | 'result' | 'meaning'
export type ItemStatus = 'explained' | 'needs_more' | 'unknown' | null
export type ItemStatusMap = Record<Item, ItemStatus>
export type FactSource = 'said' | 'clue'

export type Fact = {
  id: string
  item: Item
  text: string
  status: 'candidate' | 'confirmed'
  source: 'said' | 'clue' | 'ai_unverified'
  clueId: string | null
  origin: 'conversation' | 'check' | 'manual'
  createdAt: string
}

export type Clue = {
  id: string
  type: 'photo' | 'award' | 'document' | 'text'
  description: string | null
  text: string | null
  fileName: string | null
  createdAt: string
}

export type ActivityDraft = {
  id: string
  title: string
  period: string
  summary: string
  origin: 'ai' | 'manual'
}

export type Resume = {
  text: string | null
  drafts: ActivityDraft[]
  updatedAt: string | null
}

export type Experience = {
  id: string
  title: string
  period: string
  summary: string
  clues: Clue[]
  itemStatus: ItemStatusMap
  card: Record<Item, Fact[]>
  candidates: Fact[]
  createdAt: string
  updatedAt: string
}

export type Message = { role: 'ai' | 'user'; text: string; createdAt: string }

export type CoverLetterItem = {
  id: string
  question: string
  recommendations: { experienceId: string; reason: string }[]
  selectedExperienceIds: string[]
  answer: string | null
  usedExperienceIds: string[]
  answerEdited: boolean
}

export type CoverLetter = {
  id: string
  kind: 'pasted' | 'generated'
  title: string | null
  body: string | null
  target: { preferred: string; talent: string } | null
  items: CoverLetterItem[]
  createdAt: string
  updatedAt: string
}

export type SentenceStatus = 'pending' | 'in_progress' | 'explained' | 'needs_more' | 'unknown'
export type JudgeResult = { id: 'J1' | 'J2' | 'J3' | 'J4'; result: 'met' | 'missing' }

export type CheckSentence = {
  id: string
  text: string
  coverLetterItemId: string | null
  status: SentenceStatus
  turns: { question: string; answer: string | null; judge: JudgeResult[] }[]
  followUpsLeft: number
}

export type Check = {
  id: string
  coverLetterId: string
  stale: boolean
  sentences: CheckSentence[]
  candidates: (Fact & { experienceId: string | null })[]
  createdAt: string
}

export type User = { id: string; email: string }
export type AuthResult = { token: string; user: User }
