# Kickoff prompt — Sounding-Absicherung vor dem DWD-Stichtag 30.11.2026 (klein, ein Commit)

> Paste the block below into a fresh Claude Code session in `C:\dev\buscosun-web`.
> Prompts to Claude Code are in English; all documentation you write stays German (CLAUDE.md, Sprache & Konventionen).
> Scope: exactly one small fix. No new data source, no migration to the new DWD tree — that is phase AM
> (`prompt-atmo-hoehen.md`). If this lands first, AM-1 there is done and only needs re-verifying.

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely first.

## Problem

`src/sources/iconEuSounding.ts` reads ICON-EU pressure levels from the old DWD tree `/weather/nwp/icon-eu/grib/`
(via `/_dwd_opendata`). The DWD removes that tree on **30.11.2026** (`QUELLENMATRIX.md` §6). From then on
`resolveRun()` finds no run and throws — the Atmosphäre Emagramm (`src/atmosphere/AtmosphereProfile.tsx`), everything
derived from it (Föhn, Thermik, Inversion via `profile-derivations.ts`) and the 3D panel (`src/threed/SoundingPanel.tsx`)
show an error instead of a profile.

`src/sources/gfsSounding.ts` already exists with the same `SoundingProfile` shape and the same `fetchSoundingAtPoint`
signature (NOAA GFS, via `/_gfs`, public domain). It is the fallback.

## Goal

The two consumers never break because of the DWD change. ICON-EU stays first choice while it exists; when it is gone,
GFS takes over automatically and the UI says honestly which model the profile comes from.

## Step 0 — branch

- Another session may be working in the main working tree: never switch branches, commit, stash, reset or run a dev
  server there; read git state only with `git --no-optional-locks status`.
- `git fetch origin` → `git worktree add --no-track -b fix/sounding-guard C:/dev/buscosun-web/.wt-sg origin/main`,
  add `.wt-sg/` to `.git/info/exclude`, work only there. `npm ci`; dev server `npx vite --port 5194 --strictPort`.
- This prompt lies untracked in the main tree as `prompt-sounding-guard.md`: copy it into the worktree and include it in
  the commit, then delete exactly that untracked copy from the main tree.

## Step 1 — diagnose (write findings before code)

1. Failure mode today: what happens when the old tree answers 404 (`resolveRun` → 8 HEAD probes → throw), and what when
   a request is aborted. `headOk()` turns every exception into `false` — an abort is then treated like a missing file.
   CLAUDE.md: „ein 404 ist ein Befund, ein Abbruch keiner (`AbortError` ≠ absent)".
2. Time semantics: is the scrubber `hour` meant as „+h from now" (check `atmosphereState.ts` / the URL codec / the store)?
   Both fetchers treat `leadHours` as the step **from their own run start**, so the profile is valid at
   `runAt + hour`, not `now + hour`. GFS runs are older than ICON-EU runs, so the offset gets bigger on fallback.
   Measure today's offset for both sources at +0/+24/+48 h and write it down.
3. GFS works today: fetch a GFS profile at three points (lowland e.g. Frankfurt, Alpine valley e.g. Innsbruck, summit
   e.g. Zugspitze) at +0/+24/+48 h — levels returned, first-call time, cache-hit time.
4. Every place that names ICON-EU as the profile source in the UI (start with `AtmosphereProfile.tsx` 86/114,
   `SoundingPanel.tsx` 74/87–88, `ThermalMap.tsx` 164, `foehn.ts` `PRESSURE_GATE_NOTE`, `AtmospherePage.tsx` 95/128).
5. Does a client-side date register exist that fits (search `SCHEDULED_CHANGES`)? If not, one exported constant.

## Step 2 — implement (minimal)

