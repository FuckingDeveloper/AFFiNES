# TrackWork OpenSpec

This directory is the specification-driven development source of truth for TrackWork development inside the AFFiNE fork.

## Workflow

- `openspec/specs/` contains accepted product capabilities and long-lived requirements.
- `openspec/changes/` contains proposed changes before implementation.
- Each change contains a proposal, technical design, implementation tasks, and capability delta specs.
- Implementation work should reference an OpenSpec change and update its task checklist.
- When a change is complete and verified, its requirements should be reconciled into `openspec/specs/` and the change archived.

## Current roadmap change

`openspec/changes/trackwork-product-roadmap/` defines the planned evolution from the current TrackWork task tracker into an integrated knowledge, planning, development, automation, and analytics workspace.

The roadmap deliberately prioritizes stability and daily usability before broad feature expansion.