# Kickoff prompt — Phase F11: buscosun Fusion 11 („Fusion 10a“) — the two acceptance defects of Fusion 10 removed, re-tested (auto mode)

> **Before you paste this (Jan):** the work of phase F10 lies on the local branch `fusion-10` (HEAD `38d4b1d`, tags
> `f10-lauf-1…3`; nothing on `main`). Start a fresh Claude Code session in `C:\dev\buscosun-web` in **auto mode**, make sure
> `git status` shows nothing uncommitted under `src/`, `scripts/` or `audit/pruefstand/` that is not yours, and paste the
> block below. The session works on a new branch `fusion-11` created from `fusion-10` — no merge to `main` is needed first.
> Prompts to Claude Code are in English; all documentation the session writes stays German.

---

You are working on **buscosun** (`C:\dev\buscosun-web`). Read `CLAUDE.md` completely first (status row „Phase F10“ and the
rules), then `audit/fusion-10.md` in full — it is the diagnosis, run log and verdict of the session that built buscosun
Fusion 10 — plus `audit/fusion-10/stat.md` and `audit/fusion-10/range.md` (the two sub-features), `MANUELLE-SCHRITTE.md` §45,
`src/pointForecast/fusion/fusionRelease.ts`, `src/pointForecast/fusion/longRange.ts`, the `longRange` block in
`src/pointForecast/cubeSource.ts` (grep `useLongRange`, `lrBundleShrink`), `scripts/fusion10/prescreen.mjs`,
`scripts/fusion10/fit-longrange.mjs`, `scripts/verify-fusion10-identity.mjs`, `audit/pruefstand/README.md`,
`.claude/skills/pruefe-fusion/SKILL.md` and the header of `scripts/pruefstand/run.mjs`.

## Where we stand (facts from `audit/fusion-10.md` §3.5/§6.1)

buscosun Fusion 10 = Fusion 9 + option `longRange: 1`: (1) T, Td and gust blended towards the engine's climatology for leads
> 48 h with weights/σ-scales per variable × lead bin fitted on hindcast slots outside the vault (`LONG_RANGE_TABLE`), wind at
identity; (2) the wind/gust climatology step kept in AT/CH from 126 h (`FUSION10_WIND_SHRINK_FROM_H = 126`,
`FUSION10_WIND_SHRINK_COUNTRIES = ['AT','CH']`). Full test (development set, 23 days): +0,69 % (95 %: +0,51 … +0,92 %), G2–G4
green. Acceptance (track R, 70 vault issues): progress index **+0,97 % (95 %: +0,61 … +1,29 %)**, rank 1 of the ranking, but
verdict **„abgelehnt“** because of exactly two defects:

- **G2:** core cell **t 240–336 h AT −0,44 %** (BH-significant). Cause: the last T bin (241–336 h) has w = 1 and s = 1,05 — no
  blending, only 5 % wider bands, which were already right (coverage 80,8 % → 82,3 %). DE/CH show the same sign (−0,2 %, n. s.).
- **G3:** coverage cell **ws 120–240 h 75,7 % against 76,4 %** for the champion (band 78,3–81,7 %; both below, the candidate
  significantly farther). Cause: the AT/CH wind step shrinks σ (AT band width 3,69 → 3,30 m/s) while gaining almost no CRPS
  there (+0,6 % AT, +0,2 % CH); at 241–336 h the same step gains +8,9/+6,6 %.

Both are written up as **V-F10-7** and **V-F10-8** (audit §6.2). Nothing was changed after the acceptance (leak rule).

## Goal (Jan)

Build **buscosun Fusion 11** — Fusion 10 with these two defects removed and nothing else changed — and run the bench on it:
full test on the development set, then the single acceptance. Success = verdict „Kandidat“ with the progress index against
Fusion 9 on track R above 0 (95 % interval above 0) and G2, G3, G4 green; G1 stays „nicht nachweisbar“ while track P is
empty (the first mature track-P days arrive from 19.10.2026). Report honestly which level you reached; a „nicht nachweisbar“
or another „abgelehnt“ is a valid result when it is what the bench says.

## Honesty rule for this phase (read before building)

