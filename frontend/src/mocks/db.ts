// 백엔드가 붙기 전까지 쓰는 목 데이터. 모양은 docs/api.md 2절, 시드는 specs/mock-data.md 「시드」.
// 새로고침해도 남도록 localStorage에 둔다(실제 서버의 DB 역할).
import type {
  Check,
  CheckSentence,
  CoverLetter,
  Experience,
  Fact,
  Item,
  ItemStatusMap,
  JudgeResult,
  Message,
  User,
} from '@/api/types'

export const SEED_USER = { email: 'seeker@example.com', password: 'loopthon-2026' }

export const ITEMS: Item[] = ['situation', 'role', 'action', 'result', 'meaning']

type StoredUser = User & { password: string }
/** 저장용 경험: 응답에는 userId·messages를 빼고 내보낸다. */
export type StoredExperience = Experience & { userId: string; messages: Message[] }
export type StoredCoverLetter = CoverLetter & { userId: string }
/** 저장용 점검 문장: 판정 대상 기준·후보 항목·후보 경험은 목 판정에만 쓰고 응답에는 뺀다. */
export type StoredCheckSentence = CheckSentence & {
  criteria: JudgeResult['id'][]
  factItem: Item
  experienceId: string | null
}
/** 저장용 점검: 확정하거나 버린 후보 id를 남겨, 다시 오면 409로 알린다. */
export type StoredCheck = Omit<Check, 'sentences'> & {
  userId: string
  sentences: StoredCheckSentence[]
  resolvedCandidateIds: string[]
}

type Db = {
  users: StoredUser[]
  experiences: StoredExperience[]
  coverLetters: StoredCoverLetter[]
  checks: StoredCheck[]
  seq: number
}

// 모양이 바뀌면 키를 올려 예전 저장본을 버린다.
const STORAGE_KEY = 't1-mock-db-v3'
// 처음 쓸 때 만든다.
let db: Db | null = null
// 단서 파일은 보관만 한다. localStorage에 넣기엔 커서 메모리에만 두고, 새로고침하면 사라진다.
const files = new Map<string, File>()

export const emptyStatus = (): ItemStatusMap => ({
  situation: null,
  role: null,
  action: null,
  result: null,
  meaning: null,
})

export const emptyCard = (): Record<Item, Fact[]> => ({
  situation: [],
  role: [],
  action: [],
  result: [],
  meaning: [],
})

/** 경험 대화에서 항목마다 묻는 고정 질문(mock-data.md 「경험 대화」). */
export const ITEM_QUESTIONS: Record<Item, string> = {
  situation: '이 경험에서 해결하려던 문제는 무엇이었나요?',
  role: '그때 본인이 맡은 역할은 무엇이었나요?',
  action: '구체적으로 어떤 행동을 했나요?',
  result: '결과는 어땠나요? 직접 확인한 것만 말해 주세요.',
  meaning: '이 경험이 지금 지원에 어떤 의미가 있나요?',
}

