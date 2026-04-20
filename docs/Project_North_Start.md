# ProjectMapper North Start

## Purpose of This Document

This document is the persistent north-star reference for ProjectMapper.

It exists so the product intent, operating model, guardrails, and non-negotiable requirements do not get diluted as implementation begins. It should be treated as the foundational reference for future architecture, planning, doctrine generation, execution logic, task policy, and UI decisions.

This is not a lightweight summary. It is a deliberate restatement of the operating vision for the product in practical detail so that future work can always return to a stable source of truth.

## Product Name

ProjectMapper

## Product Identity

ProjectMapper is a serious internal operator tool.

It is not:

- a toy
- a generic AI wrapper
- a demo dashboard
- a shallow chatbot shell
- a fake enterprise app with empty abstractions
- a flashy AI interface meant to impress rather than direct real work

It is:

- a human-governed AI migration platform
- a software orchestration system
- an internal command center for founder-led AI-managed migration work
- a control plane for analysis, planning, execution, review, testing, documentation, and merge decisions
- a tool designed to be used over multiple days of real work, not a one-shot migration wizard

The product should feel operational, deliberate, traceable, and governed.

## Immediate Primary Mission

The immediate mission of ProjectMapper is to map RevolutionEd V1 into RevolutionEd V2.

This means:

- Repo A = RevEd V1
- Repo B = RevEd V2

The system must deeply understand both repositories and then help direct AI-managed rebuild work that maps features from Repo A into Repo B in a way that preserves product intent and protects the actual architecture and interaction philosophy of Repo B.

## Core Operating Premise

Repo B already exists.

Repo B is not a blank rewrite target. It already contains substantial working functionality, existing architecture, real design patterns, real flows, and a real product identity.

Therefore, ProjectMapper must not behave like a naive migration bot that assumes the destination is empty, unfinished, or waiting to receive a generic translation of Repo A.

ProjectMapper must continuously ask:

- What already exists in Repo B?
- How does Repo B already solve related problems?
- Where does a mapped feature actually belong inside Repo B?
- Should the work extend an existing V2-native flow instead of creating something standalone?
- What patterns already define the correct implementation style?
- What would accidentally reintroduce RevEd V1 thinking into RevEd V2?

## Top Product Priorities

When tradeoffs exist, ProjectMapper must bias toward:

- control
- visibility
- traceability
- product-doctrine protection
- task-level clarity
- branch isolation
- plain English communication
- practical usefulness

If a design choice makes the product more clever but less controllable, the product should reject that choice.

If a design choice makes the product more autonomous but less reviewable, the product should reject that choice.

If a design choice makes the product more visually trendy but less operationally useful, the product should reject that choice.

## What the Product Is Actually For

ProjectMapper exists to support the full lifecycle of AI-assisted migration and reconstruction work across real repositories.

That includes:

- repository setup
- repository verification
- deep analysis
- feature extraction
- doctrine generation
- doctrine review and approval
- proposal generation
- plan editing
- approvals
- isolated branch execution
- review agents
- testing workflows
- report generation
- merge decisions
- post-merge awareness
- self-documentation
- preservation of project-level strategic vision

This must be a real internal operating system for migration work, not an idea board and not a bot terminal.

## Core Stack Requirements

ProjectMapper must be built using the following stack and deployment assumptions:

- Next.js
- Tailwind CSS
- MongoDB
- Gemini API
- GitHub integration
- Playwright
- Google Cloud Run deployment target
- Docker-compatible application structure
- local worker processes able to run on the operator desktop machine
- hosted web application acting as the control center
- environment-variable-driven configuration through `.env.local` and related environment settings

These choices are not incidental. The architecture should directly reflect the split between hosted control plane and local execution capability.

## Access Model

ProjectMapper is for one operator only.

It should not implement a conventional multi-user authentication system.

It must not include:

- sign up
- password reset
- user roles
- session management complexity for many users
- multi-tenant auth scaffolding
- enterprise identity abstractions

