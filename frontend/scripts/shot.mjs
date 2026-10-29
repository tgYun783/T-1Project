// 디자인 확인용 스크린샷. 개발 서버(목 API)를 띄우고 시드 계정으로 로그인한 뒤 화면을 1440×900으로 찍는다.
// 사용법: npm run shot -- [화면 이름...] [--tag 이름]   (이름을 빼면 전부)
// 결과: shots/<tag>/<화면>.png  (tag 기본값 now). shots/는 git에 넣지 않는다.
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const tagAt = args.indexOf('--tag')
const tag = tagAt >= 0 ? args[tagAt + 1] : 'now'
const wanted = args.filter((a, i) => a !== '--tag' && i !== tagAt + 1)

// 시드 계정은 목 API(src/mocks/db.ts)와 같은 값을 읽는다.
const dbSrc = await readFile(path.join(root, 'src/mocks/db.ts'), 'utf8')
const seed = dbSrc.match(/SEED_USER = \{ email: '([^']+)', password: '([^']+)' \}/)
if (!seed) throw new Error('src/mocks/db.ts에서 SEED_USER를 찾지 못했어요')
const [, email, password] = seed

// path가 함수면 로그인한 페이지에서 API를 불러 주소를 만든다(목 API는 페이지 안에서만 돈다).
const api = async (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const token = localStorage.getItem('t1-token')
      const res = await fetch(`/api${u}`, {
        method: m,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(b ? { 'Content-Type': 'application/json' } : {}),
        },
        body: b ? JSON.stringify(b) : undefined,
      })
      return res.status === 204 ? null : res.json()
    },
    [method, url, body],
  )

const screens = {
  intro: { path: '/', login: false },
  login: { path: '/login', login: false },
  home: { path: '/cover-letters' },
  resume: { path: '/resume' },
  experiences: { path: '/experiences' },
  experience: { path: '/experiences/seed-exp-capstone' },
  paste: { path: '/cover-letters/paste' },
  new: { path: '/cover-letters/new' },
  letter: {
    path: async (page) => {
      const { coverLetters } = await api(page, 'GET', '/cover-letters')
      const generated = coverLetters.find((c) => c.kind === 'generated') ?? coverLetters[0]
      return `/cover-letters/${generated.id}`
    },
  },
  write: {
    path: async (page) => {
      const { coverLetters } = await api(page, 'GET', '/cover-letters')
      const generated = coverLetters.find((c) => c.kind === 'generated')
      if (!generated) return null
      return `/cover-letters/${generated.id}/items/${generated.items[0].id}`
    },
  },
  check: {
    path: async (page) => {
      const { check } = await api(page, 'POST', '/cover-letters/seed-cl-1/checks')
      const s = check.sentences[1] ?? check.sentences[0]
      await api(page, 'POST', `/checks/${check.id}/sentences/${s.id}/start`)
      await api(page, 'POST', `/checks/${check.id}/sentences/${s.id}/answers`, {
        text: '많이 올랐어요. 체감상 그 정도였어요.',
      })
      return `/checks/${check.id}`
    },
  },
}

const names = wanted.length ? wanted : Object.keys(screens)
const unknown = names.filter((n) => !screens[n])
if (unknown.length)
  throw new Error(
    `없는 화면: ${unknown.join(', ')} (있는 화면: ${Object.keys(screens).join(', ')})`,
  )

const server = await createServer({
  root,
  server: { port: 0, strictPort: false },
  logLevel: 'error',
})
await server.listen()
const base = server.resolvedUrls.local[0].replace(/\/$/, '')
const outDir = path.join(root, 'shots', tag)
await mkdir(outDir, { recursive: true })
const browser = await chromium.launch()

try {
  for (const name of names) {
    const s = screens[name]
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    })
    const page = await ctx.newPage()
    await page.goto(`${base}/`)
    await page.evaluate(() => localStorage.clear())
    if (s.login !== false) {
      await page.goto(`${base}/login`)
      await page.getByLabel('이메일').fill(email)
      await page.getByLabel('비밀번호').fill(password)
      await page.getByRole('button', { name: '로그인' }).click()
      await page.waitForURL((u) => !u.pathname.startsWith('/login'))
    }
    const target = typeof s.path === 'function' ? await s.path(page) : s.path
    if (!target) {
      console.log(`- ${name}: 건너뜀(필요한 데이터가 없음)`)
      await ctx.close()
      continue
    }
    await page.goto(`${base}${target}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1200) // 목 AI 지연(800ms)과 자동 시작 호출을 기다린다
    const file = path.join(outDir, `${name}.png`)
    await page.screenshot({ path: file, fullPage: true })
    console.log(`- ${name}: ${path.relative(root, file)} (${target})`)
    await ctx.close()
  }
} finally {
  await browser.close()
  await server.close()
}
