# vivKudoBoard

A simple appreciation board for teams. Create a board for birthdays, farewells, promotions, launches, or any special occasion and share one link. People can add messages, photos, videos and GIFs without creating an account.

## Tech Stack

React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · Supabase · Vercel

## Features

* Create and manage appreciation boards
* No account required for contributors
* Messages, photos, videos and GIFs
* Reactions and moderation
* Edit or delete your own messages
* Realtime updates
* Email notifications
* Responsive design
* Admin dashboard
* Print-friendly boards

## Getting Started

```bash
git clone <your-repo> vivKudoBoard
cd vivKudoBoard

npm install
cp .env.example .env

npm run dev
```

Open `http://localhost:5173`.

Add your Supabase credentials to `.env` before starting the app.

## Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GIPHY_API_KEY=
VITE_APP_URL=
VITE_ALLOWED_EMAIL_DOMAINS=
VITE_MAX_IMAGE_MB=
VITE_MAX_VIDEO_MB=
```

`VITE_GIPHY_API_KEY` is optional. If it is not provided, the GIF option is disabled.

## Supabase Setup

### Local Development

Install the Supabase CLI and start the local stack:

```bash
npm install -g supabase
supabase start
npm run db:reset
```

The local Supabase stack includes Postgres, Auth, Storage and other required services.

### Hosted Supabase Project

Create a Supabase project and add the project URL and anon key to `.env`.

Then link the project and push the database migrations:

```bash
supabase link --project-ref <your-ref>
npm run db:push
```

### Create an Admin

Admin accounts are created separately from the public app.

```bash
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=...
export SEED_ADMIN_EMAIL=you@example.com
export SEED_ADMIN_PASSWORD='your-password'

npm run seed
```

To create demo data as well:

```bash
npm run seed -- --demo
```

Admin login:

```text
/admin/login
```

## Deployment

The application can be deployed to Vercel:

```bash
vercel
vercel --prod
```

Add the required `VITE_*` environment variables in the Vercel project settings.

After deployment, set `VITE_APP_URL` to the production URL and add the URL to the Supabase Authentication redirect settings.

Database migrations are deployed separately:

```bash
npm run db:push
```

If using the optional Edge Functions:

```bash
npm run functions:deploy
```

## Project Structure

```text
src/
├── components/
│   ├── admin/
│   ├── board/
│   ├── common/
│   └── ui/
├── config/
├── hooks/
├── lib/
├── pages/
│   ├── admin/
│   └── public/
├── routes/
├── services/
├── test/
└── types/

supabase/
├── migrations/
├── functions/
└── tests/
```

## Architecture

The application follows a simple layered structure:

```text
Pages
  ↓
Components
  ↓
Hooks
  ↓
Services
  ↓
Lib
  ↓
Supabase
```

Database access is handled through the service layer rather than directly inside UI components.

## Security

Supabase Row Level Security (RLS) is used to control access to boards, entries and admin functionality.

The app also includes:

* Input validation and sanitization
* Upload validation
* Contributor limits
* Board closing dates
* Moderation controls
* Protected admin access
* Database-level permission checks
* Security-focused database tests

The Supabase service role key is only used for server-side/admin operations and should never be exposed through a `VITE_` variable.

## Testing

Run the test suite with:

```bash
npm run test
```

Coverage:

```bash
npm run test:coverage
```

Database and RLS tests:

```bash
npm run db:verify
```

## Useful Scripts

| Command                     | Description                            |
| --------------------------- | -------------------------------------- |
| `npm run dev`               | Start development server               |
| `npm run build`             | Production build                       |
| `npm run typecheck`         | Run TypeScript checks                  |
| `npm run lint`              | Run ESLint                             |
| `npm run test`              | Run unit tests                         |
| `npm run test:coverage`     | Run tests with coverage                |
| `npm run db:start`          | Start local Supabase                   |
| `npm run db:reset`          | Reset local database                   |
| `npm run db:push`           | Push migrations                        |
| `npm run db:diff -- <name>` | Create a migration from schema changes |
| `npm run db:types`          | Generate database types                |
| `npm run db:verify`         | Run database/RLS tests                 |
| `npm run seed`              | Create the first admin                 |
| `npm run functions:serve`   | Run Edge Functions locally             |
| `npm run functions:deploy`  | Deploy Edge Functions                  |

## Adding a New Occasion

Add the new occasion to:

```text
src/types/index.ts
src/config/boardTypes.ts
```

No database migration is required.

## Adding a New Theme

Add the theme to:

```text
src/types/index.ts
src/config/themes.ts
```

Themes are configured through the existing theme system and can be added without changing the database schema.

## License

Internal project.
