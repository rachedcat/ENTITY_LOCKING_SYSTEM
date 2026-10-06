# Entity Locking System — Claude Code Instructions

## Project
This is a Master's Computer Science project implementing a generic
Entity Locking Service for concurrent editing.

The system combines:
- Redis pessimistic entity locking
- PostgreSQL optimistic version locking
- Socket.IO real-time synchronization
- Redis TTL + heartbeat
- Draft auto-save
- 3-way merge conflict resolution
- Admin force-unlock
- Draft review
- Immutable audit trail
- Docker Compose deployment

## Stack

Frontend:
- React 19
- TypeScript
- Zustand
- Tailwind CSS
- Vite

Backend:
- NestJS 11
- TypeScript
- TypeORM
- PostgreSQL
- Redis / ioredis
- Socket.IO

Infrastructure:
- Docker
- Docker Compose

## Important architectural principles

1. Redis is the source of truth for active locks.
2. PostgreSQL stores persistent business state and audit/draft data.
3. Pessimistic locking prevents normal concurrent editing.
4. Optimistic version checking is the safety net.
5. Redis lock operations must remain atomic.
6. Heartbeat ownership must be verified atomically.
7. Admin force-unlock must never silently destroy user work.
8. Drafts must survive forced unlocks.
9. Real-time state must resynchronize after reconnect.
10. Do not introduce architectural changes without explaining their
    impact on concurrency correctness.

## Before modifying code

For significant changes:
1. Inspect the existing implementation.
2. Identify affected modules/files.
3. Explain current behavior.
4. Identify the problem.
5. Research relevant production patterns when requested.
6. Propose alternatives and tradeoffs.
7. Only then implement the approved approach.

## Do not

- Rewrite working components unnecessarily.
- Change the database model without justification.
- Replace Redis locking with another mechanism casually.
- Remove optimistic locking because pessimistic locking already exists.
- Add dependencies merely for convenience.
- Claim something is production-ready without testing it.
- Change APIs silently.
- Modify unrelated files.

## Required validation

After significant changes:
- run backend tests
- run frontend tests if available
- run type checking
- run linting
- run Docker-based integration tests where relevant
- inspect git diff
- explain remaining risks

## Research standard

When researching architecture:
- Prefer official documentation and reputable engineering sources.
- Compare multiple real-world approaches.
- Distinguish established patterns from experimental ideas.
- Do not copy an external architecture blindly.
- Explain why a recommendation fits this project specifically.