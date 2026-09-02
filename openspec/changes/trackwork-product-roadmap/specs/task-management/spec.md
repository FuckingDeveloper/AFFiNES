# Capability: Task Management

## ADDED Requirements

### Requirement: Durable task activity timeline
TrackWork SHALL present a chronological activity timeline derived from durable task events rather than ad-hoc client strings.

#### Scenario: Task field changes
- **WHEN** a task is reassigned, reprioritized, renamed, transitioned, commented on, or archived
- **THEN** the activity timeline records the action with actor and timestamp
- **AND** the event remains readable after locale changes

### Requirement: Task comments and mentions
Users with task access SHALL be able to comment on tasks and mention workspace members.

#### Scenario: Mention user in comment
- **WHEN** an authorized user posts a comment containing a valid member mention
- **THEN** the comment is stored with author and timestamp
- **AND** the mentioned member becomes eligible for notification according to preferences

### Requirement: Watchers
Users SHALL be able to follow or unfollow tasks independently of assignment.

#### Scenario: Follow task
- **WHEN** a user follows a task
- **THEN** the subscription is persisted for that user
- **AND** relevant subsequent task activity can generate notifications for the follower

### Requirement: Saved task views
Users SHALL be able to save reusable combinations of filters, sorting, and grouping as named views.

#### Scenario: Save high-priority bug view
- **WHEN** a user saves a view filtered to open bugs with high or urgent priority and grouped by assignee
- **THEN** the view can be reopened later with equivalent query behavior

### Requirement: Bulk task operations
Authorized users SHALL be able to perform supported field, transition, assignment, label, archive, and restore operations on multiple tasks.

#### Scenario: Bulk transition with invalid member
- **GIVEN** multiple selected tasks where one task is not allowed to transition to the target stage
- **WHEN** a bulk transition is requested
- **THEN** the system reports which tasks were rejected
- **AND** does not silently violate workflow rules

### Requirement: Task archive and restore
Tasks SHALL support explicit archive and restore operations.

#### Scenario: Restore task
- **GIVEN** an archived task
- **WHEN** an authorized user restores it
- **THEN** it returns to active search/views according to its persisted board/status state or a documented fallback state

### Requirement: Templates and duplication
TrackWork SHALL support creating tasks from templates and duplicating existing tasks without copying identity, activity history, or development artifacts.

#### Scenario: Duplicate task
- **WHEN** a user duplicates a task
- **THEN** a new task key and immutable ID are allocated
- **AND** configurable content fields are copied
- **AND** comments, activity history, and SCM associations are not copied by default

### Requirement: Fast task lookup
TrackWork SHALL support direct lookup by human task key and workspace-scoped search across task title and relevant indexed fields.

#### Scenario: Open by key
- **WHEN** the user searches for an exact key such as `ABCD-123`
- **THEN** the matching task is prioritized and can be opened directly