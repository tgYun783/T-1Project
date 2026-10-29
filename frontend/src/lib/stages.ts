// 단계 색: 경험 = lime, 자소서 = lilac, 점검 = cream(specs/00-common.md).
// 색은 칩·선택 표시에만 쓰고, 구역은 흰 카드 + 얇은 선으로 나눈다(POLISH H6·M2).
export const STAGES = {
  experience: { bg: 'bg-lime', name: '1 경험 꺼내기' },
  coverLetter: { bg: 'bg-lilac', name: '2 자소서 쓰기' },
  check: { bg: 'bg-cream', name: '3 제출 전 점검' },
} as const

export type Stage = keyof typeof STAGES
