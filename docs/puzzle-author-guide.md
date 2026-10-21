# Puzzle author guide

This guide walks through authoring, validating, and publishing a puzzle with
the live StellarHunts API. It covers the admin puzzle endpoints, the
`puzzle-submission` grading endpoint, and the checks a puzzle must pass before
it is made visible to players.

## Lifecycle at a glance

```text
author (isActive: false)
        │
        ▼
validate (admin read + graded submissions)
        │
        ▼
review (content, answer, reward, security checklists)
        │
        ▼
publish (PATCH ... { "isActive": true })
        │
        ▼
monitor (active discovery, submission attempts, audit log)
```

A puzzle is published by setting `isActive` to `true`. There is no separate
publish transaction, so the same PATCH that activates a puzzle is the action
recorded in the audit log (`puzzle.update`).

## Before you start

The examples assume `curl` and `jq` are installed and are run from the
repository root.

- You need an **admin account**. Get a token with:

  ```bash
  export API_BASE="http://localhost:3001/api/v1"
  export TOKEN="$(
    curl -sS -X POST "$API_BASE/admin/login" \
      -H "Content-Type: application/json" \
      -d '{"email":"admin@example.com","password":"replace-me"}' \
    | jq -r '.access_token'
  )"
  ```

- Send `Authorization: Bearer $TOKEN` on every admin request.
- Answers are compared with `trim().toLowerCase()` on both sides (see
  `PuzzleSubmissionService`). Authors should still publish answers in their
  canonical form and avoid answers that only differ by case.
- Use one of the established difficulty values: `easy`, `medium`, `hard`, or
  `expert`. Discovery filters on the exact string.
- Never put the solution in `title`, `description`, `hint`, or reward
  metadata. The public discovery response deliberately omits `solution` and
  `hint`.

## Template

Copy [`docs/templates/puzzle-template.json`](templates/puzzle-template.json)
and replace the values:

```json
{
  "title": "Base64 Prefix",
  "description": "Identify the start of a Base64-encoded Stellar keyword.",
  "difficulty": "easy",
  "hint": "Base64 groups input bytes in threes and emits four characters per group.",
  "solution": "U3RlbG",
  "isActive": false
}
```

| Field | Required | Rules |
|-------|----------|-------|
| `title` | Yes | Non-empty string, at most 255 characters. Must be specific enough to distinguish it from other puzzles. |
| `description` | Yes | Non-empty string. Explain the challenge without revealing the answer. |
| `difficulty` | Yes | `easy`, `medium`, `hard`, or `expert` (lowercase). |
| `hint` | No | Optional string. Progress from a nudge to a stronger hint; never include the final answer. |
| `solution` | Yes | Non-empty string. Stored server-side and never returned by public discovery. |
| `rewardId` | No | ID of an existing reward. Add it after the reward is created. |
| `isActive` | No | Defaults to `true`. **Create new puzzles with `false`** and activate only after validation. |

Unknown fields are rejected with `400` because the global validation pipe uses
`forbidNonWhitelisted: true`.

## Example walkthrough: "Base64 Prefix"

### 1. Create the puzzle as inactive

```bash
curl -sS -X POST "$API_BASE/admin/puzzles" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @docs/templates/puzzle-template.json
```

The response is the stored puzzle. Save its `id`:

```bash
export PUZZLE_ID="<id from the response>"
```

### 2. Create and attach a reward (optional)

```bash
export REWARD_ID="$(
  curl -sS -X POST "$API_BASE/reward" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Base64 Prefix Badge",
      "description": "Awarded for solving Base64 Prefix.",
      "type": "badge",
      "challengeId": "'"$PUZZLE_ID"'",
      "metadata": { "tier": "bronze" },
      "isActive": true,
      "maxClaims": 1000
    }' | jq -r '.id'
)"
```

Attach it to the puzzle while the puzzle is still inactive:

```bash
curl -sS -X PATCH "$API_BASE/admin/puzzles/$PUZZLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rewardId":"'"$REWARD_ID"'"}'
```

### 3. Validate with graded submissions

Confirm the puzzle is hidden from players:

```bash
curl -sS "$API_BASE/puzzles/active?difficulty=easy" | jq --arg id "$PUZZLE_ID" \
  'map(select(.id == $id)) | length'   # must print 0
```

Run a correct submission with a disposable player ID:

```bash
export PLAYER_ID="validation-$(date +%s)"
curl -sS -X POST "$API_BASE/puzzle-submission" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"'"$PLAYER_ID"'","puzzleId":"'"$PUZZLE_ID"'","answer":"U3RlbG"}'
# {"isCorrect":true,"attempts":1,"feedback":"Correct answer!"}
```

Run a wrong answer, then the correct answer again:

