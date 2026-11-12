# Family Cloud

Working title. One private place for what a family, or a group of friends, keeps together: notes, photos and videos, the calendar, bills and budgets, goals, and the passwords everyone needs. The sister app of [Journey](https://github.com/kadiripavan3/Journey): one owner, one account, one design system.

**Status:** the design draft is drawn and the build plan is written. Nothing is built yet.

**The hub** (screens, name, the link with Journey, requirements, tech and costs): https://claude.ai/artifact/Nj763e9HKBijnmANPhLLTA

| | |
|---|---|
| What it does | [`docs/01-requirements.md`](docs/01-requirements.md) |
| Tech and costs, and what the two apps share | [`docs/02-tech-stack.md`](docs/02-tech-stack.md) |
| The name | [`docs/03-name.md`](docs/03-name.md) |
| The two apps, together | [`docs/04-journey-link.md`](docs/04-journey-link.md) |
| Design cues and the screen list | [`docs/05-design-brief.md`](docs/05-design-brief.md) |
| The build plan: milestones, tests, every screen | [`docs/06-build-plan.md`](docs/06-build-plan.md) |
| Screens | [`design/hub/src/screens/`](design/hub/src/screens/) |
| Design tokens | [`design/tokens.json`](design/tokens.json) |

To build the hub page: `npm ci --prefix design/hub && npm run build --prefix design/hub`. See [`design/hub/README.md`](design/hub/README.md).
