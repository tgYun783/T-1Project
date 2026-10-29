import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');
const kitScenarios = join(repoRoot, '..', 'loopthon-starter', 'workflows', 'scenarios.yml');

const section = (doc: string, heading: string) => {
  const start = doc.indexOf(`\n${heading}\n`);
  if (start < 0) return '';
  const next = doc.indexOf('\n## ', start + heading.length + 2);
  return doc.slice(start, next < 0 ? undefined : next);
};

// 팀원·심사자가 README만 보고 서버를 띄우고 검사할 수 있어야 한다.
describe('C1-8 README.md', () => {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');

  it('설치·실행 has local, docker and check commands', () => {
    const body = section(readme, '## 설치·실행');
    expect(body).toContain('cd server && npm install && npm run start:dev');
    expect(body).toContain('docker compose up -d --build');
    expect(body).toContain('npm run check');
  });

  it('환경변수 table lists SESSION_SECRET', () => {
    expect(section(readme, '## 환경변수')).toMatch(/^\| `SESSION_SECRET` \|/m);
  });

  // 배포 담당이 HTTPS에서만 Secure를 켜야 한다는 것을 README만 보고 알 수 있어야 한다(C2-5).
  it('환경변수 table lists COOKIE_SECURE', () => {
    expect(section(readme, '## 환경변수')).toMatch(/^\| `COOKIE_SECURE` \|.*false/m);
  });
});

type Step = { uses?: string; run?: string; with?: Record<string, unknown>; 'working-directory'?: string };
type Job = { defaults?: { run?: { 'working-directory'?: string } }; steps?: Step[] };
type Workflow = { on?: unknown; jobs?: Record<string, Job> };

// 주최 측 E2E와 같은 순서로 미리 돌려 보려면 키트 워크플로를 고치지 않고 써야 한다.
describe('C1-8 .github/workflows/scenarios.yml', () => {
  const path = join(repoRoot, '.github', 'workflows', 'scenarios.yml');

  it('exists and parses as YAML', () => {
    const wf = load(readFileSync(path, 'utf8')) as Workflow;
    expect(wf.jobs).toHaveProperty('scenarios');
  });

  // 키트는 레포 밖 로컬 전용이라 CI에는 없다. 있을 때만 바이트 비교한다.
  it('is a byte-for-byte copy of the kit when the kit is present', () => {
    const copied = readFileSync(path);
    const kit = existsSync(kitScenarios) ? readFileSync(kitScenarios) : copied;
    expect(copied.equals(kit)).toBe(true);
  });
});

// PR마다 서버 typecheck·lint·test가 돌아야 main에 깨진 코드가 들어가지 않는다.
describe('C1-8 .github/workflows/ci.yml', () => {
  const wf = load(readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf8')) as Workflow;
  const jobs = Object.values(wf.jobs ?? {});

  const inServer = (job: Job, step: Step) =>
    (step['working-directory'] ?? job.defaults?.run?.['working-directory']) === 'server' ||
    (step.run ?? '').includes('--prefix server');

  it('runs npm ci and npm run check in server with Node 22', () => {
    const ok = jobs.some((job) => {
      const steps = job.steps ?? [];
      const node22 = steps.some(
        (s) => (s.uses ?? '').startsWith('actions/setup-node') && String(s.with?.['node-version']) === '22',
      );
      const ci = steps.some((s) => /npm( --prefix server)? ci\b/.test(s.run ?? '') && inServer(job, s));
      const check = steps.some((s) => /npm( --prefix server)? run check\b/.test(s.run ?? '') && inServer(job, s));
      return node22 && ci && check;
    });
    expect(ok).toBe(true);
  });

  // CI 검사는 비밀값 없이 돌아야 한다(AI 비용·키 노출 방지).
  it('uses no secrets', () => {
    expect(JSON.stringify(wf)).not.toContain('secrets.');
  });
});