Instead, it should use a simple practical access gate:

- one fixed username: `cash96`
- one configurable password supplied through configuration
- lightweight session/cookie-based access after successful entry
- enough protection that a random person who finds the URL cannot access the system

This access system should remain intentionally minimal.

## RevEd V2 Context That Must Be Protected

RevEd V2 is a radical departure from RevEd V1.

The main shift is not cosmetic.

The shift is fundamentally about UI, UX, interaction model, and product philosophy.

RevEd V2 is a chat-native educational platform with dynamic interactive panels.

It should feel like:

- the power and ease of use of ChatGPT
- combined with the operational depth and backend seriousness of a district-grade school platform, LMS, and content system

RevEd V2 is built around:

- a persistent AI chat layer
- dynamic panels that change according to the user context
- fluid blending between direct UI interactions and AI-driven interactions

Example work areas include:

- onboarding students
- creating classrooms
- writing lesson plans
- generating child artifacts
- consuming standards
- building content
- interacting with district and school workflows

The essential V2 product promise is that users can:

- work directly through the interface
- work directly through AI
- blend both modes fluidly and continuously

This blend is part of the product magic.

ProjectMapper must protect that blend.

It must never casually reconstruct RevEd V1-style page sprawl, rigid page-first architecture, or interaction patterns that undermine V2's chat-native and panel-native behavior.

## Primary Product Behaviors Required

ProjectMapper must support the following end-to-end behaviors:

1. Connect to Repo A and Repo B.
2. Inspect and verify both repositories.
3. Perform deep analysis on both repositories.
4. Generate structured understanding artifacts for both repositories.
5. Generate draft doctrine or constitution documents describing Repo B's actual architecture, UX philosophy, patterns, anti-patterns, and operating ethos.
6. Present doctrine artifacts for operator review and editing.
7. Treat approved doctrine as a first-class governing standard.
8. Identify features and sub-features in Repo A.
9. Generate proposals for how those features should be rebuilt into Repo B.
10. Present proposals in plain English.
11. Allow operator review, revision, annotation, approval, rejection, and retry.
12. Execute approved work inside isolated branches.
13. Maintain detailed visibility into progress, commits, branches, workers, and task state.
14. Run multiple review agents over completed work.
15. Run both automated and human-directed testing.
16. Generate plain English reports.
17. Allow explicit merge decisions controlled by the operator.
18. Notify active workers and tasks when main has changed and they should update appropriately.
19. Create self-documentation after completed work so future work understands what was built.
20. Maintain an ongoing strategic note and product vision layer that influences future planning.

## V1 Scope

V1 is not allowed to be a hollow MVP that only plans or only executes.

V1 must include the full operational pipeline:

- repo setup
- doctrine generation
- repo analysis
- feature extraction
- proposal generation
- approval flow
- task execution
- reviewer agents
- testing
- report generation
- merge flow
- self-documentation
- update-from-main awareness for active tasks

This must be the real initial operating system for migration work.

## Task Granularity Expectations

ProjectMapper must operate at the sub-feature level.

The system should strongly prefer focused, reviewable, branch-safe, testable, understandable tasks.

Good task examples:

- rebuild Clever integration for student onboarding
- map lesson plan template setup from V1 into the existing V2 teacher workflow
- rebuild a specific curriculum page workflow into V2-native panel behavior
- investigate DSH partnership curriculum pages and propose a mapping plan

Bad task examples:

- rebuild all onboarding
- migrate the whole admin area
- refactor architecture globally
- redo all lesson planning

The system should avoid giant vague task scopes because they reduce traceability, increase branch risk, complicate review, and invite doctrine drift.

## AI Autonomy Philosophy

The AI may work overnight.

The AI may continue progress while the operator is away.

However, the AI is expected to be a confident builder, not a confident decision maker.

That means the AI may:

- analyze deeply
- propose strongly
- code aggressively after direction is approved
- review outcomes
- run tests
- keep moving through already-approved execution paths

