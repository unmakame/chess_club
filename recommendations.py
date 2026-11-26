import math
from collections import defaultdict


def probability(weights, features):
    score = sum(weight * value for weight, value in zip(weights, features))
    return 1 / (1 + math.exp(-max(-40, min(40, score))))


def features(difficulty, theme_stats, engine_loss):
    successes, total = theme_stats
    ability = (successes + 1) / (total + 2)
    engine_strength = 0 if engine_loss is None else (120 - engine_loss) / 500
    return (1, 2-difficulty, 2*ability-1, engine_strength)


def rank_lessons(lessons, attempts, engine_loss):
    stats = defaultdict(lambda: (0, 0))
    solved_ids = set()
    examples = []
    for attempt in attempts:
        theme = attempt["theme"]
        examples.append((
            features(attempt["difficulty"], stats[theme], attempt["engine_loss"]),
            int(attempt["solved"]),
        ))
        successes, total = stats[theme]
        credit = 1 / (1 + attempt["errors"] * .25) if attempt["solved"] else 0
        stats[theme] = (successes + credit, total + 1)
        if attempt["solved"]:
            solved_ids.add(attempt["lesson_id"])

    # A prior lets the catalog work while the player has little history.
    prior = (0.65, 0.85, 1.1, 1.0)
    weights = list(prior)
    labels = {label for _, label in examples}
    learned = len(examples) >= 8 and len(labels) == 2
    if learned:
        for _ in range(90):
            gradient = [0.0] * len(weights)
            for terms, label in examples:
                error = probability(weights, terms) - label
                for i, term in enumerate(terms):
                    gradient[i] += error * term
            for i, anchor in enumerate(prior):
                weights[i] -= .5 * (gradient[i]/len(examples) + .08*(weights[i]-anchor))

    candidates = [lesson for lesson in lessons if lesson["id"] not in solved_ids] or lessons
    ranked = []
    for lesson in candidates:
        theme_stats = stats[lesson["theme"]]
        chance = probability(weights, features(lesson["difficulty"], theme_stats, engine_loss))
        successes, total = theme_stats
        weakness = (total - successes) / (total + 3)
        cost = abs(chance-.72) - .16*weakness
        ranked.append((cost, lesson["difficulty"], lesson["id"], {
            "id": lesson["id"], "title": lesson["title"], "difficulty": lesson["difficulty"],
            "probability": round(chance*100),
        }))
    ranked.sort()
    return dict(mode="learned" if learned else "initial", items=[item[-1] for item in ranked[:3]])
