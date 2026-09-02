# Capability: Knowledge Integration

## ADDED Requirements

### Requirement: Durable document task references
TrackWork SHALL represent recognized task references in documents as resolvable task links while preserving plain text where reference behavior is not appropriate.

#### Scenario: Type task key in paragraph
- **WHEN** a user types a valid task key in a supported document text context
- **THEN** the reference can resolve to the corresponding task
- **AND** opening it does not require manually copying the key into Task Tracker

#### Scenario: Task key in code block
- **WHEN** a task-like key appears inside a code block or explicitly excluded context
- **THEN** it remains literal text unless the user explicitly creates a reference

### Requirement: Live task blocks
Users SHALL be able to embed a live task representation in a document.

#### Scenario: Embed task block
- **WHEN** a user inserts a task block referencing an existing task
- **THEN** the block shows current task identity and selected live fields
- **AND** opening the block navigates to the canonical task
- **AND** editing capabilities respect task permissions

### Requirement: Create task from document selection
Users SHALL be able to create a task from selected document content while preserving provenance.

#### Scenario: Create task from meeting note
- **WHEN** a user selects text and chooses Create TrackWork task
- **THEN** a new task is created using the selection according to the creation mapping
- **AND** the task records a relationship to the source document
- **AND** the source can expose a reference back to the created task

### Requirement: Backlinks
A task SHALL expose documents that reference or explicitly relate to it.

#### Scenario: View task references
- **GIVEN** several workspace documents reference a task
- **WHEN** the task References section is opened
- **THEN** the user can see and navigate to accessible referencing documents
- **AND** inaccessible documents are not leaked

### Requirement: Planning-document associations
Documents SHALL be associable with supported planning objects including Epics, Sprints, Releases, and Milestones.

#### Scenario: Sprint retrospective document
- **WHEN** a retrospective document is linked to a sprint
- **THEN** both the sprint and document can expose the relationship
- **AND** completing or archiving the sprint does not delete the document

### Requirement: Planning-aware templates
TrackWork SHOULD provide document templates that can resolve current planning context such as sprint, release, or epic.

#### Scenario: Create sprint review document
- **WHEN** a user creates a Sprint Review document for an active sprint
- **THEN** the document can include live or generated references to sprint scope and relevant tasks

### Requirement: Safe synchronized actions
Any future synchronization between document checklist items and task state SHALL define conflict and ownership rules before enabling two-way mutation.

#### Scenario: Conflicting updates
- **GIVEN** a checklist representation linked to a task
- **WHEN** document state and task state change concurrently
- **THEN** the system applies a documented conflict policy
- **AND** never silently drops either user's update