That also means the AI must not:

- silently make major product direction decisions
- invent alignment where it is uncertain
- choose significant UX direction without operator review when ambiguity exists
- hide uncertainty behind plausible execution

If product direction is unclear, the system must escalate and ask.

## Doctrine / Constitution System

The doctrine system is one of the most important systems in ProjectMapper.

The doctrine must not be hardcoded manually from the start.

Instead, ProjectMapper must include a pre-execution learning phase where it studies Repo B and generates draft doctrine artifacts for review.

The doctrine generation flow must:

1. Deeply inspect Repo B.
2. Infer architecture patterns.
3. Infer route and page structure.
4. Infer component and composition patterns.
5. Infer panel behavior patterns.
6. Infer interaction principles.
7. Infer data flow patterns.
8. Infer UI and UX rhythms.
9. Infer chat-related behaviors.
10. Infer anti-patterns that Repo B appears to intentionally avoid.
11. Infer the deeper ethos of the existing application.
12. Generate draft doctrine artifacts.
13. Present them for operator review and editing.
14. Version them.
15. Mark approval state.
16. Use approved doctrine as a governing standard for future planning and enforcement.

Doctrine should support categories such as:

- product identity
- UX principles
- architecture principles
- approved interaction patterns
- anti-patterns
- never-do-this rules
- mapping principles
- doctrine versions
- edit history
- approval state

## Doctrine Enforcement Policy

Doctrine enforcement must be hard enforcement.

If a task violates core Repo B doctrine, execution must be blocked until the proposal or plan is revised.

Examples of doctrine-critical violations include:

- recreating RevEd V1 page sprawl
- bypassing the chat-native or dynamic-panel philosophy of RevEd V2
- introducing structurally incorrect UX patterns that fight Repo B's essence
- adding a standalone page or route when the correct implementation should live within an existing V2-native flow
- implementing behavior that conflicts with established architecture or interaction logic in Repo B

Lower-level implementation concerns may surface as warnings or review feedback.

Core doctrine conflicts must block execution.

## Deep Analysis Requirements

ProjectMapper must perform deep analysis on both Repo A and Repo B.

Where present, the system should analyze:

- repository structure
- modules
- functions
- services
- routes and pages
- API handlers
- models and entities
- database usage
- integrations
- auth and role flows
- user workflows
- prompts and AI logic
- UI structure
- form and process flows
- feature clusters
- reusable components
- state patterns
- dependencies between modules
- testing files

The goal is not a shallow summary.

The goal is structured, usable understanding that can support doctrine generation, feature extraction, proposal quality, review quality, test strategy, and future self-documentation.

Analysis outputs must become real first-class artifacts inside the product.

## Multi-Project Capability

Even though the immediate use case is RevEd V1 to RevEd V2, ProjectMapper must be architected to support multiple migration projects.

This means:

- the data model should support multiple projects
- routing should support multiple projects cleanly
- project-scoped doctrine, tasks, notes, reports, and analysis should be cleanly isolated
- the UI does not need to overemphasize multi-tenancy, but the architecture must support it cleanly

## ProjectMapper UI and UX Direction

ProjectMapper itself should not be chat-native.

It should not become one large chat experience.

The preferred interaction model is card, ticket, and task oriented.

The product should feel like:

- a command center
- an AI engineering CRM
- a service ticket system for intelligent migration work
- a control surface for reviewing, directing, revising, and approving AI execution

The major interaction patterns should center around:

- dashboard overview
- task cards
- task detail pages
- thread or timeline history inside each task
- proposals and plans
- reviews
- testing sections
- branch sections
- merge controls
- notes, comments, and decisions

The interface should be:

- clean
- modern
- minimal
- operational
- readable
- plain-English heavy
- non-decorative
- non-noisy
- not fake-enterprise

## Required App Areas and Pages

The application should be organized around these major areas:

