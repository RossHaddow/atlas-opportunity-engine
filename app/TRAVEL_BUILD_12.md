# Atlas Travel — Build 12

## Travel Intelligence Dashboard

Build 12 turns completed-trip history into reusable decision intelligence.

### Added
- Historical travel metrics: actual spend, target budget, variance, and average trip ratings.
- Repeat-trip and return-destination rates from completed reviews.
- Recurring learned signals for loved items, dislikes, worthwhile upgrades, and never-repeat lessons.
- Destination history with tolerant destination-family matching (for example, Jamaica can inform Montego Bay, Jamaica).
- A next-trip profile derived from historical spend and saved Travel preferences.
- Ranked destination recommendations using an Atlas Intelligence Score.
- Bounded historical adjustments so one old trip cannot overpower current fit, budget, or saved preferences.
- Explicit low / medium / high history confidence based on reviewed-trip volume.
- `/api/travel/intelligence` endpoint with optional budget, travelers, origin, dates, and recommendation limit.
- Travel Intelligence Dashboard UI with history metrics, learned signals, and Where Should We Go Next recommendations.

### Data quality rule
Recommendations are planning intelligence, not live bookable quotes. Atlas identifies seed estimates and requires live flight, lodging, weather, fee, and availability verification before booking.

### Validation
- 346 / 346 automated tests passing.
- Live HTTP validation confirmed completed-trip metrics and destination-history adjustment through `/api/travel/intelligence`.
