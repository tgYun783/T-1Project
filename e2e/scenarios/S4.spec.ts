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

const AI_WAIT = 60_000

/**
 * docs/scenarios.yaml의 S4를 옮겼다. AI를 실제로 부르므로 질문 문구가 아니라
 * 「답이 기록에 남고, 다음 질문이 붙고, 항목 상태 글자가 보인다」만 확인한다.
 */
test("S4 취준생이 경험 대화에서 AI 질문에 글로 답하고 항목 상태를 본다", async ({ page }) => {
  const answer = "회비 입금 내역을 엑셀로 받아 정산 화면에 올리는 기능을 제가 만들었습니다."

  await logIn(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  // 1. 위쪽 메뉴에서 '경험'을 누른다
  await page.getByRole("link", { name: "경험", exact: true }).click()

  // 2. 목록에서 '교내 해커톤 동아리 회비 정산 웹'을 연다
  await page.getByRole("link", { name: /교내 해커톤 동아리 회비 정산 웹/ }).click()

  // 3. AI의 첫 질문이 보이면 '답변'에 입력하고 '보내기'를 누른다
  const messages = page.getByRole("list", { name: "대화 내용" }).getByRole("listitem")
  await expect(messages.first()).toBeVisible({ timeout: AI_WAIT })
  const before = await messages.count()
  await page.getByLabel("답변").fill(answer)
  await page.getByRole("button", { name: "보내기" }).click()

  // expected: 보낸 답과 AI의 다음 질문이 대화에 붙는다
  await expect(messages.filter({ hasText: answer })).toBeVisible({ timeout: AI_WAIT })
  await expect.poll(() => messages.count(), { timeout: AI_WAIT }).toBeGreaterThanOrEqual(before + 2)

  // expected: 다섯 항목 중 하나 이상에 상태 글자가 보인다
  await expect(page.getByText(/설명됨|추가 확인 필요|모름·경험 없음/).first()).toBeVisible()
  // AI 실패 안내가 남아 있지 않다
  await expect(page.getByRole("button", { name: "다시 시도" })).toHaveCount(0)
})