1. Entry / Password Gate
2. Dashboard
3. Projects List
4. Project Detail
5. Repositories
6. Doctrine
7. Analysis
8. Tasks Board
9. Task Detail Page
10. Approvals / Inbox
11. Execution / Branches
12. Reports
13. Test Scenarios
14. Strategic Notes / Vision
15. Settings / Integrations

Among these, the Task Detail Page is one of the most important screens in the entire system.

## Dashboard Requirements

The dashboard must be high-signal and operational.

It should show things such as:

- pending approvals
- pending human questions
- executing tasks
- blocked tasks
- paused tasks
- high-risk tasks
- retry requested tasks
- tasks under review
- tasks ready to merge
- recent merges
- recent doctrine changes
- recent failures
- recent branch issues
- recent test failures
- overnight progress summary

The dashboard should immediately help the operator understand:

- what is happening now
- what needs attention now
- what completed while the operator was away
- what is blocked
- what is unsafe

## Task Board Requirements

Tasks should be visible as cards or rows with filtering and explicit state visibility.

Each task summary should expose:

- title
- linked source feature or sub-feature
- target V2 area
- status
- doctrine risk
- confidence
- active branch
- active agents
- whether human input is needed
- latest activity timestamp
- review state
- testing state

Filtering should support at least:

- drafted
- proposed
- awaiting my input
- approved
- executing
- paused
- failed
- under review
- ready to merge
- merged
- high risk
- blocked by doctrine

## Task Detail Page Requirements

The task detail page must be rich, operationally useful, and central to the product.

It should include the following major sections.

### 1. Header and Summary

Include:

- task title
- status
- linked project
- source feature area
- target Repo B area
- doctrine risk
- confidence
- current branch
- branch status
- assigned or active agents

### 2. Source Understanding

This section should explain:

- what was found in Repo A
- where it lives
- how it behaves
- relevant files, functions, and workflows

### 3. Repo B Context

This section should explain:

- what already exists in Repo B
- where the mapped feature likely belongs
- what patterns already exist there
- relevant files, routes, components, and architecture context

### 4. Proposal Layer

This section should capture:

- plain English proposal
- what the feature does
- what it should become in Repo B
- how the capability will be preserved
- how the UX should adapt to Repo B
- how doctrine supports the plan
- which anti-patterns are being avoided
- open questions
- assumptions
- risks

### 5. Editable Plan

The operator must be able to review, edit, revise, and annotate the AI plan before execution.

This is a critical requirement.

### 6. Todo / Work Breakdown

Each coding task should maintain a structured todo list, typically around 10 to 50 items depending on complexity.

This helps both the operator and the AI understand progress and remaining work.

### 7. Historical Thread / Activity Timeline

This is one of the most important parts of the task page.

It should record the complete work history for the task, including:

- analysis events
- proposal generation
- operator edits and comments
- AI questions
- operator answers
- branch creation
- pushes and commits
- review outcomes
- test outcomes
- retry requests
- merge readiness
- merge decisions

The timeline should feel like the complete, durable work record.

### 8. Question / Response Area

AI questions and operator responses should live naturally inside the task history and thread model.

Free-text communication matters.

### 9. Branch / Execution Section

Include:

- branch name
- branch URL when available
- recent pushes
- recent commits
- execution status
- worker status
- update-from-main status

### 10. Review Section

Include visible outputs for:

- Doctrine Guardian
- Product / UX Reviewer
- Architecture Reviewer
- QA / Test Interpreter
- consensus or disagreement summary

### 11. Test Section

Include:

- automated tests run
- human-directed tests run
- screenshots
- results
- plain English interpretation
- artifacts and links

### 12. Controls

The page must support explicit operator control actions such as:

- approve
- approve with edits
- request revision
- pause
- stop
- stop branch execution
- retry from scratch
- mark ready
- merge into main

Overall, the task detail page should feel like a service ticket fused with an AI execution control room.

## Central Inbox / Approvals Area

There must be a central inbox or approvals area that rolls up all items needing operator attention.

Examples include:

