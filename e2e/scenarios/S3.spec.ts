import { expect, test, type Page } from "@playwright/test"
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from "../env"

/** 시드 계정(취준생)으로 화면에서 로그인한다. 첫 화면(/)에서 '로그인'을 눌러 들어간다. */
async function logIn(page: Page, email: string, password: string) {
  await page.goto("/")
  await page.getByRole("main").getByRole("link", { name: "로그인" }).click()
  await page.getByLabel("이메일").fill(email)
  await page.getByLabel("비밀번호").fill(password)
  await page.getByRole("button", { name: "로그인" }).click()
  await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible()
}

/** docs/scenarios.yaml의 S3을 옮겼다. 시드에 경험 카드가 있어 자소서 잠금이 풀려 있다. */
test("S3 취준생이 이미 쓴 자소서를 붙여넣어 저장한다", async ({ page }) => {
  const body =
    "저는 동아리 회비 정산 웹을 만들며 입금 내역을 엑셀로 받아 화면에 올리는 기능을 맡았습니다."

  await logIn(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  // 1. 위쪽 메뉴에서 '자소서'를 누른다
  await page.getByRole("link", { name: "자소서", exact: true }).click()
  await expect(page.getByRole("link", { name: "쓴 자소서 붙여넣기" })).toBeVisible()
  const pastedBefore = await page.getByText("붙여넣음", { exact: true }).count()

  // 2. '쓴 자소서 붙여넣기'를 누른다
  await page.getByRole("link", { name: "쓴 자소서 붙여넣기" }).click()

  // 3. '본문'을 비운 채 '저장'을 누른다
  await page.getByRole("button", { name: "저장" }).click()
  await expect(page.getByText("본문을 입력해 주세요.")).toBeVisible()

  // 4. '본문'에 입력하고 '저장'을 누른다
  await page.getByLabel("본문").fill(body)
  await page.getByRole("button", { name: "저장" }).click()

  // expected 1: 자소서 상세에 본문이 그대로 보인다
  await expect(page.getByLabel("본문")).toHaveValue(body)

  // 5. 위쪽 메뉴에서 '자소서'를 누른다
  await page.getByRole("link", { name: "자소서", exact: true }).click()

  // expected 2: 자소서 목록에 '붙여넣음' 자소서가 하나 늘어 있다
  await expect(page.getByText("붙여넣음", { exact: true })).toHaveCount(pastedBefore + 1)
})
