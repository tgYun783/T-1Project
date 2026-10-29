import { api } from '@/api/client'
import { SEED_USER } from '@/mocks/db'

const login = () => api.login(SEED_USER.email, SEED_USER.password)

describe('목 API 이력서', () => {
  it('시드 이력서를 조회한다', async () => {
    await login()
    const { resume } = await api.getResume()
    expect(resume.text).toContain('- 프로그래밍 동아리 운영진 (2024년, 스터디 일정 관리)')
    expect(resume.drafts).toEqual([
      expect.objectContaining({ title: '프로그래밍 동아리 운영진', period: '2024년' }),
    ])
  })

  it('붙여넣은 적 없는 계정은 빈 이력서다', async () => {
    await api.signup('new@example.com', 'pw')
    const { resume } = await api.getResume()
    expect(resume).toEqual({ text: null, drafts: [], updatedAt: null })
  })

  it('활동 나누기는 이미 있는 경험·초안을 빼고 새 활동만 더한다', async () => {
    await login()
    const { resume: before } = await api.getResume()
    const text = `${before.text}\n- 오픈소스 기여 「번역 문서 개선」 (2024년 겨울, 개인)`
    const { resume, added } = await api.splitResume(text)
    expect(added).toEqual([
      {
        id: expect.any(String),
        title: '오픈소스 기여 번역 문서 개선',
        period: '2024년 겨울',
        summary: '오픈소스 기여 「번역 문서 개선」 (2024년 겨울, 개인)',
        origin: 'ai',
      },
    ])
    expect(resume.text).toBe(text)
    expect(resume.drafts.map((d) => d.title)).toEqual([
      '프로그래밍 동아리 운영진',
      '오픈소스 기여 번역 문서 개선',
    ])
  })

  it('- 줄이 없으면 빈 줄로 나눈 문단마다 활동 하나다', async () => {
    await api.signup('new@example.com', 'pw')
    const { added } = await api.splitResume('학생회 기획부 (2023년)\n축제 준비\n\n코딩 과외')
    expect(added.map((d) => [d.title, d.period])).toEqual([
      ['학생회 기획부', '2023년'],
      ['코딩 과외', ''],
    ])
    expect(added[0].summary).toBe('학생회 기획부 (2023년)\n축제 준비')
  })

  it('빈 이력서는 400이다', async () => {
    await login()
    await expect(api.splitResume('  ')).rejects.toMatchObject({ status: 400 })
  })

  it('직접 추가·고치기·빼기를 하고 활동 이름이 비면 400이다', async () => {
    await login()
    await expect(api.addDraft({ title: ' ' })).rejects.toMatchObject({ status: 400 })
    const { draft } = await api.addDraft({ title: '알고리즘 스터디', period: '2023년' })
    expect(draft).toMatchObject({ title: '알고리즘 스터디', summary: '', origin: 'manual' })

    const { draft: edited } = await api.updateDraft(draft.id, { summary: '주 1회 문제 풀이' })
    expect(edited).toMatchObject({ title: '알고리즘 스터디', summary: '주 1회 문제 풀이' })
    await expect(api.updateDraft(draft.id, { title: '' })).rejects.toMatchObject({ status: 400 })

    await api.deleteDraft(draft.id)
    const { resume } = await api.getResume()
    expect(resume.drafts.some((d) => d.id === draft.id)).toBe(false)
  })

  it('확정하면 초안마다 경험이 생기고 초안 목록에서 빠진다', async () => {
    await api.signup('new@example.com', 'pw')
    const { draft } = await api.addDraft({
      title: '알고리즘 스터디',
      period: '2023년',
      summary: '주 1회',
    })
    const { experiences } = await api.confirmDrafts([draft.id])
    expect(experiences).toEqual([
      expect.objectContaining({
        title: '알고리즘 스터디',
        period: '2023년',
        summary: '주 1회',
        clues: [],
        candidates: [],
      }),
    ])
    expect(experiences[0].itemStatus.situation).toBeNull()

    expect((await api.getResume()).resume.drafts).toEqual([])
    const list = await api.listExperiences()
    expect(list.experiences.map((e) => e.id)).toEqual([experiences[0].id])
  })

  it('없는 초안이 섞이면 404이고 아무것도 확정하지 않는다', async () => {
    await login()
    const { resume } = await api.getResume()
    await expect(api.confirmDrafts([resume.drafts[0].id, 'nope'])).rejects.toMatchObject({
      status: 404,
    })
    expect((await api.getResume()).resume.drafts).toHaveLength(1)
    await expect(api.confirmDrafts([])).rejects.toMatchObject({ status: 400 })
  })

  it('시드에 작성한 자소서 라라테크 백엔드 지원이 있다', async () => {
    await login()
    const { coverLetters } = await api.listCoverLetters()
    const generated = coverLetters.find((c) => c.title === '라라테크 백엔드 지원')!
    expect(generated.kind).toBe('generated')
    expect(generated.items[0].usedExperienceIds).toHaveLength(2)
    expect(generated.items[0].answer).toContain('48시간 안에 시연까지 마쳤습니다.')
    expect(generated.items[1].answer).toBeNull()
  })
})
