import { defineConfig } from "@playwright/test"
import { E2E_BASE_URL } from "./env"

/**
 * 로컬·CI용 설정이다. docker compose up 뒤 `npx playwright test`로 주최 측 실행과 같은 조건을 미리 확인한다.
 * 주최 측 실행은 이 파일을 쓰지 않고 아래와 같은 값의 자체 설정으로 실행한다. 그래서 여기에만 둔 설정
 * (globalSetup·storageState·retries·route·viewport 변경 등)은 주최 측 실행에는 적용되지 않는다. 로그인·데이터 준비는 spec 안에서 한다.
 */
export default defineConfig({
  testDir: "./scenarios",
  // docs/scenarios.yaml의 id와 같은 이름(S1.spec.ts, S2.spec.ts…)만 실행한다.
  testMatch: /[\\/]S[1-9]\d*\.spec\.ts$/,
  // 흐름들이 같은 DB를 쓰므로 하나씩 순서대로 돈다.
  workers: 1,
  retries: 0,
  // 흐름 하나(AI 응답 대기 포함)가 로컬에서 1분 안에 끝나게 만든다. 주최 측 실행은 동작마다 화면을 찍어 더 오래 걸린다.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: E2E_BASE_URL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  // docs/scenarios.yaml의 platform이 desktop이라 desktop만 둔다. 주최 측 실행도 같은 화면 크기로 돈다.
  projects: [{ name: "desktop", use: { viewport: { width: 1440, height: 900 } } }],
})
