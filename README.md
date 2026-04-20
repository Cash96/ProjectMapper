# ProjectMapper

ProjectMapper is an internal command center for founder-led AI software migration.

This repository is the hosted control plane. It provides:

- a lightweight password gate for the single operator
- a command-center UI for projects, doctrine, analysis, tasks, reviews, reports, execution state, and testing
- environment-driven integration wiring for MongoDB, Gemini, GitHub, and Cloud Run
- Docker-compatible deployment for Google Cloud Run
- Playwright smoke testing for local and live verification

## Stack

- Next.js App Router
- Tailwind CSS v4
- MongoDB driver
- Playwright
- Docker / Cloud Run compatible build output

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Configure local environment.

```bash
cp .env.example .env.local
```

3. Start the app.

```bash
npm run dev
```

4. Open http://localhost:3000.

The operator gate expects:

- username: `cash96`
- password: value from `.env.local`

## Environment Variables

Core variables are defined in `.env.example`.

Important values:

- `APP_GATE_USERNAME`
- `APP_GATE_PASSWORD`
- `APP_GATE_SECRET`
- `MONGODB_URI`
- `GEMINI_API_KEY`
- `GITHUB_REPO_A_URL`
- `GITHUB_REPO_B_URL`
- `GCP_PROJECT_ID`
- `CLOUD_RUN_SERVICE`
- `CLOUD_RUN_REGION`

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test:e2e
```

## Cloud Run Deployment

Deploy from the repository root:

```bash
gcloud run deploy "$CLOUD_RUN_SERVICE" \
	--source . \
	--project "$GCP_PROJECT_ID" \
	--region "$CLOUD_RUN_REGION" \
	--allow-unauthenticated \
	--set-env-vars "APP_BASE_URL=<cloud-run-url>,APP_GATE_USERNAME=cash96,APP_GATE_PASSWORD=<password>,APP_GATE_SECRET=<long-random-secret>,GITHUB_REPO_A_URL=https://github.com/Revolution-Ed/RevolutionEd.git,GITHUB_REPO_B_URL=https://github.com/Cash96/Revolution_ed_v2.git"
```

Cloud Run remains publicly reachable at the service URL, but the application itself is gated by the operator login.

## Smoke Testing

Run the Playwright smoke suite against local or deployed targets.

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run test:e2e
```

or

```bash
PLAYWRIGHT_BASE_URL=https://your-service-url npm run test:e2e
```

## Repository Inputs Confirmed

The following repositories were verified as readable and shallow-cloneable from this machine:

- RevEd V1: https://github.com/Revolution-Ed/RevolutionEd.git
- RevEd V2: https://github.com/Cash96/Revolution_ed_v2.git
