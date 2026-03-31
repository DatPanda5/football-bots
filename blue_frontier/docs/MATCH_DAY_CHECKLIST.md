# Match-day checklist (once a match has kicked off)

Use this **after** a fixture's kickoff time has passed (e.g. Everton vs Burnley) to confirm the bot is behaving correctly.

---

## 1. **`/fixtures`**

- [ ] **Burnley is no longer in the list.**  
  The embed shows "Next 5 Everton Fixtures" — only fixtures **after** the current time.
- [ ] **First fixture is the next match** (e.g. Brentford vs Everton, Sat 11 Apr).  
  You should see 5 upcoming matches; the one that just kicked off (Burnley) is gone.

---

## 2. **`/predict`**

- [ ] **Burnley is not in the dropdown.**  
  The menu is built from the same "next 5 upcoming" list; Burnley should not be selectable.
- [ ] **If someone still has the old menu and picks Burnley:** they get  
  _"That fixture has already kicked off. Run `/predict` again."_
- [ ] **New predictions can only be made for the next match(es)** in the list (e.g. Brentford, Liverpool, …).

---

## 3. **`/listpredictions`**

- [ ] **Shows predictions for the match that just kicked off (Burnley)**  
  While that match is in play, the bot shows the fixture that has the most predictions (the live one).
- [ ] **Title is e.g. "Predictions — Everton vs Burnley"** with all submitted predictions listed.

---

## 4. **`/final` (MOD only)**

- [ ] **Burnley can be selected** in the fixture dropdown (all fixtures appear; server blocks ones that haven't kicked off).
- [ ] **Submitting a result for Burnley works** (Everton score, opponent score, optional scorers).
- [ ] **Choosing a fixture that hasn't kicked off** (e.g. Liverpool) returns  
  _"That fixture hasn't kicked off yet."_

---

## 5. **After you run `/final` for Burnley**

- [ ] **Points are awarded** (exact score, correct result, scorers as configured).
- [ ] **Leaderboard** (`/leaderboard`) shows updated points.
- [ ] **`/listpredictions`** can then show the next fixture with predictions (e.g. Brentford once people predict it), or the next upcoming match.

---

## Quick reference

| Command          | After Burnley kicks off |
|------------------|-------------------------|
| `/fixtures`      | Next 5 = Brentford, Liverpool, West Ham, Manchester City, Crystal Palace (no Burnley). |
| `/predict`       | Menu = same 5; no Burnley. Picking Burnley from an old menu → "already kicked off". |
| `/listpredictions` | Shows **Everton vs Burnley** and all predictions for it. |
| `/final`         | MOD: can enter result for Burnley; other fixtures rejected until their kickoff has passed. |

All timing is driven by **kickoff UTC** in `ALL_FIXTURES` in `index.js`. No Burnley in "upcoming" = `new Date(fixture.kickoffUTC).getTime() <= Date.now()` for that fixture.
