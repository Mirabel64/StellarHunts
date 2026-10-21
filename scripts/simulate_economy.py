#!/usr/bin/env python3
"""Deterministic 30-day points economy model; see docs/economy-model.md."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / "backend" / "config" / "economy.config.json").read_text(encoding="utf-8"))
EARN = CONFIG["earn"]
SPEND = CONFIG["spend"]
DAYS = 30

# Active days/month, attempts per active day, and a concrete monthly shopping
# basket for each player profile. Fractional attempts are expected-value inputs.
PROFILES = [
    ("casual", 13, 1, 0, 0, 0.5, 1, 1, 0, 0),
    ("regular", 22, 1, 0.5, 0, 0.8, 2, 2, 1, 0),
    ("daily", 30, 1, 1, 0.25, 1, 4, 4, 2, 1),
]


def main():
    out = Path(__file__).resolve().parents[1] / "docs" / "economy-simulation.csv"
    rows = []
    for (name, active_days, easy, medium, hard, quizzes,
         potions, keys, chests, skins) in PROFILES:
        checkins = active_days * EARN["dailyCheckIn"]
        puzzle_and_quiz = active_days * (
            easy * EARN["puzzleByDifficulty"]["easy"]
            + medium * EARN["puzzleByDifficulty"]["medium"]
            + hard * EARN["puzzleByDifficulty"]["hard"]
            + quizzes * EARN["quizCompletion"]
        )
        # Streak accrual is intentionally discounted: assume an average 3-day
        # streak for casual, 5-day for regular, and full capped streak for daily.
        streak_avg = min(
            {"casual": 1, "regular": 2, "daily": 5}[name] * EARN["streakDayBonus"],
            EARN["streakBonusCap"],
        )
        streak_points = active_days * streak_avg
        earned = round(checkins + puzzle_and_quiz + streak_points)
        spent = (potions * SPEND["healthPotion"] + keys * SPEND["silverKey"]
                 + chests * SPEND["bronzeChest"] + skins * SPEND["rareSkinCrate"])
        rows.append({
            "profile": name,
            "active_days_30d": active_days,
            "checkin_points": round(checkins),
            "puzzle_quiz_points": round(puzzle_and_quiz),
            "streak_points": round(streak_points),
            "earned_points": round(earned),
            "basket_spent_points": round(spent),
            "sink_rate_pct": round(100 * spent / earned, 1),
            "ending_balance_points": round(earned - spent),
            "bronze_chests_affordable": int(earned // SPEND["bronzeChest"]),
            "rare_skins_affordable": int(earned // SPEND["rareSkinCrate"]),
        })
    with out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    for row in rows:
        print(",".join(str(value) for value in row.values()))
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
