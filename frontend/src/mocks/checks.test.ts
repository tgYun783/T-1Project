import { api } from '@/api/client'
import { SEED_USER } from '@/mocks/db'

const login = () => api.login(SEED_USER.email, SEED_USER.password)

async function seedCheck() {
  await login()
  const { coverLetters } = await api.listCoverLetters()
  const coverLetterId = coverLetters[0].id
  const { check } = await api.createCheck(coverLetterId)
  return { coverLetterId, check }
}

describe('목 API ③ 점검 만들기', () => {
  it('시드 자소서 점검은 네 문장을 이 순서로 고른다', async () => {
    const { coverLetterId, check } = await seedCheck()
    expect(check).toMatchObject({ coverLetterId, stale: false, candidates: [] })
    expect(check.sentences.map((s) => s.text)).toEqual([
      '저는 캡스톤디자인에서 학과 공지 알림 앱을 개발하며 데이터 기반으로 문제를 해결했습니다.',
      '공지 크롤러를 설계해 학생들의 공지 확인율을 40% 높였고,',
      '팀을 주도해 일정 안에 배포를 마쳤습니다.',
      '교내 해커톤에서는 팀장으로서 동아리 회비 정산 서비스를 기획해 수상권에 근접한 성과를 거두었습니다.',
    ])
    for (const sentence of check.sentences) {
      expect(sentence).toEqual({
        id: sentence.id,
        text: sentence.text,
        coverLetterItemId: null,
        status: 'pending',
        turns: [],
        followUpsLeft: 3,
      })
    }

    expect((await api.getCheck(check.id)).check).toEqual(check)
    const second = await api.createCheck(coverLetterId)
    const { checks } = await api.listChecks(coverLetterId)
    expect(checks.map((c) => c.id)).toEqual([second.check.id, check.id])
  })

  it('다른 자소서는 숫자·주도·기반·성과가 든 문장을 고르고, 없으면 빈 목록이다', async () => {
    await login()
    const { coverLetter } = await api.createCoverLetter({
      body: '저는 꼼꼼합니다. 매일 3시간씩 알고리즘을 풀었습니다. 동아리에서 큰 성과를 냈습니다.',
    })
    const { check } = await api.createCheck(coverLetter.id)
    expect(check.sentences.map((s) => s.text)).toEqual([
      '매일 3시간씩 알고리즘을 풀었습니다.',
      '동아리에서 큰 성과를 냈습니다.',
    ])

    const plain = await api.createCoverLetter({ body: '저는 꼼꼼한 사람입니다.' })
    const empty = await api.createCheck(plain.coverLetter.id)
    expect(empty.check.sentences).toEqual([])
  })

  it('생성한 자소서는 문항 응답에서 고르고 문항 id를 단다', async () => {
    await login()
    const { experiences } = await api.listExperiences()
    const hackathon = experiences.find((e) => e.title === '교내 해커톤 동아리 회비 정산 웹')!
    const { coverLetter } = await api.generateCoverLetter({
      preferred: '우대사항',
      talent: '인재상',
      questions: ['팀 경험을 적어 주세요.'],
    })
    const itemId = coverLetter.items[0].id
    await api.selectExperiences(coverLetter.id, itemId, [hackathon.id])
    await api.makeAnswer(coverLetter.id, itemId)

    const { check } = await api.createCheck(coverLetter.id)
    expect(check.sentences.map((s) => s.text)).toEqual([
      '5명 팀의 팀장으로 기능 범위를 정하고 발표를 맡았다.',
      '48시간 안에 시연까지 마쳤지만 수상은 하지 못했다.',
    ])
    expect(check.sentences.every((s) => s.coverLetterItemId === itemId)).toBe(true)

    await api.startSentence(check.id, check.sentences[0].id)
    const { newCandidates } = await api.answerSentence(
      check.id,
      check.sentences[0].id,
      '해커톤 마지막 날 오후에 심사위원 앞에서 정산 화면을 직접 시연했고 발표도 제가 맡았습니다.',
    )
    expect(newCandidates[0]).toMatchObject({ experienceId: hackathon.id })
  })
})