```bash
curl -sS -X POST "$API_BASE/puzzle-submission" \
  -H "Content-Type: application/json" \
  -d '{"playerId":"'"$PLAYER_ID"'","puzzleId":"'"$PUZZLE_ID"'","answer":"wrong"}'
# {"isCorrect":false,"attempts":2,"feedback":"Incorrect answer. Try again."}
```

The endpoint is rate-limited to **5 requests per 60 seconds** per caller. Use
a fresh `playerId` for another batch, or wait for the window to reset.

Inspect the stored record as an admin (solution is returned only here):

```bash
curl -sS "$API_BASE/admin/puzzles/$PUZZLE_ID" \
  -H "Authorization: Bearer $TOKEN" | jq
```

### 4. Review

Send the puzzle ID, template values, and the validation evidence to the
reviewing maintainer. Use the [validation checklist](#validation-checklist)
below as the review record.

### 5. Publish

Activate the puzzle:

```bash
curl -sS -X PATCH "$API_BASE/admin/puzzles/$PUZZLE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"isActive":true}'
```

Verify discovery:

```bash
curl -sS "$API_BASE/puzzles/active?difficulty=easy" | jq --arg id "$PUZZLE_ID" \
  'map(select(.id == $id))[0]'
```

The returned object must contain `id`, `title`, `description`, `difficulty`,
`rewardId`, `createdAt`, and `updatedAt` — and must **not** contain `solution`
or `hint`.

> The solution of an active puzzle cannot be changed in place. A PATCH that
> changes `solution` while `isActive` is `true` returns `400`; deactivate the
> puzzle first or publish a new puzzle version.

### 6. Monitor

- Watch `GET /api/v1/puzzles/active` to confirm the puzzle remains discoverable.
- Check the puzzle audit trail (`puzzle.update` entries) for who activated it.
- Review attempt counts and reward claims after the first cohort.

## Validation checklist

Copy this list into the review issue or PR.

### Content

- [ ] Title is unique, specific, and at most 255 characters.
- [ ] Description explains the task without revealing the solution.
- [ ] Difficulty is one of `easy`, `medium`, `hard`, `expert`.
- [ ] Hint is optional, progressively useful, and does not contain the answer.
- [ ] Any external links, images, or source references are reachable and safe.
- [ ] Spelling, grammar, and formatting are correct.

### Answer mechanics

- [ ] `solution` is the canonical answer after trimming whitespace.
- [ ] Case-insensitive comparison is acceptable for this answer.
- [ ] A correct submission returns `isCorrect: true` and increments attempts.
- [ ] A wrong submission returns `isCorrect: false` and increments attempts.
- [ ] Retrying after a wrong answer still grades correctly.
- [ ] The answer cannot be inferred from `title`, `description`, `hint`, or
      the public discovery response.
- [ ] Rate-limit behavior (5 requests / 60 seconds) has been considered in the
      player instructions.

### Rewards

- [ ] `rewardId` points to an existing, active reward.
- [ ] The reward's `challengeId` matches the puzzle ID.
- [ ] `maxClaims` is appropriate for the expected player volume.
- [ ] Reward metadata does not leak the solution.

### Publication

- [ ] The puzzle was created with `isActive: false`.
- [ ] It was absent from `GET /puzzles/active` before activation.
- [ ] It appears in `GET /puzzles/active` (with the matching difficulty) after
      activation.
- [ ] Public discovery omits `solution` and `hint`.
- [ ] Admin `GET /admin/puzzles/:id` returns the full record.
- [ ] The audit log contains the activation entry.

### Security and fairness

- [ ] The solution was not shared in chat, PR comments, screenshots, or test
      fixtures committed to the repository.
- [ ] Validation used a disposable player ID, not a real user's account.
- [ ] No client-supplied answer is trusted for grading; the server reads
      `solution` from the puzzle record.
- [ ] Duplicate/concurrent submissions are handled without double-counting.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 Unauthorized` | Missing or expired admin token | Log in again and refresh `TOKEN`. |
| `403 Forbidden` | Token is not an admin role | Use an admin account, not a player token. |
| `400 ... property ... should not exist` | Extra field in the JSON body | Send only the fields in the field table. |
| `404 Puzzle not found` | Wrong `PUZZLE_ID` or puzzle deleted | Re-read the create response or use `GET /admin/puzzles`. |
| Puzzle missing from `/puzzles/active` | `isActive` is still `false` | Activate it with `PATCH /admin/puzzles/:id`. |
| `429 Too Many Requests` | Submission rate limit | Use a new player ID or wait 60 seconds. |
| `400 Cannot edit the solution of an active/published puzzle` | PATCH changed `solution` on an active puzzle | Deactivate first or create a new puzzle version. |

## Related documentation

- [API reference](api.md) — generated endpoint list.
- [API conventions](api-conventions.md) — `/api/v1` prefix and error shape.
- [Database schema](database-schema.md) — `puzzles`, `reward`, and claim tables.
- [Economy model](economy-model.md) — reward and points guidance.
