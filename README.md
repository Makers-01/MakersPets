# MakersPet

MakersPet is a single-account AI desktop pet system: one backend, one admin console, one web chat surface, and one Electron desktop pet powered by your own model keys.

## What is already here

- Next.js admin console
- MySQL + Prisma data layer
- Provider / API Key / model / skill / pet configuration
- Web chat with persisted history
- Distilled memory
- Reminder scheduler and reminder history
- Electron desktop pet
- Custom pet asset support
- Live time and weather context

## Stack

- Next.js App Router
- TypeScript
- Prisma
- MySQL
- Electron

## Requirements

Before you start on a new computer, make sure you have:

- Node.js 20+
- npm
- MySQL 8+ or compatible
- Git
- A GitHub SSH key if you want to push changes back

## Clone on another computer

```bash
git clone git@github.com:Makers-01/MakersPets.git
cd MakersPets
```

## Environment

Copy the example file:

```bash
cp .env.example .env
```

Then edit `.env`.

Example:

```env
NEXT_PUBLIC_APP_NAME="MakersPet"
MAKERPET_ADMIN_LABEL="Lin's MakersPet Console"
DATABASE_URL="mysql://root:password@127.0.0.1:3306/makerspet"
```

What you need to change:

- `DATABASE_URL`
  - Point it at the MySQL instance on that computer
- `MAKERPET_ADMIN_LABEL`
  - Optional, purely for your own display text

## Database setup

Create a MySQL database first.

Example:

```sql
CREATE DATABASE makerspet CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then run the local setup command:

```bash
npm install
npm run setup:local
```

That command will:

- generate Prisma client
- push the current schema
- seed the default MakersPet data

## Run the app

Start the web app:

```bash
npm run dev
```

Open:

- [http://127.0.0.1:3000](http://127.0.0.1:3000)
- [http://127.0.0.1:3000/admin](http://127.0.0.1:3000/admin)

## Run the desktop pet

Start the Electron shell:

```bash
npm run desktop:dev
```

You can also launch it from the admin console:

- `系统`
- `桌面宠物`
- `启动桌宠`

## Add your model key

The project seeds the `DeepSeek` provider and `deepseek-v4-pro` model profile, but your real key is not stored in the repo.

You can add a key in either place:

### Option 1: Admin UI

Open:

- `/admin`
- `接入`
- `新增 API Key`

### Option 2: Script

```bash
npm run api-key:store -- --provider deepseek --label "DeepSeek primary" --key "YOUR_KEY"
```

Then test it:

```bash
npm run provider:test
```

## Common commands

```bash
npm run dev
npm run desktop:dev
npm run setup:local
npm run prisma:generate
npm run prisma:push
npm run db:seed
npm run typecheck
```

## Data that is local and not pushed

These stay local by design:

- `.env`
- `node_modules`
- `.next`
- desktop runtime pid files
- temp/output folders

## If you want the other computer to feel the same

Besides cloning the repo, copy or recreate:

- the same MySQL data, or at least rerun seed and then re-enter your settings
- your model API keys
- your preferred reminder timezone
- your default location for live weather/time context
- any custom provider / model / skill / task configuration you created later

If you want a truly identical second machine, the easiest route is:

1. clone the repo
2. set up `.env`
3. restore or recreate the MySQL database
4. run `npm install`
5. run `npm run setup:local`
6. add your model key
7. start web + desktop

## Current repo status

This repo is currently an MVP, but it already includes:

- admin control plane
- web chat
- desktop pet shell
- reminder runtime
- memory tools
- pet asset integration

The next work is mostly product polish, richer management, and stronger deployment ergonomics.
