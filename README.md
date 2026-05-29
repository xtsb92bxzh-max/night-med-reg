# Night Med Reg

A fictional NHS-inspired night-shift medical registrar browser game.

You navigate a district general hospital overnight, prioritising bleeps, ward reviews, sick patients, system problems, resources, delegation, oversight, and the final handover.

This is a game for entertainment and professional in-joke value. It is not medical education, clinical guidance, or a substitute for local policy, supervision, or judgement.

## Play Locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5173/
```

## Controls

On desktop the top bleep responds to keyboard shortcuts: `A` attend, `C`
clarify, `E` escalate, `H` flag for handover, `D` defer, `X` ignore. While a
patient encounter is open, press `1`–`3` to pick a choice. Your in-progress
shift is saved automatically and resumes if you reload the page.

## Checks

```bash
npm test            # run the Vitest suite
npm run test:watch  # watch mode
npm run typecheck   # tsc --noEmit
npm run lint        # ESLint
npm run format      # Prettier write
npm run build       # type-check + production build
```

Continuous integration (`.github/workflows/ci.yml`) runs type-check, lint,
format check, tests, and a production build on every push and pull request, plus
a non-blocking Lighthouse pass on the built site.

### Test layout

| File                         | Covers                                                |
| ---------------------------- | ----------------------------------------------------- |
| `src/game.test.ts`           | Core engine: time, spawning, deterioration, teams     |
| `src/engine.test.ts`         | RNG reproducibility, stat clamping, endings           |
| `src/content.test.ts`        | Content schema integrity; every encounter is playable |
| `src/App.test.tsx`           | UI render, interactions, save/resume                  |
| `src/keyboard.test.tsx`      | Keyboard shortcuts                                    |
| `src/a11y.test.tsx`          | Accessibility (axe) audits                            |
| `src/persistence.test.ts`    | localStorage save/load/clear                          |
| `src/ErrorBoundary.test.tsx` | Crash recovery screen                                 |

## Deploy With Vercel

1. Create a new GitHub repository.
2. Push this project to GitHub.
3. Go to Vercel and import the GitHub repository.
4. Use the default Vite settings:
   - Build command: `npm run build`
   - Output directory: `dist`
5. Deploy and share the generated Vercel URL.

## Deploy With Netlify

1. Create a new GitHub repository.
2. Push this project to GitHub.
3. Import the repository in Netlify.
4. Use:
   - Build command: `npm run build`
   - Publish directory: `dist`

## Suggested Repo Description

Fictional NHS night-shift medical registrar dungeon-crawler/time-management game.
