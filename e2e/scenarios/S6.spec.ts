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
 * docs/scenarios.yaml의 S6을 옮겼다. 주장 문장 고르기·질문·판정이 모두 실제 AI라
 * 특정 문장이 아니라 「목록이 보이고, 답이 기록에 붙고, 상태 글자나 다음 질문이 보인다」를 확인한다.
 */
test("S6 취준생이 붙여넣은 자소서를 제출 전에 점검한다", async ({ page }) => {
  const answer = "실제로 재지는 않았고, 공지를 놓쳤다는 말이 줄었다는 반응만 들었습니다."

  await logIn(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  // 1. 위쪽 메뉴에서 '자소서'를 누른다
  await page.getByRole("link", { name: "자소서", exact: true }).click()

  // 2. 목록에서 시드 자소서 '가나다소프트 백엔드 지원'을 연다
  await page.getByRole("link", { name: /가나다소프트 백엔드 지원/ }).click()

  // 3. '제출 전 점검 시작'을 누른다
  await page.getByRole("button", { name: "제출 전 점검 시작" }).click()

  // 4. 점검할 문장 목록과 첫 질문이 보이면 '답변'에 입력하고 '답하기'를 누른다
  await expect(page.getByRole("heading", { name: "점검할 문장" })).toBeVisible({
    timeout: AI_WAIT,
  })
  await expect(page.getByLabel("답변")).toBeEnabled({ timeout: AI_WAIT })
  await page.getByLabel("답변").fill(answer)
  await page.getByRole("button", { name: "답하기" }).click()

  // expected: 점검할 주장 문장 목록이 있고, 방금 낸 답이 기록에 붙는다
  await expect(page.getByText(answer)).toBeVisible({ timeout: AI_WAIT })
  // 그 문장에 다음 질문이 보이거나 상태 글자가 보인다
  await expect(
    page.getByText(/설명됨|추가 확인 필요|모름·경험 없음/).first(),
  ).toBeVisible({ timeout: AI_WAIT })
  // 점수는 어디에도 보이지 않는다
  await expect(page.getByText(/점수/)).toHaveCount(0)
  await expect(page.getByText(/\d+\s*\/\s*100/)).toHaveCount(0)
})