The two corrections were derived from Fusion 10's vault results. Therefore: (a) choose the exact form of each correction on
the **hindcast outside the vault** (`prescreen.mjs --set=hindcast`, slots after 2025-09-08) and on the development set, never on
vault numbers; (b) write into the register notes and the audit that the vault cells t 240–336 h and ws 120–240 h are **not
blind** for Fusion 11; (c) track P remains the clean judge — say so in the summary. Never open the vault outside the one
acceptance; never look at vault results of Fusion 11 before it; change nothing after it.

## Time box (2 h 45 min, hard)

| Time | Phase |
|---|---|
| 0:00–0:20 | Orientation; preconditions (below); start the bench warm-up `--modus=vergleich --versionen=fusion-9,fusion-10 --offline` only if the archive has new days (`git -C C:\dev\buscosun-archiv pull --ff-only` first, read only); write start time (UTC) into `audit/fusion-11.md` |
| 0:20–1:00 | Build the two corrections behind ONE new option (below), identity verifier, pre-screen of the variants on hindcast outside the vault (`--set=hindcast --limit=8`) and on the quick set; pick the form by a rule written down BEFORE looking at the numbers |
| 1:00–1:25 | Commit, tag `f11-lauf-1`, register `fusion-11`, `--modus=voll --offline` |
| 1:25–2:25 | If the full test holds (index > 0 with interval above 0, G2–G4 green): the single `--modus=abnahme --offline` (~1 h). If not: fix within the rule, one more `voll`, and skip the acceptance if it cannot start by 1:45 — say so |
| 2:25–2:45 | Documentation, `MANUELLE-SCHRITTE.md` §46, `CLAUDE.md` status row, summary |

## Design of Fusion 11 (what to build)

- `git checkout -b fusion-11 fusion-10`. One new entry at the end of `FUSION_RELEASES`: `n: 11`, `date`, `ref: 'Phase F11,
  audit/fusion-11.md'`, a NEW option key (e.g. `option: 'longRangeFix', value: FUSION11_LONG_RANGE_FIX = 1`; option keys must be
  unique per entry, and the entry of Fusion 10 stays as it is — `verify:fusion-release` checks ascending numbers without gaps).
  The Fusion 10 entry must stay switched on (`FUSION10_LONG_RANGE = 1`), otherwise `FUSION_CURRENT` stops at 9.
