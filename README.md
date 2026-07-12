# Water Polo Club Administration Monorepo

This repository is the initialization scaffold for a reusable, white-labeled water polo club administration platform.

The MVP is organized as a single monorepo so the backend API, admin web app, landing page, and shared packages can evolve together while still deploying independently.

## Architecture

- `apps/api`: Express + TypeScript backend, Prisma integration, authentication, RBAC, Contentful upload orchestration, and email workflows.
- `apps/admin-web`: React + Vite + Tailwind admin panel for admins and coaches.
- `apps/landing-page`: React + Vite + Tailwind public-facing single-page website.
- `apps/mobile`: Reserved placeholder for the future Expo mobile app in Phase 2.
- `packages/database`: Shared Prisma schema, migrations, and seed scripts.
- `packages/api-client`: Shared typed API layer for frontend consumers.
- `packages/shared-types`: Cross-app domain types and DTO contracts.
- `packages/ui`: Shared design-system primitives that enforce the flat, hard-edge UI language.
- `packages/config-eslint` and `packages/config-typescript`: Shared workspace configuration packages.
- `cms/contentful`: Contentful integration notes and future helper scripts.
- `infra`: Deployment and environment notes for Neon, Render, and Netlify.
- `docs`: Architecture decisions, workflows, and implementation notes.

## Folder Structure

```text
.
|-- apps
|   |-- admin-web
|   |   |-- public
|   |   `-- src
|   |-- api
|   |   |-- prisma
|   |   |-- src
|   |   `-- tests
|   |-- landing-page
|   |   |-- public
|   |   `-- src
|   `-- mobile
|       |-- app
|       `-- assets
|-- cms
|   `-- contentful
|-- docs
|-- infra
|   |-- neon
|   |-- netlify
|   `-- render
|-- packages
|   |-- api-client
|   |   `-- src
|   |-- config-eslint
|   |-- config-typescript
|   |-- database
|   |   |-- prisma
|   |   `-- src
|   |-- shared-types
|   |   `-- src
|   `-- ui
|       `-- src
|-- package.json
|-- pnpm-workspace.yaml
`-- turbo.json
```

## Key Decisions

- Monorepo over separate repositories:
  React frontends, backend contracts, Prisma models, and white-label settings benefit from shared types and coordinated versioning.
- White-labeling is a first-class requirement:
  club name, logo, contact info, and similar branding should come from a `ClubSettings` singleton instead of frontend constants.
- UI system is intentionally strict:
  all future components should preserve the hard-edge minimalist style with `rounded-none`, sharp borders, flat color blocks, and no shadows.
- Shared packages reduce drift:
  DTOs, API client helpers, validation schemas, and design primitives should live in packages instead of being duplicated across apps.

## Deployment Topology

- `apps/api`: Render deployment, connected to Neon PostgreSQL.
- `apps/admin-web`: Netlify deployment for authenticated admin tooling.
- `apps/landing-page`: Netlify deployment for the public SPA.
- `cms/contentful`: Contentful used for profile-image/media workflows and landing-page news content.

## Recommended Build Order

1. Implement `packages/database` and `apps/api` first: Prisma schema, auth, seed data, CRUD routes, and signup approval workflows.
2. Build `apps/admin-web` after backend contracts stabilize: auth flow, layout, dashboard, approvals, CRUD modules, and settings.
3. Build `apps/landing-page` once public API endpoints and Contentful models are in place.
4. Activate `apps/mobile` in Phase 2 once the backend and shared packages are mature enough to reuse.

## Current Status

This scaffold intentionally contains no feature implementation yet. It establishes the workspace shape and architecture so the next prompt can focus on backend and database delivery without restructuring later.
