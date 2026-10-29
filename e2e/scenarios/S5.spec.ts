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

/** docs/scenarios.yaml의 S5를 옮겼다. 카드 추천·문항 응답은 실제 AI 응답을 기다린다. */
test("S5 취준생이 문항마다 경험 카드를 골라 자소서 응답을 만든다", async ({ page }) => {
  const card = "캡스톤디자인 학과 공지 알림 앱"

  await logIn(page, E2E_USER_EMAIL, E2E_USER_PASSWORD)

  // 1. 위쪽 메뉴에서 '자소서'를 누른다
  await page.getByRole("link", { name: "자소서", exact: true }).click()
  await expect(page.getByRole("link", { name: "새로 쓰기" })).toBeVisible()
  const generatedBefore = await page.getByRole("link").filter({ hasText: "작성함" }).count()

  // 2. '새로 쓰기'를 누른다
  await page.getByRole("link", { name: "새로 쓰기" }).click()

  // 3. '우대사항'·'인재상'·'문항 1'을 입력하고 '작성 시작'을 누른다
  await page.getByLabel("우대사항").fill("REST API 설계 경험, 협업 도구 사용 경험")
  await page.getByLabel("인재상").fill("문제를 끝까지 파고드는 사람")
  await page.getByLabel("문항 1").fill("직무 관련 경험을 바탕으로 본인의 강점을 서술하시오")
  await page.getByRole("button", { name: "작성 시작" }).click()

  // 4. 추천된 경험 카드가 보이면 카드를 켜고 '이 문항 만들기'를 누른다
  await expect(page.getByRole("heading", { name: "추천 경험 카드" })).toBeVisible({
    timeout: AI_WAIT,
  })
  const toggle = page.getByRole("button", { name: card }).first()
  await toggle.click()
  await expect(toggle).toHaveAttribute("aria-pressed", "true")
  await page.getByRole("button", { name: "이 문항 만들기" }).click()

  // expected 1: 문항 1의 응답 글이 보이고, 근거로 쓴 경험 카드가 보인다
  await expect(page.getByLabel("응답", { exact: true })).not.toHaveValue("", { timeout: AI_WAIT })
  await expect(page.getByText("근거 경험 카드")).toBeVisible()
  await expect(page.getByText(card).last()).toBeVisible()

  // expected 2: 자소서 목록에 '작성함' 자소서가 하나 늘어 있다
  await page.getByRole("link", { name: "자소서", exact: true }).click()
  await expect(page.getByRole("link").filter({ hasText: "작성함" })).toHaveCount(generatedBefore + 1)
})