describe('목 API ③ 문장 점검', () => {
  it('문장 시작은 첫 질문을 만들고, 다시 불러도 그대로다', async () => {
    const { check } = await seedCheck()
    const second = check.sentences[1]
    await expect(api.answerSentence(check.id, second.id, '답')).rejects.toMatchObject({
      status: 409,
      code: 'SENTENCE_NOT_STARTED',
    })

    const { sentence } = await api.startSentence(check.id, second.id)
    expect(sentence.status).toBe('in_progress')
    expect(sentence.turns).toEqual([
      {
        question: '40%는 무엇과 비교해, 어느 기간에, 어떻게 잰 값인가요?',
        answer: null,
        judge: [],
      },
    ])
    expect((await api.startSentence(check.id, second.id)).sentence).toEqual(sentence)
    await expect(api.answerSentence(check.id, second.id, '  ')).rejects.toMatchObject({
      status: 400,
    })
  })

  it('"재지 않았" 답은 unknown으로 끝나고 답이 후보가 된다', async () => {
    const { check } = await seedCheck()
    const first = check.sentences[0]
    const started = await api.startSentence(check.id, first.id)
    expect(started.sentence.turns[0].question).toBe(
      "여기서 '데이터 기반'은 어떤 데이터를 어떤 도구로 본 건가요?",
    )

    const text = '실제로 재지는 않았고, 공지를 놓쳤다는 말이 줄었다는 반응만 들었습니다.'
    const { sentence, newCandidates } = await api.answerSentence(check.id, first.id, text)
    expect(sentence.status).toBe('unknown')
    expect(sentence.turns).toHaveLength(1)
    expect(sentence.turns[0].answer).toBe(text)
    expect(newCandidates).toEqual([
      expect.objectContaining({
        text,
        status: 'candidate',
        source: 'ai_unverified',
        origin: 'check',
        experienceId: 'seed-exp-capstone',
      }),
    ])
    await expect(api.answerSentence(check.id, first.id, '한 번 더')).rejects.toMatchObject({
      status: 409,
      code: 'SENTENCE_FINISHED',
    })
    expect((await api.getCheck(check.id)).check.candidates).toHaveLength(1)
  })

  it('40자 이상이면 기준을 모두 충족해 explained다', async () => {
    const { check } = await seedCheck()
    const third = check.sentences[2]
    await api.startSentence(check.id, third.id)
    const { sentence } = await api.answerSentence(
      check.id,
      third.id,
      '팀장은 다른 팀원이었고 저는 백엔드와 공지 크롤러를 맡아 배포 스크립트를 직접 작성했습니다.',
    )
    expect(sentence.status).toBe('explained')
    expect(sentence.turns[0].judge).toEqual([
      { id: 'J2', result: 'met' },
      { id: 'J3', result: 'met' },
    ])
  })

  it('짧은 답은 첫 기준이 빠지고, 추가 질문을 다 쓰면 needs_more다', async () => {
    const { check } = await seedCheck()
    const second = check.sentences[1]
    await api.startSentence(check.id, second.id)

    let res = await api.answerSentence(check.id, second.id, '크롤러를 만들었어요.')
    expect(res.sentence).toMatchObject({ status: 'in_progress', followUpsLeft: 2 })
    expect(res.sentence.turns[0].judge).toEqual([
      { id: 'J1', result: 'missing' },
      { id: 'J2', result: 'met' },
      { id: 'J4', result: 'met' },
    ])
    expect(res.sentence.turns[1]).toEqual({
      question: '조금 더 구체적으로, 직접 한 행동과 확인한 결과를 말해 주세요.',
      answer: null,
      judge: [],
    })

    for (const left of [1, 0]) {
      res = await api.answerSentence(check.id, second.id, '크롤러를 만들었어요.')
      expect(res.sentence).toMatchObject({ status: 'in_progress', followUpsLeft: left })
    }
    res = await api.answerSentence(check.id, second.id, '크롤러를 만들었어요.')
    expect(res.sentence.status).toBe('needs_more')
    expect(res.sentence.turns).toHaveLength(4)
    expect(res.sentence.turns.every((t) => t.answer !== null)).toBe(true)
  })
})