- New module `src/sources/sounding.ts`:
  `fetchSoundingWithFallback(lat, lon, surfaceM, hour, signal) → Promise<{ profile, source: 'icon-eu' | 'gfs', note?: string }>`.
  - Before `2026-11-30T00:00Z`: try ICON-EU; on „absent" (no run found, too few levels, HTTP 404/410) fall back to GFS
    and set `note` (German, e.g. „ICON-EU nicht verfügbar — Rückfall auf GFS").
  - From the cut-off on: GFS directly, **zero** requests to `/weather/nwp/icon-eu/grib/`.
  - After one „absent" result, skip ICON-EU for 30 min (module memo) — no 8 HEAD probes per marker move.
  - Abort: rethrow, never fall back. Fix `headOk()` so an `AbortError` propagates instead of counting as missing.
  - Both fail: one error that names both sources.
  - Time: request the valid time the scrubber means. If Step 1.2 shows the offset is real, pass the target valid time and
    let each source compute its own step (keep the old signatures working); the returned `validAt` must match the target
    within the source's step resolution.
  - Debug switch `?snd=gfs` forces the GFS path, so Jan can check the post-30.11 state today.
- Consumers: `AtmosphereProfile.tsx` and `SoundingPanel.tsx` use the wrapper; the store carries `source` next to the
  sounding (`SoundingBundle` or a sibling field) so Föhn/Thermik texts can read it.
- Labels from the actual source — one helper, no hard-coded „ICON-EU" left in the listed places:
  - ICON-EU: unchanged wording;
  - GFS: `GFS_SOUNDING_ATTRIBUTION`, „Richtwert (GFS ~25 km, Standard-Druckflächen) — keine Radiosonde";
  - loading text neutral („lädt Modell-Druckflächen …");
  - the `note` visible near the source line when a fallback happened.
  Change SEO/meta text in `AtmospherePage.tsx` only if `verify:seo` stays green; otherwise leave it and note it.
- Do not touch: the meteorology in `gfsSounding.ts`/`soundingMath.ts`/`profile-derivations.ts`, buscosun Fusion,
  `src/point/**`, data repos, Edge Functions, `netlify.toml`, dependencies.

## Step 3 — verify

- New verifier `scripts/verify-sounding-guard.mjs` + npm alias `verify:sounding-guard` (repo style, mocked `fetch`,
  fixtures in the real `SoundingProfile` shape):
  1. old tree 404 → GFS, `source: 'gfs'`, note set;
  2. abort during the ICON-EU probe → `AbortError`, GFS never called;
  3. **negative control:** ICON-EU available → ICON-EU, GFS never called;
  4. date ≥ cut-off → zero requests to the old tree;
  5. both fail → one error naming both;
  6. `validAt` matches the requested valid time for both sources;
  7. memo: second call within 30 min makes no ICON-EU request after an „absent".
- `npm run typecheck`, `build`, `budget` (eagerJs unchanged except a few bytes — state the number), `verify:route-3d`,
  `verify:routing`, `verify:share`, `verify:seo`.
- Live in the dev server: Atmosphäre with a place (Innsbruck) and the 3D sounding panel — normal and with `?snd=gfs`;
  screenshots desktop 1440×900 and mobile 390×844; no console errors.
- `git diff --stat origin/main...HEAD` lists only the files of this fix, the verifier, `package.json` (alias) and the
  audit file.

## Step 4 — deliver

- **One commit** on `fix/sounding-guard`:
  `fix(atmo): fall back to GFS sounding when the old ICON-EU tree is gone (DWD 30.11.)`;
  `git push -u origin fix/sounding-guard`. No merge, no PR, no push to `main`.
- `audit/atmo-sounding-guard.md` (German, short): Befund (Step 1 with numbers), Änderung, Verifier-Ausgabe, Screenshots,
  Commit-Hash, offene Punkte, §„Jans Schritte": merge/cherry-pick **vor dem 30.11.**, check with `?snd=gfs`, on
  30.11. check the live page once. Do not edit `CLAUDE.md` or `MANUELLE-SCHRITTE.md` — name the line Jan should carry over.
- A short German summary for Jan: what changed, the measured time offset from Step 1.2, the commit hash, what he has to do.
