import { api, ApiError } from '@/api/client'
import { SEED_USER } from '@/mocks/db'

const login = () => api.login(SEED_USER.email, SEED_USER.password)

async function hackathonId() {
  const { experiences } = await api.listExperiences()
  return experiences.find((e) => e.title === '교내 해커톤 동아리 회비 정산 웹')!.id
}

describe('목 API ① 계정·경험', () => {
  it('시드 계정으로 로그인한다', async () => {
    const res = await login()
    expect(res.user.email).toBe('seeker@example.com')
    expect((await api.me()).user.email).toBe('seeker@example.com')
  })

  it('로그인하지 않으면 경험 API가 401이다', async () => {
    await expect(api.listExperiences()).rejects.toMatchObject({ status: 401 })
  })

  it('시드 경험 2개를 조회한다', async () => {
    await login()
    const { experiences } = await api.listExperiences()
    expect(experiences.map((e) => e.title).sort()).toEqual([
      '교내 해커톤 동아리 회비 정산 웹',
      '캡스톤디자인 학과 공지 알림 앱',
    ])
    const capstone = experiences.find((e) => e.title === '캡스톤디자인 학과 공지 알림 앱')!
    expect(capstone.card.result).toHaveLength(1)
    expect(capstone.itemStatus.result).toBe('needs_more')
    expect(capstone.candidates[0]).toMatchObject({ item: 'meaning', source: 'ai_unverified' })
    expect(capstone).not.toHaveProperty('messages')
  })

  it('다른 계정의 경험은 404다', async () => {
    await login()
    const id = await hackathonId()
    await api.signup('other@example.com', 'pw')
    await expect(api.getExperience(id)).rejects.toMatchObject({ status: 404 })
  })

  it('경험을 만들고 제목이 비면 400이다', async () => {
    await login()
    const { experience } = await api.createExperience({ title: '새 경험', period: '2024년' })
    expect(experience.itemStatus.situation).toBeNull()
    await expect(api.createExperience({ title: ' ', period: '2024년' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('글 단서를 추가한다', async () => {
    await login()
    const id = await hackathonId()
    const { clue } = await api.addClue(id, { type: 'text', text: '발표 슬라이드' })
    expect(clue).toMatchObject({ type: 'text', text: '발표 슬라이드' })
  })
})

describe('목 API ① 경험 대화', () => {
  it('시작 전에 답하면 409다', async () => {
    await login()
    const id = await hackathonId()
    await expect(api.answerConversation(id, '답')).rejects.toMatchObject({
      status: 409,
      code: 'CONVERSATION_NOT_STARTED',
    })
  })

  it('답 한 번에 항목 상태가 바뀌고 후보가 생긴다', async () => {
    await login()
    const id = await hackathonId()
    const start = await api.startConversation(id)
    expect(start.question.text).toBe('이 경험에서 해결하려던 문제는 무엇이었나요?')
    expect(start.itemStatus.situation).toBeNull()

    const text = '회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 제가 만들었습니다.'
    const res = await api.answerConversation(id, text)
    expect(res.answer).toMatchObject({ role: 'user', text })
    expect(res.question.text).toBe('그때 본인이 맡은 역할은 무엇이었나요?')
    expect(res.itemStatus.situation).toBe('explained')
    expect(res.newCandidates).toEqual([
      expect.objectContaining({
        item: 'situation',
        text,
        status: 'candidate',
        source: 'ai_unverified',
      }),
    ])

    const conversation = await api.getConversation(id)
    expect(conversation.messages).toHaveLength(3)
    expect(conversation.candidates).toHaveLength(1)
  })

  it('이미 대화가 있으면 시작이 마지막 질문을 돌려준다', async () => {
    await login()
    const { experiences } = await api.listExperiences()
    const capstone = experiences.find((e) => e.title === '캡스톤디자인 학과 공지 알림 앱')!
    const start = await api.startConversation(capstone.id)
    expect(start.question.text).toBe('이 경험이 지금 지원에 어떤 의미가 있나요?')
    const res = await api.answerConversation(capstone.id, '자동화에 관심이 생겼다')
    expect(res.itemStatus.result).toBe('explained')
    expect(res.newCandidates[0].item).toBe('result')
  })
})

describe('목 API ① 사실 확정·직접 추가', () => {
  async function candidateOfHackathon() {
    await login()
    const id = await hackathonId()
    await api.startConversation(id)
    const res = await api.answerConversation(id, '동아리 회비 정산이 늘 늦었다')
    return { id, factId: res.newCandidates[0].id }
  }

  it('후보 확정 시 ai_unverified를 거부한다', async () => {
    const { id, factId } = await candidateOfHackathon()
    const error = await api
      .confirmFact(id, factId, { source: 'ai_unverified' as unknown as 'said' })
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400 })
    const { experience } = await api.getExperience(id)
    expect(experience.candidates).toHaveLength(1)
  })

  it('내가 말함으로 확정하면 후보에서 빠지고 카드에 들어간다', async () => {
    const { id, factId } = await candidateOfHackathon()
    const { fact } = await api.confirmFact(id, factId, { source: 'said', text: '정산이 늦었다' })
    expect(fact).toMatchObject({ status: 'confirmed', source: 'said', text: '정산이 늦었다' })
    const { experience } = await api.getExperience(id)
    expect(experience.candidates).toHaveLength(0)
    expect(experience.card.situation.map((f) => f.text)).toEqual(['정산이 늦었다'])
  })

  it('자료로 확인은 이 경험의 단서가 있어야 한다', async () => {
    const { id, factId } = await candidateOfHackathon()
    await expect(api.confirmFact(id, factId, { source: 'clue' })).rejects.toMatchObject({
      status: 400,
    })
    const { clue } = await api.addClue(id, { type: 'text', text: '정산표' })
    const { fact } = await api.confirmFact(id, factId, { source: 'clue', clueId: clue.id })
    expect(fact).toMatchObject({ source: 'clue', clueId: clue.id })
  })

  it('직접 추가는 바로 확정되고, 고치고 지울 수 있다', async () => {
    await login()
    const id = await hackathonId()
    const { fact } = await api.addFact(id, { item: 'role', text: '발표를 맡았다', source: 'said' })
    expect(fact).toMatchObject({ status: 'confirmed', origin: 'manual' })

    await api.updateFact(id, fact.id, { item: 'action', text: '발표 자료를 만들었다' })
    let { experience } = await api.getExperience(id)
    expect(experience.card.role.some((f) => f.id === fact.id)).toBe(false)
    expect(experience.card.action.find((f) => f.id === fact.id)?.text).toBe('발표 자료를 만들었다')
    // 카드를 고쳐도 항목 상태는 바뀌지 않는다.
    expect(experience.itemStatus.action).toBeNull()

    await api.deleteFact(id, fact.id)
    ;({ experience } = await api.getExperience(id))
    expect(experience.card.action.some((f) => f.id === fact.id)).toBe(false)
  })
})