describe('목 API ③ 오래된 점검', () => {
  it('자소서를 고치면 점검이 stale이 되고 시작·답하기가 409 CHECK_STALE이다', async () => {
    const { coverLetterId, check } = await seedCheck()
    const first = check.sentences[0]
    await api.startSentence(check.id, first.id)

    await api.updateCoverLetter(coverLetterId, { body: '고친 본문입니다.' })
    const { check: stale } = await api.getCheck(check.id)
    expect(stale.stale).toBe(true)
    expect(stale.sentences[0].turns).toHaveLength(1)

    await expect(
      api.answerSentence(check.id, first.id, '정확한 수치는 기억나지 않아요.'),
    ).rejects.toMatchObject({ status: 409, code: 'CHECK_STALE' })
    await expect(api.startSentence(check.id, check.sentences[1].id)).rejects.toMatchObject({
      status: 409,
      code: 'CHECK_STALE',
    })

    const fresh = await api.createCheck(coverLetterId)
    expect(fresh.check.stale).toBe(false)
  })

  it('문항 응답을 고쳐도 점검이 stale이 된다', async () => {
    await login()
    const { experiences } = await api.listExperiences()
    const { coverLetter } = await api.generateCoverLetter({
      preferred: '우대사항',
      talent: '인재상',
      questions: ['문항'],
    })
    const itemId = coverLetter.items[0].id
    await api.selectExperiences(coverLetter.id, itemId, [experiences[0].id])
    await api.makeAnswer(coverLetter.id, itemId)
    const { check } = await api.createCheck(coverLetter.id)

    await api.updateItemAnswer(coverLetter.id, itemId, '고친 응답')
    expect((await api.getCheck(check.id)).check.stale).toBe(true)
  })
})

describe('목 API ③ 사실 후보', () => {
  async function answeredCheck() {
    const { check } = await seedCheck()
    const first = check.sentences[0]
    await api.startSentence(check.id, first.id)
    const { newCandidates } = await api.answerSentence(
      check.id,
      first.id,
      '실제로 재지는 않았고, 반응만 들었습니다.',
    )
    return { checkId: check.id, candidate: newCandidates[0] }
  }

  it('확정하면 고른 경험 카드에 들어가고 점검 후보에서 빠진다', async () => {
    const { checkId, candidate } = await answeredCheck()
    const experienceId = candidate.experienceId!

    await expect(
      api.confirmCandidate(checkId, candidate.id, {
        experienceId,
        item: 'result',
        source: 'ai_unverified' as never,
      }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      api.confirmCandidate(checkId, candidate.id, { experienceId, item: 'result', source: 'clue' }),
    ).rejects.toMatchObject({ status: 400 })

    const { fact } = await api.confirmCandidate(checkId, candidate.id, {
      experienceId,
      item: 'result',
      text: '확인율은 재지 않았고 반응만 들었다',
      source: 'said',
    })
    expect(fact).toMatchObject({
      item: 'result',
      text: '확인율은 재지 않았고 반응만 들었다',
      status: 'confirmed',
      source: 'said',
      origin: 'check',
    })
    const { experience } = await api.getExperience(experienceId)
    expect(experience.card.result.map((f) => f.id)).toContain(fact.id)
    expect((await api.getCheck(checkId)).check.candidates).toEqual([])

    await expect(
      api.confirmCandidate(checkId, candidate.id, { experienceId, item: 'result', source: 'said' }),
    ).rejects.toMatchObject({ status: 409, code: 'CANDIDATE_RESOLVED' })
  })

  it('버리면 점검 후보에서 빠진다', async () => {
    const { checkId, candidate } = await answeredCheck()
    await api.discardCandidate(checkId, candidate.id)
    expect((await api.getCheck(checkId)).check.candidates).toEqual([])
    await expect(api.discardCandidate(checkId, candidate.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('다른 계정의 점검은 404다', async () => {
    const { checkId } = await answeredCheck()
    await api.signup('other@example.com', 'pw')
    await expect(api.getCheck(checkId)).rejects.toMatchObject({ status: 404 })
  })
})
