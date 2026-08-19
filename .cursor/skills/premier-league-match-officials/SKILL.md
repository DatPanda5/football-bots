---
name: premier-league-match-officials
description: Polls the Premier League PulseLive API and official news articles for match officials, extracting only the MAIN referee and VAR. Use when the user asks to fetch, verify, refresh, or post Premier League referee appointments, especially for an Everton fixture or matchweek.
---

# Premier League Match Officials

Use this workflow to retrieve the on-pitch referee and VAR for a Premier League fixture.

## Preferred source: PulseLive API

The official site uses these endpoints:

```text
https://footballapi.pulselive.com/football/competitions/1/compseasons
https://footballapi.pulselive.com/football/compseasons/{seasonId}/gameweeks
https://footballapi.pulselive.com/football/fixtures
https://footballapi.pulselive.com/football/fixtures/{fixtureId}
```

Include this header on every request:

```text
Origin: https://www.premierleague.com
```

Determine the current season ID from `compseasons`; do not hard-code it permanently. Find the target gameweek from `compseasons/{seasonId}/gameweeks`. Fetch fixtures, filter client-side by `gameweek.gameweek`, then request each fixture detail.

From `matchOfficials`, extract only:

```python
main = next((o["name"]["display"] for o in officials if o.get("role") == "MAIN"), None)
var = next((o["name"]["display"] for o in officials if o.get("role") == "VAR"), None)
```

Do not report assistant referees, fourth officials, or assistant VAR unless specifically requested.

## Important API behavior

- The fixture list may not reliably honor a gameweek query parameter; paginate and filter the returned `gameweek.gameweek` value.
- Upcoming appointments may be absent from fixture details even after the Premier League has published its news article.
- Treat missing `matchOfficials`, missing `MAIN`, or missing `VAR` as “not available from API yet”; do not infer an appointment.
- Match detail IDs are numeric PulseLive fixture IDs.

## Official news fallback and verification

If the API has no officials, search the official Premier League news site for:

```text
https://www.premierleague.com/en/news
```

Match-official article URLs follow this general form, but the article ID cannot be calculated from the gameweek:

```text
https://www.premierleague.com/en/news/{articleId}/match-officials-for-matchweek-{N}
```

Parse each article’s official paragraph, supporting both HTML variants:

- `Referee: Name.`
- `Referee</strong>: Name.`

Extract only the `Referee` and `VAR` values. Use the article to verify or temporarily report appointments, clearly labeling the source when PulseLive has not populated yet.

## Everton lookup

Everton’s Premier League team ID is `7`. Prefer matching the fixture’s team ID rather than display-name text. Report the fixture, MAIN referee, VAR, source, and whether both values are confirmed.

## Output format

Use this compact format:

```text
Everton vs {opponent}
MAIN: {referee or Not available}
VAR: {official or Not available}
Source: {PulseLive API | official PL article}
Status: {confirmed | article published, API pending | unavailable}
```

Never silently substitute article data for API data. If the two sources disagree, report the discrepancy and show both values.
