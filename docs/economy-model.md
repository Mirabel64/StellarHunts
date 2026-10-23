# Points economy model

## Purpose and scope

This is a proposed earn/spend schedule for the spendable points currency. The
reward shop is currently an in-memory mock and the daily check-in, quiz, and
puzzle flows do not credit one shared points ledger. The settings under
`backend/config/economy.config.ts` define the target rates and shop prices;
connecting the earn events to durable balances is a separate implementation
step. Quiz `points` are currently a score for that quiz and must not be credited
as currency directly; award the configured quiz completion amount once for a
validated completion.

## Tunable parameters

| Event / item | Points | Rule |
| --- | ---: | --- |
| Daily check-in | 10 | Once per calendar day |
| Easy / medium / hard puzzle | 20 / 35 / 60 | Once per first valid solve |
| Quiz completion | 25 | Once per completed quiz |
| Streak bonus | 5 per consecutive day, capped at 25/day | Avoids uncapped login inflation |
| Verified referral | 100 | Once after referral qualification |
| Health potion / silver key | 40 / 100 | Low-cost repeat sinks |
| XP boost / bronze chest | 150 / 250 | Mid-tier sinks |
| Coin pack / rare skin crate | 600 / 1,200 | High-tier goals |

The JSON config is the source of truth for backend defaults and the simulator. Streak and
verified-referral awards need duplicate-claim guards at their eventual award
call sites. A purchase must debit points atomically with stock reservation once
the mock service is replaced by persistent storage.

## Spreadsheet model and assumptions

`docs/economy-simulation.csv` is the spreadsheet-ready output. Recreate it with
`python scripts/simulate_economy.py`. The script uses a deterministic 30-day
expected-value model. Each active day includes a check-in, profile-specific
puzzle and quiz completion rates, and a discounted average streak bonus. The
streak assumptions are 5, 10, and 25 points per active day for casual, regular,
and daily players. Monthly baskets are illustrative targets: casual buys a
potion and key; regular buys two potions, two keys, and a chest; daily buys four
potions, four keys, and two chests. Referral awards are excluded because they
are one-off and not a sustainable recurring source.

## Simulation results

| Profile | Earned / 30d | Target basket | Sink rate | Balance after basket | Chests affordable from earnings |
| --- | ---: | ---: | ---: | ---: | ---: |
| Casual (13 active days) | 618 | 140 | 22.7% | 478 | 2 |
| Regular (22 active days) | 1,705 | 530 | 31.1% | 1,175 | 6 |
| Daily (30 active days) | 3,900 | 2,260 | 57.9% | 1,640 | 15 |

Results are a baseline, not production telemetry. The target basket should
remove roughly 23–58% of expected monthly issuance across these engagement
levels while leaving savings capacity for aspirational items. Adjust prices or
award values only after comparing this model with real 30-day earning and
purchase data; referral and streak farming are the main inflation risks.
