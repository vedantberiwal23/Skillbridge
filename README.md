# SkillBridge

**Voice-first vocational training for India's industrial workforce, grounded in each employer's own procedures.**

🔗 **Live demo:** https://master.d3tw7hhn6mednd.amplifyapp.com

## Signing in

There is no public sign-up — accounts exist only by invitation, which is how a
B2B platform should work. Use these three demo accounts to see each role.

On the sign-in screen, **switch the selector from Phone to Email** before
entering the address.

| Role | Email | Password | Lands on |
| --- | --- | --- | --- |
| Worker | `demo-worker@skillbridge.test` | `Demoworkerpass1` | Their training plan |
| Manager | `demo-manager@skillbridge.test` | `Demomanagerpass1` | Department dashboard |
| Admin | `demo-admin@skillbridge.test` | `Demoadminpass1` | Organisation overview |

Sign out before switching roles, or use a private window — the app signs the
previous session out for you, but a fresh window is cleaner.

**The voice tutor needs microphone permission.** The worker's plan and lesson
screens have a hold-to-ask button; the browser will prompt on first use.

---

## The problem

A maintenance technician on a shop floor has a question about the machine in
front of them — why a cylinder is drifting, what to check before starting a
pump, which step of a lockout comes first. The answer exists, in their
employer's standard operating procedures, in a binder or a PDF nobody opens.

Training built for this workforce has to survive real conditions: hands in
gloves, noise, a mid-range Android phone, and a first language that is usually
not English. Reading a manual is not an option. Typing is not an option.

## What we built

A multi-tenant SaaS platform that organisations subscribe to and onboard their
workers into. Each organisation's own SOPs become the source of truth for a
voice tutor their workers can simply talk to.

**Ask out loud, in your own language.** A worker holds a button and speaks. The
question is transcribed, answered from their employer's procedures, and spoken
back — in the language they asked in, with technical terms kept in English the
way they are actually used on a shop floor. The answer carries a badge when it
came from the company's own SOPs, so a worker can tell plant procedure from
general advice.

**Ask about the part you are looking at.** Lessons carry a 3D model of the
machine. Tapping a component tells the tutor what "this" means, so the question
can be *"why is this leaking?"* rather than a description of where you are
standing.

**Answers that admit what they do not know.** The tutor is instructed never to
invent a torque value, pressure, setting or procedure step. When the SOPs do not
cover a question, it says so and defers to a supervisor. In this domain a
confident wrong answer is a safety incident.

**Assessments built for the trade.** Not multiple-choice trivia — identify a
part, put a procedure in the right order, or diagnose a fault by voice. Attempts
are graded server-side by a separate model, never by the browser.

**A console for the people who run the plant.** Managers see pass rates, skill
gaps and who needs attention across their departments. Admins manage
departments, people and invitations. Accounts exist only by invitation: there is
no public sign-up.

## How it works

```
worker speaks  ─▶  speech-to-text  ─▶  retrieval from the org's own SOPs
                                             │
speaker  ◀─  text-to-speech  ◀─  reasoning model, answer grounded in those SOPs
```

The voice loop runs as a single long-lived connection holding the browser and
both speech services open at once, so a worker can ask several questions in one
session without waiting for anything to reconnect.

Four AI agents, each with its own job and its own permissions:

| Agent | Role |
| --- | --- |
| Voice tutor | Answers the live question. Optimised for latency — it is the only thing a human waits on. |
| Learning plan generator | Builds a worker's plan from their trade and experience level. |
| Assessment scorer | Grades attempts with reasoning, out of band. |
| Skill profiler | Turns what workers actually ask about into department skill gaps. |

Everything runs on AWS in a single region, defined as infrastructure-as-code
across six stacks: security, data, auth, AI, compute and web.

**Tenant isolation is the design, not a filter.** Every organisation gets its
own Knowledge Base scoped to its own document prefix and its own encryption key.
An organisation's identity comes only from a verified sign-in token — never from
anything a request can ask for.

## Built with

**AWS** — Bedrock (Claude Haiku 4.5 for the live voice turn, Claude Sonnet 4.6
for the three asynchronous agents, Cohere multilingual embeddings), Bedrock
Knowledge Bases, S3 Vectors, DynamoDB, Cognito, S3, KMS, Lambda, SQS, ECS, IAM,
CloudFormation/CDK, Amplify Hosting.

**Sarvam AI** — Indian-language speech recognition and synthesis, the only
non-AWS service in the system.

**Application** — Next.js 16, React 19, TypeScript, Tailwind, Node.js.

## Languages

The interface ships in **English, Hindi and Marathi**. The voice tutor
understands and replies in **23 Indian languages**, including Bengali, Tamil,
Telugu, Kannada, Malayalam, Gujarati, Punjabi, Odia and Assamese.

## Scope

Content covers industrial maintenance: hydraulics, industrial electrical, mobile
equipment, stationary machinery, and automation and controls.

Some screens are deliberately marked as previews rather than hidden — the
photogrammetry scanner runs locally and reports itself unreachable when
deployed, and the worker qualification dossier is labelled as sample data.
We would rather show a boundary than blur one.

---

## Running it

```bash
cd web && npm ci && npm run dev          # the application
cd infra && npm ci && npm test           # infrastructure tests
cd services/voice && npm ci && npm test  # the voice service
```

Deployment is continuous: a push to `master` builds and deploys the web tier.
Infrastructure changes deploy with `npx cdk deploy` from `infra/`.
