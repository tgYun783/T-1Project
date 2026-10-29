import { api } from '@/api/client'
import { SEED_USER } from '@/mocks/db'

const login = () => api.login(SEED_USER.email, SEED_USER.password)

async function experienceIds() {
  const { experiences } = await api.listExperiences()
  const byTitle = (title: string) => experiences.find((e) => e.title === title)!.id
  return {
    capstone: byTitle('캡스톤디자인 학과 공지 알림 앱'),
    hackathon: byTitle('교내 해커톤 동아리 회비 정산 웹'),
  }
}

function generate(questions = ['지원 동기를 적어 주세요.', '팀으로 협업한 경험을 적어 주세요.']) {
  return api.generateCoverLetter({
    preferred: '백엔드 API 개발 경험',
    talent: '문제를 끝까지 파고드는 사람',
    questions,
  })
}

describe('목 API ② 붙여넣은 자소서', () => {
  it('시드 자소서를 조회한다', async () => {
    await login()
    const { coverLetters } = await api.listCoverLetters()
    expect(coverLetters).toHaveLength(1)
    const seed = coverLetters[0]
    expect(seed).toMatchObject({ kind: 'pasted', title: '가나다소프트 백엔드 지원' })
    expect(seed).not.toHaveProperty('userId')

    const res = await api.getCoverLetter(seed.id)
    expect(res.coverLetter.body).toContain('공지 확인율을 40% 높였고')
    expect(res.experiences).toEqual([])
  })

  it('빈 본문은 400이다', async () => {
    await login()
    await expect(api.createCoverLetter({ body: '   ' })).rejects.toMatchObject({ status: 400 })
  })

  it('붙여넣고 고친다', async () => {
    await login()
    const { coverLetter } = await api.createCoverLetter({ title: ' ', body: '본문입니다.' })
    expect(coverLetter).toMatchObject({ kind: 'pasted', title: null, body: '본문입니다.' })
    const { coverLetters } = await api.listCoverLetters()
    expect(coverLetters[0].id).toBe(coverLetter.id)

    const res = await api.updateCoverLetter(coverLetter.id, { body: '고친 본문' })
    expect(res.coverLetter.body).toBe('고친 본문')
    await expect(api.updateCoverLetter(coverLetter.id, { body: '' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('다른 계정의 자소서는 404다', async () => {
    await login()
    const { coverLetters } = await api.listCoverLetters()
    await api.signup('other@example.com', 'pw')
    await expect(api.getCoverLetter(coverLetters[0].id)).rejects.toMatchObject({ status: 404 })
  })
})

describe('목 API ② 작성 시작·문항별 응답', () => {
  it('작성 시작은 우대사항·인재상·문항이 있어야 한다', async () => {
    await login()
    await expect(
      api.generateCoverLetter({ preferred: '', talent: '인재상', questions: ['문항'] }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(generate([' '])).rejects.toMatchObject({ status: 400 })

    const { coverLetter } = await generate()
    expect(coverLetter).toMatchObject({ kind: 'generated', body: null })
    expect(coverLetter.items.map((i) => i.question)).toEqual([
      '지원 동기를 적어 주세요.',
      '팀으로 협업한 경험을 적어 주세요.',
    ])
    expect(coverLetter.items[0]).toMatchObject({
      answer: null,
      recommendations: [],
      selectedExperienceIds: [],
    })
    await expect(api.updateCoverLetter(coverLetter.id, { body: '본문' })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('추천 → 카드 고르기 → 응답 생성', async () => {
    await login()
    const ids = await experienceIds()
    const { coverLetter } = await generate()
    const [first, second] = coverLetter.items

    const rec = await api.recommend(coverLetter.id, first.id)
    expect(rec.item.recommendations).toContainEqual({
      experienceId: ids.capstone,
      reason: '직접 만든 기능과 결과가 문항과 맞아요',
    })
    const teamRec = await api.recommend(coverLetter.id, second.id)
    expect(teamRec.item.recommendations[0]).toEqual({
      experienceId: ids.hackathon,
      reason: '팀장으로 범위를 정한 경험이 문항과 맞아요',
    })

    const picked = await api.selectExperiences(coverLetter.id, first.id, [ids.capstone])
    expect(picked.item.selectedExperienceIds).toEqual([ids.capstone])
    expect(picked.usedElsewhere).toEqual([])

    const made = await api.makeAnswer(coverLetter.id, first.id)
    expect(made.item.answer).toContain('공지 게시판을 10분마다 확인해')
    expect(made.item.answer).not.toContain('40%')
    expect(made.item).toMatchObject({ usedExperienceIds: [ids.capstone], answerEdited: false })

    const detail = await api.getCoverLetter(coverLetter.id)
    expect(detail.experiences.map((e) => e.id)).toEqual([ids.capstone])

    const again = await api.selectExperiences(coverLetter.id, second.id, [ids.capstone])
    expect(again.usedElsewhere).toEqual([{ experienceId: ids.capstone, itemIds: [first.id] }])
  })

  it('확정 사실이 없는 카드는 고를 수 없다', async () => {
    await login()
    const { coverLetter } = await generate()
    const { experience } = await api.createExperience({ title: '빈 경험', period: '2024년' })
    await expect(
      api.selectExperiences(coverLetter.id, coverLetter.items[0].id, [experience.id]),
    ).rejects.toMatchObject({ status: 400, code: 'NO_CONFIRMED_FACTS' })
    await expect(api.makeAnswer(coverLetter.id, coverLetter.items[0].id)).rejects.toMatchObject({
      status: 400,
    })
  })

  it('확정 사실이 있는 카드가 없으면 추천이 400 NO_CONFIRMED_FACTS다', async () => {
    await api.signup('new@example.com', 'pw')
    const { coverLetter } = await generate()
    await expect(api.recommend(coverLetter.id, coverLetter.items[0].id)).rejects.toMatchObject({
      status: 400,
      code: 'NO_CONFIRMED_FACTS',
    })
  })

  it('고친 응답은 확인 없이 다시 만들면 409다', async () => {
    await login()
    const ids = await experienceIds()
    const { coverLetter } = await generate()
    const itemId = coverLetter.items[0].id
    await api.selectExperiences(coverLetter.id, itemId, [ids.hackathon])
    await api.makeAnswer(coverLetter.id, itemId)

    const edited = await api.updateItemAnswer(coverLetter.id, itemId, '제가 고친 응답')
    expect(edited.item).toMatchObject({ answer: '제가 고친 응답', answerEdited: true })

    await expect(api.makeAnswer(coverLetter.id, itemId)).rejects.toMatchObject({
      status: 409,
      code: 'OVERWRITE_CONFIRM_REQUIRED',
    })
    const remade = await api.makeAnswer(coverLetter.id, itemId, true)
    expect(remade.item.answer).toContain('5명 팀의 팀장으로')
    expect(remade.item.answerEdited).toBe(false)
  })
})