function seed(): Db {
  const userId = 'u1'
  const at = (day: number, minute = 0) => new Date(Date.UTC(2026, 9, day, 9, minute)).toISOString()

  const fact = (
    id: string,
    item: Item,
    text: string,
    origin: Fact['origin'],
    createdAt: string,
  ): Fact => ({
    id,
    item,
    text,
    status: 'confirmed',
    source: 'said',
    clueId: null,
    origin,
    createdAt,
  })

  const capstoneFacts: [Item, string][] = [
    ['situation', '학과 공지가 홈페이지에만 올라와 학생들이 신청 마감을 자주 놓쳤다'],
    ['role', '4명 팀에서 백엔드와 공지 크롤러를 맡았다. 팀장은 다른 팀원이었다'],
    ['action', '공지 게시판을 10분마다 확인해 새 글이 올라오면 앱 푸시를 보내는 크롤러를 만들었다'],
    [
      'result',
      '학과 단톡방에 공유해 한 학기 동안 시험 운영했고, 공지를 놓쳤다는 말이 줄었다는 반응을 들었다. 사용자 수나 확인율은 따로 재지 않았다',
    ],
  ]
  const capstoneCard = emptyCard()
  const capstoneMessages: Message[] = []
  capstoneFacts.forEach(([item, text], i) => {
    capstoneMessages.push({ role: 'ai', text: ITEM_QUESTIONS[item], createdAt: at(20, i * 2) })
    capstoneMessages.push({ role: 'user', text, createdAt: at(20, i * 2 + 1) })
    capstoneCard[item].push(
      fact(`seed-fact-c${i + 1}`, item, text, 'conversation', at(20, i * 2 + 1)),
    )
  })
  capstoneMessages.push({ role: 'ai', text: ITEM_QUESTIONS.meaning, createdAt: at(20, 8) })

  const capstone: StoredExperience = {
    id: 'seed-exp-capstone',
    userId,
    title: '캡스톤디자인 학과 공지 알림 앱',
    period: '2025년 1학기',
    clues: [
      {
        id: 'seed-clue-c1',
        type: 'text',
        description: null,
        text: '발표 자료 마지막 장: 팀원 4명 역할 분담표 — 나는 백엔드·공지 크롤러',
        fileName: null,
        createdAt: at(20),
      },
    ],
    itemStatus: {
      situation: 'explained',
      role: 'explained',
      action: 'explained',
      result: 'needs_more',
      meaning: null,
    },
    card: capstoneCard,
    candidates: [
      {
        id: 'seed-fact-c5',
        item: 'meaning',
        text: '반복되는 불편을 자동화로 줄이는 데 관심이 생겼다',
        status: 'candidate',
        source: 'ai_unverified',
        clueId: null,
        origin: 'conversation',
        createdAt: at(20, 7),
      },
    ],
    messages: capstoneMessages,
    createdAt: at(20),
    updatedAt: at(20, 8),
  }

  const hackathonCard = emptyCard()
  const hackathonFacts: [Item, string][] = [
    ['role', '5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다'],
    ['action', '회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 직접 만들었다'],
    ['result', '48시간 안에 시연까지 마쳤지만 수상은 하지 못했다'],
  ]
  hackathonFacts.forEach(([item, text], i) => {
    hackathonCard[item].push(fact(`seed-fact-h${i + 1}`, item, text, 'manual', at(18, i)))
  })

  const hackathon: StoredExperience = {
    id: 'seed-exp-hackathon',
    userId,
    title: '교내 해커톤 동아리 회비 정산 웹',
    period: '2025년 여름',
    clues: [],
    itemStatus: emptyStatus(),
    card: hackathonCard,
    candidates: [],
    messages: [],
    createdAt: at(18),
    updatedAt: at(18, 2),
  }

  const coverLetter: StoredCoverLetter = {
    id: 'seed-cl-1',
    userId,
    kind: 'pasted',
    title: '가나다소프트 백엔드 지원',
    body: '저는 캡스톤디자인에서 학과 공지 알림 앱을 개발하며 데이터 기반으로 문제를 해결했습니다. 공지 크롤러를 설계해 학생들의 공지 확인율을 40% 높였고, 팀을 주도해 일정 안에 배포를 마쳤습니다. 교내 해커톤에서는 팀장으로서 동아리 회비 정산 서비스를 기획해 수상권에 근접한 성과를 거두었습니다. 이러한 경험을 바탕으로 사용자의 불편을 데이터로 해결하는 백엔드 개발자가 되겠습니다.',
    target: null,
    items: [],
    createdAt: at(22),
    updatedAt: at(22),
  }

  return {
    users: [{ id: userId, ...SEED_USER }],
    experiences: [capstone, hackathon],
    coverLetters: [coverLetter],
    checks: [],
    seq: 1,
  }
}

function load(): Db {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch {
    // 저장소를 못 쓰면 메모리로만 돈다.
  }
  return seed()
}

export function getDb(): Db {
  db ??= load()
  return db
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDb()))
  } catch {
    // 위와 같음
  }
}

export function resetDb() {
  db = seed()
  files.clear()
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 위와 같음
  }
}

export function newId() {
  const d = getDb()
  d.seq += 1
  return `id${d.seq}`
}

export const now = () => new Date().toISOString()

export function saveFile(clueId: string, file: File) {
  files.set(clueId, file)
}

export function getFile(clueId: string) {
  return files.get(clueId) ?? null
}

/** 저장용 경험에서 응답 모양(api.md Experience)만 꺼낸다. */
export function toExperience({
  userId: _userId,
  messages: _messages,
  ...experience
}: StoredExperience): Experience {
  return experience
}

/** 저장용 자소서에서 응답 모양(api.md CoverLetter)만 꺼낸다. */
export function toCoverLetter({ userId: _userId, ...coverLetter }: StoredCoverLetter): CoverLetter {
  return coverLetter
}

/** 저장용 점검 문장에서 응답 모양(api.md CheckSentence)만 꺼낸다. */
export function toCheckSentence({
  criteria: _criteria,
  factItem: _factItem,
  experienceId: _experienceId,
  ...sentence
}: StoredCheckSentence): CheckSentence {
  return sentence
}

/** 저장용 점검에서 응답 모양(api.md Check)만 꺼낸다. */
export function toCheck({
  userId: _userId,
  resolvedCandidateIds: _resolved,
  sentences,
  ...check
}: StoredCheck): Check {
  return { ...check, sentences: sentences.map(toCheckSentence) }
}

/** 목 토큰: `mock-<userId>`. 실제 서버의 JWT 자리다. */
export function tokenFor(userId: string) {
  return `mock-${userId}`
}

export function userFromToken(authorization: string | null): StoredUser | null {
  const match = /^Bearer mock-(.+)$/.exec(authorization ?? '')
  if (!match) return null
  return getDb().users.find((u) => u.id === match[1]) ?? null
}
