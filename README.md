# MakersPet

MakersPet is a single-account AI pet control plane: one backend, one admin console, and one evolving pet/skill/model registry that can later power both a website pet and a desktop pet.

## V1 Goal

- Single-account local admin console
- MySQL-backed provider, API key, model, skill, and pet configuration
- DeepSeek-first bootstrap with room for more providers
- Clean path toward a future Electron desktop pet and a matching web pet

## Stack

- Next.js App Router
- TypeScript
- Prisma
- MySQL

## Local Setup

1. Copy `.env.example` to `.env`
2. Fill in your local MySQL connection string
3. Install dependencies
4. Generate Prisma client
5. Push schema
6. Start the app

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

## Initial Product Shape

- `/` overview page for the MakersPet control plane
- `/admin` for the first admin dashboard
- `/api/health` for runtime checks
- `/api/bootstrap` for the first registry payload

## Still Needed From You

- MySQL connection details for this machine
- Whether you want DeepSeek V4 Pro to be the default chat model, default coding model, or both
- The first pet personality direction for MakersPet itself