- In `cubeSource.ts` the new option changes exactly two things of the `longRange` bundle (constants in `longRange.ts`, English
  doc comments like the existing ones; with the option absent the engine computes exactly Fusion 10, byte-identical):
  1. **V-F10-7:** the T bin 241–336 h uses w = 1, s = 1 (identity). Variant to pre-screen: refit the T row on the out-of-vault
     hindcast with a monotonicity constraint (w and s non-increasing/non-decreasing across bins, `fit-longrange.mjs` has the grid)
     — take the refit only if it beats the plain identity on the out-of-vault pre-screen AND the quick set; otherwise identity.
  2. **V-F10-8:** the AT/CH wind step starts at 241 h (`FUSION11_WIND_SHRINK_FROM_H = 241`) instead of 126 h. Variant to pre-screen:
     keep 126 h but with a σ floor (the shrunk σ never below the member's σ, so the step moves the mean only). Rule, written down
     first: the variant must not lower the ws coverage at 120–240 h below Fusion 9's on both pre-screen sets and must not lose
     CRPS in any ws/gust cell; among variants that pass, take the one with the larger ws CRPS gain at 120–336 h; if none passes,
     take 241 h.
- Identity: run `npm run verify:fusion10-identity -- --on=<json of the new option>` against the base worktree
  `C:\dev\buscosun-web-wt\base` (the Fusion 9 base; recreate it with `git worktree add --detach … 4bdade3` if it is gone) —
  option off must be byte-identical to the base on ≥ 3 archive days and one out-of-vault hindcast slot, option on must differ
  only at leads > 48 h. Note: with `--on` you must pass BOTH `longRange:1` and the new option; the tool's `parseOpts` accepts the
  relaxed form `longRange:1,longRangeFix:1`. Add a second negative control that compares Fusion 11 against Fusion 10 (both on):
  differences only in t 241–336 h and in ws/gust/dd 126–240 h (AT/CH).

## Bench mechanics (verified in F10 — follow exactly)

- Call form (PowerShell, in the repo, never `npm run`, never `2>&1`):
  `node --experimental-strip-types --disable-warning=ExperimentalWarning --import ./scripts/lib/register-ts.mjs scripts/pruefstand/run.mjs <args>`
- Registration needs `FUSION_CURRENT === 11` in committed code and a clean `src/`; the bench then imports the engine from the
  LIVE checkout (src of the commit = src of HEAD) — **never touch `src/` while a bench run is going**; every new commit is a new
  model hash ⇒ `--registriere=fusion-11 --neu --freeze=<UTC session date>` and new conserves of the candidate (≈ 30 s per
  archive day, 15–25 s per vault issue, 3 workers on 4 cores — run nothing heavy in parallel).
- After `--registriere`, append to the register's `notes` (not part of the hash): freeze set under authorization 4; what the
  option changes; the fit windows actually used; that the vault cells t 240–336 h and ws 120–240 h are not blind.
- `verify:fusion-release` B2/B3: no string „buscosun Fusion <n>" in code, no option key of a stand as an object key outside
  `src/pointForecast|src/point` (scripts read the key from `FUSION_RELEASES`).
- Logs: `run.mjs … *> audit\fusion-11\laeufe\<n>-<mode>.log`; reports are written to
  `audit/pruefstand/berichte/fusion-11/<date>-<mode>/` and overwritten on the same day — copy each to
  `audit/fusion-11/laeufe/<n>-<mode>/` right after the run. `.log` files are gitignored (commit the report copies).
- Exit codes as in F10: 2 → authorization 4 (freeze = UTC session date); 3 → stop using the bench, report; 4 → adapter
  contract, change the candidate; 5 → G4 red, fix; 1 → report verbatim.
- PowerShell 5.1 strips the double quotes of a JSON argument (`--opts='{"a":1}'` becomes `{a:1}`): use the `key:value` form
  of `prescreen.mjs`/the identity verifier, or the Bash tool. Git Bash converts `/c/…` paths only as a single argument, not inside
  a comma list (`--compare=C:/…,C:/…`). `Monitor` on `tail -f` of these logs delivers nothing — wait for the background-task
  notification instead.
- Budget: `npm run build` + `npm run budget` before the integration gate; Jan allows raising the totalJs ratchet with a note in
  `budget.json` (never `--update`).

## Authorizations (Jan) — the same as F10

Auto mode, no questions (decide the safest reversible option, log every such decision as `A-F11-n`); engine changes allowed
behind the option with identity proof; bench modes `schnell`/`voll` freely, `abnahme` exactly once; register Fusion 11 with
freeze = UTC session date, status stays `kandidat`, never touch the entries of Fusion 5e … 10; no push, no merge to `main`;
no champion status, no live switch; protocol P1, station network, vault and truth W1 stay sealed; `C:\dev\buscosun-hindcast`,
the archive and the stored conserves are read only. If the vault has already been opened for a Fusion 11 in an earlier session
(check `scripts/pruefstand/register/zugriffe.log`), stop and report instead of opening it again.

## Deliverables

- `audit/fusion-11.md` (German): start time and time log, preconditions, the pre-screen tables with the rule written down
  before the numbers, every bench run (command, sets, index with interval, gates, best/worst core cells, warnings, report copy),
  „Entscheidungen im Auto-Modus“, identity results, the leak declaration, the verdict, open points `V-F11-n` (Mehrwert +
  Umsetzungsskizze).
- Code on branch `fusion-11` (tags `f11-lauf-<n>`), `npm run typecheck`, `verify:fusion10-identity` (extended), `verify:fusion-release`
  and `verify:pruefstand` green, build + budget before the gate.
- Register entry `fusion-11` (status `kandidat`) and the bench reports.
- `MANUELLE-SCHRITTE.md`: section „buscosun Fusion 11 (Phase F11)“ — what Jan must review, how to merge (`fusion-11` contains
  `fusion-10`; the commit with `n: 11` switches the whole platform to Fusion 11 once on `main`), the date track P allows a real
  acceptance, champion and live-switch steps.
- `CLAUDE.md`: replace the F10 status row by one F11 row (current state only).
- A short German summary for Jan in the fixed answer format of the `pruefe-fusion` skill, plus: what changed against Fusion 10,
  what the out-of-vault pre-screen said before the bench, what the bench said, and whether the vault verdict is to be trusted
  given the non-blind cells.
