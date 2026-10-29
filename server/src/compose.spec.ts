import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

const repoRoot = join(__dirname, '..', '..');

type Service = {
  image?: string;
  build?: { context?: string; args?: Record<string, string> };
  ports?: string[];
  container_name?: string;
  env_file?: unknown;
  environment?: Record<string, string>;
  depends_on?: string[] | Record<string, { condition?: string }>;
  volumes?: string[];
  healthcheck?: { test?: string[] | string };
};
type Compose = { services: Record<string, Service>; volumes?: Record<string, unknown> };

// 주최 측은 배포 사이트가 아니라 이 docker-compose.yml로 빈 DB에서 앱을 직접 띄운다.
describe('C1-5 docker-compose.yml', () => {
  const compose = load(readFileSync(join(repoRoot, 'docker-compose.yml'), 'utf8')) as Compose;
  const { app, server, db } = compose.services;

  it('has exactly app, server, db services', () => {
    expect(Object.keys(compose.services).sort()).toEqual(['app', 'db', 'server']);
  });

  // 3000 공개는 app(nginx) 하나뿐이고, 정적 프런트는 루트 Dockerfile 그대로 빌드한다.
  it('app keeps the root nginx build, publishes 3000, depends on server', () => {
    expect(app.ports).toEqual(['3000:3000']);
    expect(app.build?.context).toBe('.');
    expect(app.depends_on).toContain('server');
  });

  it('server builds from server/ with RELEASE_ID arg and no ports', () => {
    expect(server.build?.context).toBe('server');
    expect(server.build?.args).toHaveProperty('RELEASE_ID');
    expect(server.ports).toBeUndefined();
  });

  // 환경변수 이름은 대회 규칙으로 고정이고, 시드 값은 ${}가 아닌 리터럴이어야 주최 측이 바로 로그인한다.
  it('server environment has fixed names and literal seed values', () => {
    const env = server.environment ?? {};
    expect(env.DATABASE_URL).toBe('mongodb://db:27017/app');
    expect(env.SEED_USER_EMAIL).toBe('seeker@example.com');
    expect(env.SEED_USER_PASSWORD).toBe('loopthon-2026');
    expect(typeof env.SESSION_SECRET).toBe('string');
    expect(env.SESSION_SECRET).not.toBe('');
    expect(env.SESSION_SECRET).not.toContain('${');
    expect(env.AI_GATEWAY_API_KEY).toBe('${AI_GATEWAY_API_KEY:-}');
    expect(env).toHaveProperty('RELEASE_ID');
  });

  // compose는 HTTP로 뜨므로 Secure 쿠키를 끄지 않으면 브라우저가 sid를 버려 로그인이 유지되지 않는다(C2-5).
  it('server environment sets COOKIE_SECURE to literal "false"', () => {
    expect(server.environment?.COOKIE_SECURE).toBe('false');
  });

  // DB가 응답하기 전에 서버가 뜨면 시드·연결이 실패한다.
  it('server waits for healthy db', () => {
    const deps = server.depends_on as Record<string, { condition?: string }>;
    expect(deps.db.condition).toBe('service_healthy');
  });

  it('db is mongo:7 with db-data volume and ping healthcheck', () => {
    expect(db.image).toBe('mongo:7');
    expect(db.volumes?.some((v) => v.startsWith('db-data:'))).toBe(true);
    expect(compose.volumes).toHaveProperty('db-data');
    const test = db.healthcheck?.test;
    expect(Array.isArray(test) ? test.join(' ') : test).toContain("db.adminCommand('ping')");
  });

  // 주최 측 실행 환경에서 포트·컨테이너 이름이 겹치거나 없는 env 파일을 찾으면 기동이 실패한다.
  it('only app has ports; no container_name or env_file anywhere', () => {
    for (const [name, svc] of Object.entries(compose.services)) {
      if (name !== 'app') expect(svc.ports).toBeUndefined();
      expect(svc.container_name).toBeUndefined();
      expect(svc.env_file).toBeUndefined();
    }
  });
});

// 브라우저는 3000(nginx) 하나로만 들어오므로 /api/와 /__health는 nginx가 server로 넘겨야 한다.
describe('C1-5 deploy/nginx.conf.template', () => {
  const conf = readFileSync(join(repoRoot, 'deploy', 'nginx.conf.template'), 'utf8');
  const block = (header: string) => {
    const start = conf.indexOf(header);
    return start < 0 ? '' : conf.slice(start, conf.indexOf('}', start) + 1);
  };

  it('proxies /api/ to server', () => {
    expect(block('location /api/ {')).toContain('proxy_pass http://server:3000;');
  });

  // releaseId는 서버가 RELEASE_ID로 답해야 한다. nginx가 직접 return하면 서버 상태와 무관하게 200이 나간다.
  it('proxies /__health to server instead of returning directly', () => {
    expect(block('location = /__health {')).toContain('proxy_pass http://server:3000/__health;');
    expect(conf).not.toContain('return 200');
  });

  // 서버가 원래 프로토콜·호스트를 알아야 HTTPS 배포에서 Secure 세션 쿠키를 발급한다(C2-5 trust proxy와 짝).
  it.each(['location /api/ {', 'location = /__health {'])('%s forwards Host and X-Forwarded-* headers', (header) => {
    const body = block(header);
    expect(body).toContain('proxy_set_header Host $host;');
    expect(body).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;');
    expect(body).toContain('proxy_set_header X-Forwarded-Proto $scheme;');
  });

  it('keeps SPA fallback', () => {
    expect(block('location / {')).toContain('try_files $uri /index.html;');
  });
});
