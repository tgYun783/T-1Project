import { expect, test } from "@playwright/test"

/**
 * docs/scenarios.yaml의 S1을 옮겼다. 가입은 실행마다 다른 이메일로 한다.
 * 화면 글자는 frontend/specs/의 「화면 글자」 표와 같다.
 */
test("S1 처음 온 취준생이 가입하면 경험부터 등록하라는 안내를 본다", async ({ page }) => {
  const email = `e2e-s1-${Date.now()}@example.com`

  await page.goto("/")

  // 1. 첫 화면에서 '가입하기'를 누른다
  await page.getByRole("main").getByRole("link", { name: "가입하기" }).click()

  // 2. '이메일'에 새 이메일을, '비밀번호'에 비밀번호를 입력하고 '가입하기'를 누른다
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호").fill("e2e-password-2026")
  await page.getByRole("button", { name: "가입하기" }).click()

  // expected: 로그인된 상태로 홈이 열리고, 경험부터 확정하라는 안내와 '이력서 입력'이 보이며 '새로 쓰기'는 없다
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
  await expect(
    page.getByText("경험 카드를 먼저 하나 확정해야 자소서를 쓰고 점검할 수 있어요."),
  ).toBeVisible()
  await expect(page.getByRole("link", { name: "이력서 입력", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "새로 쓰기" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "새로 쓰기" })).toHaveCount(0)
})
