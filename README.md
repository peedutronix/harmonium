# Play Harmonium

Play Harmonium is a browser-based harmonium practice site built on top of a modern Next.js SaaS template. The project focuses on fast online play, SEO-friendly landing pages, blog content, and room for future premium features.

## Core Features

- Play harmonium online with keyboard shortcuts and touch input
- Switch between Sargam and Western note labels
- Adjust octave, transpose, and volume in the browser
- Blog, pricing, auth, admin, and settings pages ready for expansion
- Postgres-backed auth and RBAC support from the template foundation

## Local Development

1. Install dependencies with `pnpm install`
2. Start PostgreSQL and set `DATABASE_URL`
3. Run `pnpm db:push`
4. Seed defaults with `pnpm rbac:init` and `pnpm config:init`
5. Start the app with `pnpm dev`

## Environment Files

- Local development: `D:\bikai\saas\harmonium\.env.development`
- Production values: `D:\bikai\saas\harmonium\.env.production`
- Shared example: `D:\bikai\saas\harmonium\.env.example`

## Deployment

- Production domain: [playharmonium.com](https://playharmonium.com)
- GitHub repository: [bikai9289/Harmonium](https://github.com/bikai9289/Harmonium)
- Recommended hosting: Vercel

## Docs

Project planning, setup notes, and test logs live under `D:\bikai\saas\harmonium\doc`.
