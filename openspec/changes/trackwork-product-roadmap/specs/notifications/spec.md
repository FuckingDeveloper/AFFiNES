# Capability: Notifications and Inbox

## ADDED Requirements

### Requirement: Unified TrackWork inbox
TrackWork SHALL surface actionable task and development notifications through the AFFiNE inbox experience rather than creating an isolated notification system.

#### Scenario: User assigned task
- **WHEN** a user is assigned to a task by another actor
- **THEN** an inbox item identifies the task, actor, and assignment event
- **AND** opening it navigates to the task

### Requirement: Notification sources
TrackWork SHALL support notifications for assignment, mention, watched-task changes, blocked state, due-date events, relevant merge-work events, failed pipelines, and automation warnings.

#### Scenario: Watched task changes
- **GIVEN** a user follows a task
- **WHEN** a relevant task field or status changes
- **THEN** TrackWork may generate an inbox item according to user preferences and deduplication rules

### Requirement: User preferences
Users SHALL be able to control TrackWork notification categories and supported delivery channels without changing workspace-wide behavior for other users.

#### Scenario: Disable pipeline failure notifications
- **WHEN** a user disables pipeline-failure notifications
- **THEN** future pipeline-failure events do not create that user's corresponding delivery
- **AND** the underlying development activity remains available on the task

### Requirement: Deduplication and batching
TrackWork SHALL prevent notification floods caused by repeated equivalent development or automation events.

#### Scenario: Rapid repeated pipeline updates
- **WHEN** multiple provider updates describe the same logical pipeline state within the deduplication window
- **THEN** the user receives at most the configured logical notification rather than one item per raw webhook

### Requirement: Permission-safe notification content
Notifications SHALL not expose task, document, repository, or development information that the recipient can no longer access.

#### Scenario: Access revoked before opening notification
- **GIVEN** a notification was created while the user had access
- **WHEN** access is revoked before the notification is opened
- **THEN** opening the item does not reveal protected entity contents
- **AND** the UI reports that the resource is unavailable or access is denied

### Requirement: Read and lifecycle state
Inbox items SHALL support durable read/unread state and a documented retention policy.

#### Scenario: Mark item read
- **WHEN** a user marks a TrackWork notification as read
- **THEN** the state remains read across sessions and clients