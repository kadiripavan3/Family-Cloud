# Homeport

First called Family Cloud; the repository keeps that name. One private place for what a family, or a group of friends, keeps together: notes, photos and videos, the calendar, bills and budgets, goals, and the passwords everyone needs. The sister app of [Journey](https://github.com/kadiripavan3/Journey): one owner, one account, one design system.

**Status:** milestones 1 to 10 of the build plan are built and checked in a browser, against stand-ins for every outside service. The last one, real services and real phones, is prepared and waits for the owner's accounts: nothing has run on a phone or against a real service yet. [The questions for the owner](docs/01-requirements.md#questions-for-you) say what is left. The hub says where it stands.

**The hub** (screens, name, the link with Journey, requirements, tech and costs): https://claude.ai/artifact/Nj763e9HKBijnmANPhLLTA

| | |
|---|---|
| What it does | [`docs/01-requirements.md`](docs/01-requirements.md) |
| Tech and costs, and what the two apps share | [`docs/02-tech-stack.md`](docs/02-tech-stack.md) |
| The name | [`docs/03-name.md`](docs/03-name.md) |
| The two apps, together | [`docs/04-journey-link.md`](docs/04-journey-link.md) |
| Design cues and the screen list | [`docs/05-design-brief.md`](docs/05-design-brief.md) |
| The build plan: milestones, tests, every screen | [`docs/06-build-plan.md`](docs/06-build-plan.md) |
| The Vault: what is scrambled, how, and what a review must look at | [`docs/07-vault-protocol.md`](docs/07-vault-protocol.md) |
| Run it on your Mac | [`docs/08-run-locally.md`](docs/08-run-locally.md) |
| Connect the real services | [`docs/09-connect-services.md`](docs/09-connect-services.md) |
| What Journey itself needs for the link | [`docs/10-journey-changes.md`](docs/10-journey-changes.md) |
| The app | [`apps/mobile`](apps/mobile) (Expo), with [how it is put together](apps/mobile/README.md) |
| The API | [`apps/api`](apps/api) (Spring Boot) |
| Screens | [`design/hub/src/screens/`](design/hub/src/screens/) |
| Design tokens | [`design/tokens.json`](design/tokens.json) |

To build the hub page: `npm ci --prefix design/hub && npm run build --prefix design/hub`. See [`design/hub/README.md`](design/hub/README.md).
