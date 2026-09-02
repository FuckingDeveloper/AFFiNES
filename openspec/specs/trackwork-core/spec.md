# Capability: TrackWork Core

## Purpose

This specification captures the currently accepted TrackWork product foundation that future OpenSpec changes must preserve unless they explicitly modify it.

## Requirements

### Requirement: Workspace task tracker
A workspace SHALL provide a Task Tracker surface with one or more boards and configurable workflow stages.

#### Scenario: Open task board
- **WHEN** a user with workspace access opens Task Tracker
- **THEN** the current board and its stages are displayed
- **AND** tasks assigned to that board can be organized by stage

### Requirement: Configurable workflow
Workspace configuration SHALL support board creation, stage creation/renaming/removal where valid, and allowed task transitions.

#### Scenario: Block disallowed transition
- **GIVEN** the workflow does not allow a task type to move from one stage to another
- **WHEN** a user attempts that drag transition
- **THEN** the operation is rejected and the task remains in its valid state

### Requirement: Human task keys
TrackWork SHALL allocate workspace-scoped human-readable task keys using a workspace prefix and monotonically allocated task number.

#### Scenario: Create task
- **WHEN** a new task is created in a synchronized workspace
- **THEN** it receives a unique human key such as `ABCD-123`
- **AND** the key can be used for navigation/reference while internal relationships remain independent of display formatting

### Requirement: Task metadata
Tasks SHALL support at least title, description, type, priority, assignee, labels, due date, complexity, checklist/subtasks, attachments, related documents, task relations, and workflow status as supported by the current implementation.

#### Scenario: Edit task details
- **WHEN** an authorized user changes supported task fields
- **THEN** the changes persist and are reflected across Task Tracker clients

### Requirement: Task relations
Tasks SHALL support explicit relationships including blocked-by/blocks, relates-to, and duplicates, and SHALL reject relation structures that violate configured safety rules such as prohibited cycles.

#### Scenario: Create cyclic blocking relation
- **WHEN** a requested blocking relationship would introduce a prohibited cycle
- **THEN** the operation is rejected with an actionable error

### Requirement: Document relationships
TrackWork SHALL support linking tasks to related workspace documents and resolving task references from documents.

#### Scenario: Open related document
- **GIVEN** a task is linked to an accessible workspace document
- **WHEN** the user selects that related document
- **THEN** TrackWork navigates to the document without duplicating it

### Requirement: Create task from document selection
TrackWork SHALL support creating a task from selected document text in supported document contexts.

#### Scenario: Create from selection
- **WHEN** a user invokes the TrackWork task creation action on selected text
- **THEN** a task is allocated from that selection according to the current mapping
- **AND** the created task can be opened from the document workflow

### Requirement: Development integration
TrackWork SHALL support associating task work with configured SCM development artifacts and expose normalized development activity on tasks.

#### Scenario: GitLab activity arrives
- **WHEN** a tracked GitLab webhook contains task-associated development activity
- **THEN** TrackWork can associate and display the activity on the corresponding task according to provider matching rules

### Requirement: Provider actions
Where supported by the connected SCM provider and user permissions, TrackWork SHALL allow creating a branch and merge request from a task.

#### Scenario: Create merge request
- **WHEN** an authorized user provides valid repository, source branch, target branch, title, and description
- **THEN** TrackWork creates the merge request through the provider adapter
- **AND** associates the result with the task

### Requirement: Development-triggered automation foundation
TrackWork SHALL support workspace automation rules that can react to normalized development events and perform supported task actions such as status transition or warning.

#### Scenario: Pipeline failure warning
- **GIVEN** an enabled automation rule for failed pipeline events
- **WHEN** an associated pipeline fails
- **THEN** TrackWork executes the configured warning behavior at most once for the same logical event/rule execution

### Requirement: Self-hosted administration
The self-hosted product SHALL provide an administrator UI and dashboard that can operate without cloud-only service dependencies.

#### Scenario: Load self-hosted dashboard
- **WHEN** an administrator opens the dashboard on a self-hosted deployment
- **THEN** the dashboard request returns valid self-hosted analytics data or valid empty-state values rather than a cloud-only 404

### Requirement: English and Russian TrackWork UI
Current TrackWork user-facing surfaces SHALL support English and Russian presentation for system-owned strings.

#### Scenario: Russian workspace UI
- **WHEN** AFFiNE resolves the user's UI language to Russian
- **THEN** TrackWork-owned system labels use the Russian dictionary
- **AND** custom user-authored board/stage/task names are not translated