- questions from AI
- doctrine approvals
- task proposal approvals
- review disagreements
- merge approvals
- test ambiguity requiring human judgment

However, task-level detail must remain visible on the task itself.

The inbox is a control point and rollup, not the only place where important information exists.

## Manual Task Creation

The operator must be able to create tasks manually from the UI.

Examples:

- Go look at DSH partnership page.
- Investigate Clever flow in student onboarding.
- Analyze how lesson plan templates are handled in V1 and propose a V2-native plan.

When a manual task is created, the system should investigate the relevant areas and produce a proposal.

It should not jump directly to code.

## Strategic Notes / Vision Layer

ProjectMapper must include a project-level strategic notes layer.

This is where the operator can store broader product vision, UX philosophy, architecture direction, strategic warnings, and future-facing beliefs.

These are not individual tasks.

Examples of strategic notes include:

- long-term vision for RevEd V2
- UX philosophy reminders
- architecture direction
- strategic warnings
- statements such as moving away from page-based workflows
- reminders that teacher experience must remain simple and AI-assisted
- reminders that student onboarding must feel district-ready, not startup-hacky

These notes should be available to planning and orchestration systems so future proposals are influenced by them.

## Task Proposal / Pre-Execution System

The proposal system is one of the most critical systems in the entire platform.

Before any task executes, the AI must produce a strong proposal.

That proposal should clearly explain:

- what feature or sub-feature it inspected in Repo A
- what the feature really does
- where it lives in Repo A
- what corresponding context exists in Repo B
- how it proposes to rebuild or integrate the feature
- how the original capability will be preserved
- how the feature will be translated into Repo B's design, architecture, and interaction model
- why the proposed mapping is correct
- which doctrine principles it aligns with
- which anti-patterns it is actively avoiding
- what risks remain
- what open questions exist
- a proposed task plan
- a detailed todo list

The operator must be able to:

- review the proposal
- edit the proposal
- annotate the proposal
- revise the proposal
- then launch execution only after approval

The proposal layer must be first-class and not relegated to a minor modal or afterthought.

## Escalation Philosophy

The AI should ask more rather than less.

It should escalate whenever:

- mapping from Repo A to Repo B is unclear
- a change touches shared layout or navigation
- a new route or page may be needed
- multiple V2-native implementations are possible
- doctrine confidence is low
- a design may affect UX philosophy
- tests fail in ambiguous ways
- multiple architectural options are valid
- integration behavior is surprising
- Repo B has unclear precedent
- there is a chance of introducing subtle system drift

The product principle remains the same:

confident builder, not confident decision maker.

## Task Lifecycle / State Model

ProjectMapper should expose rich and explicit task states.

Required states include:

- Drafted
- Analyzing
- Proposed
- Awaiting Review
- Awaiting My Input
- Approved
- Executing
- Under Review
- Needs Revision
- Passed Review
- Complete
- Paused
- Stopped
- Failed
- Retry Requested
- Ready to Merge
- Merged

The final implementation may refine the shape of the state machine, but the system must preserve explicit, visible states.

## Control / Stop / Retry Model

The operator must retain strong control over execution.

The app must support:

- Pause Task
- Stop Task
- Stop Branch Execution
- Kill All Agent Activity
- Retry / Start Over

Retry is especially important.

Retry should support workflows such as:

No, this is not right. It should be like X, not Y. Please try again.

When retrying, the system should:

- preserve history
- preserve previous attempt records
- archive or terminate the current branch attempt
- create a fresh attempt and new branch
- carry forward revised operator instruction into the new proposal and execution cycle

## Execution Model

Every task gets its own branch.

The system must not use one giant shared AI branch.

Execution visibility should expose:

- task to branch relationship
- branch name
- branch status
- active workers
- recent pushes
- recent commits
- review status
- test status
- update-from-main status
- merge readiness

## Merge and Post-Merge Behavior

After a task is completed and signed off:

