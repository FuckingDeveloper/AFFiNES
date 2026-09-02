# Capability: Planning

## ADDED Requirements

### Requirement: Backlog
TrackWork SHALL provide a backlog separate from active board presentation so teams can prioritize work before assigning it to a sprint or active flow.

#### Scenario: Move backlog item into sprint
- **GIVEN** a task in backlog
- **WHEN** a planner assigns it to a future sprint
- **THEN** the task remains queryable in backlog/planning context
- **AND** is associated with the selected sprint without requiring a workflow-status change

### Requirement: Sprint lifecycle
TrackWork SHALL support planned, active, and completed sprint states with explicit start and completion operations.

#### Scenario: Start sprint
- **GIVEN** a planned sprint with assigned tasks
- **WHEN** an authorized user starts it
- **THEN** it becomes the active sprint according to workspace policy
- **AND** the start timestamp is stored durably

#### Scenario: Complete sprint with unfinished work
- **GIVEN** an active sprint containing unfinished tasks
- **WHEN** the sprint is completed
- **THEN** the user must choose or receive a configured policy for unfinished tasks, such as move to backlog or a future sprint
- **AND** the completion event is retained for analytics

### Requirement: Estimates
TrackWork SHALL support configurable estimates such as story points without making estimates mandatory for all workspaces.

#### Scenario: Workspace enables story points
- **WHEN** a workspace enables numeric story-point estimates
- **THEN** supported task types can store an estimate
- **AND** planning and analytics can aggregate the values

### Requirement: Epic hierarchy
TrackWork SHALL support grouping work under Epics without allowing arbitrary cyclic parentage.

#### Scenario: Associate task with Epic
- **WHEN** a task is assigned to an Epic
- **THEN** both task and Epic views expose the relationship
- **AND** deleting or archiving the Epic does not silently delete its tasks

### Requirement: Releases and milestones
TrackWork SHALL support release/version and milestone concepts independently from workflow stages.

#### Scenario: Plan release
- **WHEN** tasks and Epics are associated with a release
- **THEN** the release can expose planned scope, completion state, and target date

### Requirement: Roadmap/timeline
TrackWork SHALL provide a timeline-oriented planning view for Epics, releases, milestones, and other supported planning entities.

#### Scenario: Adjust Epic dates
- **WHEN** an authorized user changes an Epic's planned date range in roadmap view
- **THEN** the underlying planning entity is updated
- **AND** task workflow statuses are not implicitly changed

### Requirement: Sprint analytics source integrity
Velocity and burndown SHALL be computed from durable sprint membership and lifecycle history rather than current task state alone.

#### Scenario: Task moved after sprint completion
- **GIVEN** a completed sprint
- **WHEN** a task is later edited or moved elsewhere
- **THEN** historical sprint metrics remain reproducible from recorded sprint facts