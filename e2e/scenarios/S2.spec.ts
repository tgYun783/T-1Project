import { expect, test } from "@playwright/test"

/**
 * docs/scenarios.yaml의 S2를 옮겼다. 새 계정으로 시작하므로 앞 흐름의 데이터에 기대지 않는다.
 * 경험 상세로 들어오면 앱이 AI 첫 질문을 부르지만, 이 흐름은 AI 결과에 기대지 않는다.
 */
test("S2 새 취준생이 단서 없이 경험을 등록하고 사실을 직접 적어 자소서 잠금을 푼다", async ({
  page,
}) => {
  const email = `e2e-s2-${Date.now()}@example.com`

  await page.goto("/")

  // 1. 첫 화면에서 '가입하기'를 누르고 새 이메일과 비밀번호로 가입한다
  await page.getByRole("main").getByRole("link", { name: "가입하기" }).click()
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호").fill("e2e-password-2026")
  await page.getByRole("button", { name: "가입하기" }).click()

  // 2. 홈에서 '경험 등록'을 누른다
  await page.getByRole("link", { name: "경험 등록", exact: true }).click()

  // 3. '제목'에 '교내 해커톤 동아리 회비 정산 웹'을, '대략적 시기'에 '2025년 여름'을 입력하고 '대화 시작'을 누른다
  await page.getByLabel("제목").fill("교내 해커톤 동아리 회비 정산 웹")
  await page.getByLabel("대략적 시기").fill("2025년 여름")
  await page.getByRole("button", { name: "대화 시작" }).click()

  // 4. 경험 상세 화면의 경험 카드에서 '직접 추가'를 누른다
  await page.getByRole("button", { name: "직접 추가" }).click()

  // 5. '항목'에서 '역할'을 고르고, '내용'에 입력하고, '내가 말함'을 고른 뒤 '카드에 추가'를 누른다
  await page.getByLabel("항목").selectOption({ label: "역할" })
  await page.getByLabel("내용", { exact: true }).fill("팀장으로 기능 범위를 정하고 발표를 맡았다")
  await page.getByLabel("내가 말함").check()
  await page.getByRole("button", { name: "카드에 추가" }).click()

  // expected 1: 경험 카드의 역할 칸에 입력한 내용이 '내가 말함'과 함께 보인다
  const roleCard = page.getByRole("region", { name: "카드 역할" })
  await expect(roleCard).toContainText("팀장으로 기능 범위를 정하고 발표를 맡았다")
  await expect(roleCard).toContainText("내가 말함")

  // 6. 위쪽 메뉴에서 '자소서'를 누른다
  await page.getByRole("link", { name: "자소서", exact: true }).click()

  // expected 2: 잠금 안내 대신 '새로 쓰기'와 '쓴 자소서 붙여넣기'가 보인다
  await expect(page.getByRole("link", { name: "새로 쓰기" })).toBeVisible()
  await expect(page.getByRole("link", { name: "쓴 자소서 붙여넣기" })).toBeVisible()
  await expect(
    page.getByText("경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요."),
  ).toHaveCount(0)
})