1. The system should create self-documentation.
2. The task should become explicitly mergeable.
3. Merge should remain an explicit human-controlled action.

The self-documentation artifact should explain:

- what was built
- why it was built
- how it maps Repo A to Repo B
- design decisions
- implementation notes
- downstream considerations
- anything future agents should know

When a merge occurs, the system should:

- record the merge event
- notify active tasks and workers that main has changed
- add update-from-main awareness into active workflows and todo pipelines where appropriate

## Reviewer Agents Required in V1

ProjectMapper must implement multiple distinct reviewer roles in V1.

### 1. Doctrine Guardian

Purpose:

- determine whether completed work preserves Repo B doctrine
- catch subtle drift toward RevEd V1 patterns
- block doctrine-violating work

### 2. Product / UX Reviewer

Purpose:

- assess task flow quality
- evaluate user friction
- evaluate alignment with Repo B's UX style
- identify weird, clunky, or off-pattern user experiences

### 3. Architecture Reviewer

Purpose:

- assess code shape
- assess maintainability
- assess fit with Repo B architecture
- assess whether implementation choices fit the existing codebase

### 4. QA / Test Interpreter

Purpose:

- review automated test results
- review screenshots
- review browser run artifacts
- summarize observed issues in human terms

Reviewer outputs should be stored independently and visibly.

They must not exist only as hidden logs.

## Testing System

Testing must be first-class and practical.

ProjectMapper should not pretend it fully understands every real-world education context automatically from day one.

Testing should be built around two complementary modes.

### Test Mode 1: AI-Generated Automated Testing

The AI should write and run automated tests where practical.

Examples include:

- component behavior tests
- route or handler tests
- Playwright browser scripts
- scripted UI flows
- simulation scripts
- state or environment setup scripts

These tests should be proposed and run as part of normal execution and review.

### Test Mode 2: Human-Directed Testing

The operator should be able to provide:

- a login
- a role or context
- a plain English instruction
- optional notes about what to observe

Examples:

- Use this school admin login, ask to create a new teacher, and report back what happens.
- Use this teacher account, open lesson planning, try generating a child artifact, and report any weirdness.

For this mode, the system should:

1. Accept the human test instruction.
2. Convert it into a proposed test plan.
3. Show that test plan to the operator.
4. Let the operator review, edit, and approve it.
5. Execute it.
6. Produce screenshots, logs, and results.
7. Summarize outcomes in plain English.

This bridge between human intent and executable browser-driven validation is a core requirement.

## Test Scenarios System

ProjectMapper must include a dedicated Test Scenarios area.

A reusable test scenario should support fields such as:

- scenario name
- purpose
- associated user role
- login credentials or references
- required starting state
- seeded data notes
- starting route or page
- expected flow and checkpoints
- optional notes

Example scenarios include:

- admin Clever onboarding
- teacher lesson plan generation
- teacher child artifact generation
- student onboarding validation
- standards ingestion workflow

Human-directed testing should be able to reference a reusable scenario or create a task-specific plan.

## Reporting Requirements

ProjectMapper must generate plain English reports.

Report types may include:

- task completion reports
- review summaries
- test reports
- overnight summaries
- merge summaries
- doctrine generation summaries
- retry comparison summaries

Reports should emphasize:

- what happened
- what changed
- what risks were found
- what reviewers said
- what tests did
- what still requires judgment

## Repository / GitHub Integration

ProjectMapper must include practical GitHub integration.

It should support:

- connecting Repo A and Repo B
- verifying repository access
- storing repository metadata
- branch awareness
- branch creation per task
- linking tasks to branches
- showing branch URLs or identifiers
- showing commit and push activity
- supporting merge flow

The integration should be real and useful without overbuilding enterprise GitHub process machinery.

## Orchestration Model

The product should use a hybrid queue plus staged orchestration model.

The architecture should support:

- structured task stages
- worker-like execution
- background processing
- multiple concurrent tasks
- visibility into agent runs
- clear separation between planning, execution, review, and testing

