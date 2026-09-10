# tajammalhussain.co.uk

Personal portfolio for Tajammal Hussain — Data Analyst progressing toward Data Engineer. Built on
Astro + Tailwind CSS (frontend) and Cloudflare Workers + D1 + R2 + KV (backend), deployed to
Cloudflare Pages and Workers.

The guiding rule for this whole project: **everything on it is real and verifiable**. The three
data pipelines under `/live` genuinely run on a schedule against real public APIs — nothing is a
static screenshot or a fixture pretending to be live. Case studies describe real work with
proprietary details generalised (see [ARCHITECTURE.md](./ARCHITECTURE.md) for what that means in
practice).

## Stack

- **Frontend**: Astro 5 (static output), Tailwind CSS v4, MDX for case studies, Chart.js for live
  data charts (Mermaid diagrams are pre-rendered to static SVG at build time — see
  [`src/lib/mermaid-render.ts`](./src/lib/mermaid-render.ts)).
- **Backend**: A single Cloudflare Worker (`worker/`) handling three scheduled pipelines, a
  documented public API, an Access-gated admin API, and a GitHub OAuth proxy for the content CMS.
- **Data**: D1 (SQLite) for silver/gold tables and operational metadata, R2 for immutable raw
  ("bronze") payloads, KV for API response caching and rate limiting.
- **Admin**: Cloudflare Access (Zero Trust SSO) gates `/admin/*`; a bespoke ops dashboard at
  `/admin/ops`; a git-backed Sveltia/Decap CMS at `/admin/content`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design, data flow, and deployment
topology.

## Local development

You need two terminals running at once — the frontend and the Worker are separate local servers
that talk to each other over HTTP.

```bash
# Terminal 1 — the Cloudflare Worker (API + pipelines), backed by local D1/R2/KV via Miniflare
cd worker
npm install
npm run d1:migrate:local   # first time only, or after a schema change
npm run dev                # http://localhost:8787

# Terminal 2 — the Astro frontend
npm install
npm run dev                # http://localhost:4321
```

Copy `.env.example` to `.env` first — it sets `PUBLIC_API_BASE_URL=http://localhost:8787` so the
frontend's live-data widgets talk to your local Worker instead of production.

The Worker's cron triggers don't fire automatically under `wrangler dev`. To manually run a
pipeline locally (equivalent to what the real Cron Trigger does in production):

```bash
curl -X POST http://localhost:8787/api/admin/pipelines/carbon/run
curl -X POST http://localhost:8787/api/admin/pipelines/housing/run
curl -X POST http://localhost:8787/api/admin/pipelines/meta/run
```

In local dev, `/admin/ops` and `/api/admin/*` skip Cloudflare Access entirely (there's no Access
tenant to check against on a laptop) and resolve to a fixed `dev@localhost` identity — see
[`worker/src/lib/access.ts`](./worker/src/lib/access.ts) for exactly when that bypass does and
doesn't apply.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Astro dev server |
| `npm run build` | Generate OG images + Mermaid SVGs, typecheck, build static site to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | ESLint (Astro + TypeScript) |
| `npm run format` | Prettier, write mode |
| `npm run typecheck` | `astro check` |
| `npm test` / `npm run test:coverage` | Vitest unit tests (pure pipeline logic, ≥80% coverage) |
| `npm run test:e2e` | Playwright E2E (desktop + mobile, includes axe-core a11y checks) |
| `npm run lhci` | Lighthouse CI against a production build (target: ≥95, all categories) |
| `npm --prefix worker run dev` | Worker dev server (Miniflare-backed D1/R2/KV) |
| `npm --prefix worker run test:integration` | Worker integration tests — hit real external APIs |
| `npm --prefix worker run deploy` | Deploy the Worker (needs Cloudflare credentials) |

## Testing philosophy

- **Unit tests** cover pure pipeline logic only (transform/aggregate functions, data-quality
  checks) — see `vitest.config.ts`'s coverage `include` list for exactly which files.
- **Worker integration tests** run against Miniflare's real D1/R2/KV bindings, and several
  deliberately hit the *real* external APIs (UK Carbon Intensity, HM Land Registry) rather than
  mocking them, because a mock can't tell you the real API's response shape changed.
- **E2E tests** include one deliberate failure-path suite (`tests/e2e/live-data.spec.ts`) that
  blocks the API and asserts the UI shows an honest error state — never stale or fabricated data.
- **Lighthouse CI** enforces ≥95 across performance, accessibility, best practices, and SEO on
  every page type. See `scripts/lighthouse-check.mjs` for a local-only workaround for a Windows +
  Node 24 `chrome-launcher` cleanup bug that doesn't reproduce in the Ubuntu-based CI runner.

## Repository layout

```
src/                  Astro frontend (pages, components, content collections)
worker/               Cloudflare Worker: pipelines, public API, admin API, OAuth proxy
worker/migrations/    D1 schema (idempotent, IF NOT EXISTS)
public/admin/content/ Sveltia/Decap CMS (config.yml + entry HTML)
public/admin/ops is served from src/pages/admin/ops — the bespoke dashboard, not a static file
scripts/              Build-time tooling (OG image generation, local Lighthouse runner)
tests/                Root-level unit tests + Playwright E2E suite
worker/tests/         Worker integration tests (Miniflare)
```

## Contributing

This is a personal portfolio, not an open-source project accepting external contributions — but
if you're reading the source for reference, `ARCHITECTURE.md` is the best starting point.