It should also clearly separate these concerns:

- UI / control plane
- orchestration / task coordination
- worker execution
- repository processing / file analysis
- review and testing runs

Workers may run locally on the operator machine while the app is hosted remotely. The architecture must intentionally support that split.

## Data / Domain Model Expectations

ProjectMapper should use MongoDB and a strong domain model.

Expected domains include, but are not strictly limited to:

- Project
- Repository
- RepoConnection
- DoctrineDocument
- DoctrineVersion
- AnalysisRun
- AnalysisArtifact
- FeatureCluster
- Task
- TaskProposal
- TaskTodoItem
- TaskThreadMessage
- TaskAttempt
- AgentRun
- ReviewResult
- BranchRecord
- TestScenario
- TestPlan
- TestRun
- Report
- StrategicNote
- AppSetting
- IntegrationSetting
- MergeRecord

The final design should preserve this general shape while improving structure where useful.

## Settings / Integrations Area

ProjectMapper should include a clean settings and integrations area covering:

- GitHub connection and configuration
- Gemini API configuration
- MongoDB configuration assumptions where relevant
- password gate settings
- local worker connection status
- branch naming preferences
- testing defaults
- execution limits
- doctrine behavior settings where helpful

## Critical Repo B Behavior Requirement

Repo B already has substantial working code.

It already supports behaviors such as:

- lesson plan creation
- standards consumption
- student onboarding
- content building
- chat interaction
- other substantial existing system behavior

ProjectMapper must deeply understand Repo B before it tries to map Repo A into it.

It should explicitly support reasoning such as:

- what already exists here?
- what pattern does Repo B already use for this?
- where should this capability actually live?
- should this integrate into an existing flow instead of becoming a new page or route?
- how do we extend the living architecture instead of bulldozing it?

## Build Philosophy

Implementation should proceed intelligently and in disciplined phases.

Before major implementation, the work should explicitly define:

1. the architecture
2. the key domains and models
3. the page and route structure
4. the core user flows
5. the doctrine generation and enforcement flow
6. the repository analysis flow
7. the task proposal, approval, and editing flow
8. the orchestration model
9. the execution and branch model
10. the review flow
11. the testing flow
12. the merge and post-merge update-from-main flow
13. the phased implementation plan

The product should be built in a practical order that protects against subtle drift.

## Major Product Risks and Warnings

The biggest risk is subtle drift.

That means a small early misinterpretation could create large downstream product misalignment.

ProjectMapper must protect against:

- silent bad assumptions
- RevEd V1 patterns sneaking into RevEd V2
- overconfident AI product decisions
- hidden execution
- unclear task and branch ownership
- weak traceability
- weak review
- shallow testing
- gradual loss of architectural coherence

## Decision Biases

Whenever the product must choose between alternatives, it should bias toward:

- visibility
- operator control
- plain English clarity
- strong task pages
- strong proposal layer
- strong doctrine protection
- practical usefulness

## Product Standard for Feel

ProjectMapper should feel like:

- a real internal command center
- a founder-directed migration operating system
- a serious execution environment for AI-managed software work
- a place where decisions are visible, history is durable, branches are controlled, and doctrine is actively protected

It should not feel like:

- a prompt playground
- a generic AI assistant shell
- a simple kanban app with AI pasted on top
- a dashboard with fake metrics and weak operational depth

## Immediate Documentation Outcome

This file exists to preserve the founding intent of ProjectMapper before architecture or implementation choices create accidental drift.

Future architecture documents, model definitions, route plans, implementation phases, and system behavior should explicitly align with this document.

If future work conflicts with this document, the conflict should be treated as a design review issue, not silently accepted.

## Working Rule Going Forward

ProjectMapper should be built as a real internal command center for founder-led AI software migration.

Its defining properties are:

- governed execution
- doctrine protection
- task-level visibility
- branch isolation
- practical orchestration
- operator reviewability
- plain-English clarity
- durable institutional memory

This is the standard.