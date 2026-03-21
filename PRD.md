# PRD: TeamUpdater V3 Phase 2 Interaction And State System

## Summary
This phase upgrades TeamUpdater V3 from a visually cleaned-up operator console into a state-driven runtime UI. The focus is not new sync capability. The focus is making preview and update runs feel visibly alive, understandable, and controllable while they are in motion.

The app already functions, but operators currently have to infer too much from the terminal. This PRD defines a clear application state model, stronger active-run feedback, better error handling, and a layout that keeps critical runtime information above the fold.

## Problem
The current UI looks too passive during preview and update runs. Operators click `Run preview` or `Run update`, then wait for confirmation from verbose output rather than from the primary interface.

Observed issues:
- The UI does not clearly enter a running state.
- Progress bars remain visually static for too long.
- Terminal output carries most of the useful runtime feedback.
- Errors appear as a banner instead of a dominant operational state.
- Active-use layout forces too much scrolling between progress, feeds, and logs.
- Action buttons do not shift decisively based on system state.
- Feeds and collapse controls consume space without guiding attention.

## Goals
- Make runtime activity immediately obvious after starting preview or update.
- Promote key operational feedback out of the terminal into the primary UI.
- Define a consistent state model for idle, running, completed, preview-ready, and error behavior.
- Keep the most important runtime information visible without scrolling.
- Make action buttons, progress indicators, and panel emphasis change clearly by state.
- Preserve the compact desktop-console style already established in the app.

## Non-Goals
- No redesign of core sync or preview backend logic unless needed to expose existing progress data cleanly.
- No major navigation restructuring.
- No large visual rebrand or style reset.
- No expansion of terminal verbosity; the goal is to reduce operator dependence on it.
- No persistence requirement for temporary UI emphasis, animation, or collapse state unless implementation already supports it cheaply.

## Users
Primary user:
- Desktop operator running ShareFile preview and sync workflows on a workstation.

Primary needs:
- Immediate confidence that a process has started.
- Clear visibility into what is happening now.
- Fast understanding of progress, errors, and next actions without reading logs.
- Stable layout that does not hide key controls or status during a run.

## Success Criteria
- Starting preview or update immediately changes the UI into a visible running state.
- Run buttons disable while a process is active and `Stop` becomes the dominant action.
- The top runtime module shows current file, processed count, total count, and active status above the terminal.
- Progress bars animate immediately and remain visually legible during long operations.
- Errors replace the passive banner pattern with a clear error state that includes next actions.
- Home can be used during active runs without scrolling to find primary progress and controls.
- Low-value sections consume less space by default and expand when useful.

## State Model

### 1. Idle
Definition:
- No preview or sync is currently running.
- No pending completion or blocking error state is active.

UI expectations:
- Action area emphasizes `Run preview` and `Run update`.
- Progress module shows neutral ready state.
- Terminal and feeds remain secondary.
- Low-value sections may remain collapsed by default.

### 2. Preview-Ready
Definition:
- Preview results are available and the operator can inspect likely work before running update.

UI expectations:
- KPI cards and preview summary receive visual priority.
- `Run update` is prominent.
- Preview totals use `to copy` wording.
- Layout preserves continuity from Home to Preview.

### 3. Running
Definition:
- Preview generation or update execution is actively in progress.

UI expectations:
- `Run preview` and `Run update` are disabled.
- `Stop` is visible and visually stronger than utility actions.
- A running indicator appears near the top of the active area.
- Progress bars animate immediately, including smoothing when backend values are sparse.
- The active module receives subtle visual emphasis such as glow, border, or status treatment consistent with the current design language.
- Key progress data is shown above the terminal.

### 4. Completed
Definition:
- The last preview or update run completed successfully.

UI expectations:
- Running indicators stop.
- The UI clearly shows completion status and summary outcome.
- Main actions shift to `Run again` and `View results` or the closest existing equivalents.
- Progress area remains readable as a results summary rather than snapping back to a fully neutral state.

### 5. Error
Definition:
- Preview or update failed in a way the operator must notice and respond to.

UI expectations:
- The progress area freezes in a clear error presentation.
- Error state becomes the dominant surface instead of a transient banner.
- The UI includes a short title, concise explanation, and direct next actions.
- Terminal remains available for detail, but it is no longer the primary explanation channel.

## Functional Requirements

### 1. Global runtime state handling
- Implement a shared state model in the frontend for:
  - `idle`
  - `preview-ready`
  - `running`
  - `completed`
  - `error`
- For each state, explicitly define:
  - visible buttons
  - disabled buttons
  - highlighted sections
  - top-level status text
- State transitions must be driven by existing runtime events wherever possible rather than inferred only from button clicks.

### 2. Running state visibility
- On preview or update start:
  - disable `Run preview`
  - disable `Run update`
  - show an active status badge such as `Running...`
  - show a spinner or equivalent motion indicator in the header or top status row
  - show status text near the top such as `Processing X files...`
  - visually emphasize the active runtime module
- The UI must react immediately on start even before meaningful byte or file progress has accumulated.

### 3. Progress module rebuild
- Rework the Home progress area into the primary runtime surface.
- Show:
  - current file being processed
  - processed count
  - total count
  - progress values with labels such as `320 / 1407`
  - clear run status text
- Progress bars must:
  - increase in visual prominence
  - use approximately `6px` to `8px` height
  - have stronger contrast than the current implementation
  - animate smoothly to avoid looking stalled when updates are sparse
- Preserve the AGENTS guidance that the progress module remains one structured unit: title and status first, mini-metrics second, progress bars third, actions last.

### 4. Promote key feedback above logs
- The following information must be surfaced above the terminal:
  - current file
  - processed count versus total
  - error count or failure status
  - major state transitions such as started, completed, stopped, failed
- Operators should not need to parse verbose log lines to understand whether work is active or what file is currently being processed.

### 5. Error state handling
- When an error occurs:
  - stop live progress animations
  - freeze the progress area in an error state
  - show a clear error title
  - show a short explanation in plain operational language
  - show one or more actions such as `Retry` and `View logs`
- Do not rely on a brief red banner as the primary failure treatment.
- Preserve access to detailed logs and terminal output after an error.

### 6. Action button behavior by state
- Idle:
  - emphasize `Run preview`
  - keep `Run update` available when valid
- Running:
  - disable run buttons
  - emphasize `Stop` with danger styling consistent with the app
  - `Pause` is optional and only valid if backed by real runtime support
- Completed:
  - offer next-step actions such as rerun and result review
- Error:
  - offer recovery actions such as retry and log review
- Buttons must clearly communicate what the operator can do now, not just what the app can do in general.

### 7. Above-the-fold runtime layout
- Keep critical runtime information visible without page scrolling during active use.
- Make the top runtime section sticky during scroll.
- Keep terminal content scrollable inside its own panel.
- Reduce layout shifting during runs so the operator does not lose context.
- Preserve responsive behavior on narrower widths without breaking the sticky runtime pattern.

### 8. Feeds and low-value section behavior
- Collapse feed sections by default when they are empty or low-value.
- Expand feed sections automatically when relevant content appears.
- Keep collapse controls compact and consistent with existing chevron-based patterns.
- Make headers clickable where practical.
- Do not allow empty feed panels to consume large fixed areas during active use.

### 9. Attention hierarchy by state
- While running:
  - emphasize progress and current file
- While preview-ready:
  - emphasize KPI cards and preview results
- While idle:
  - emphasize primary actions
- Terminal, secondary feeds, and lower-priority modules should visually step back when they are not the primary focus.

### 10. Screen-to-screen continuity
- Reduce the abrupt feel of Home to Preview transitions.
- Keep shared elements such as connection status, stats placement, and core progress framing visually consistent between views.
- Add subtle transition behavior such as fade or slide only if it fits the current compact desktop-console style and does not add lag or visual noise.

### 11. Copy consistency cleanup
- Standardize operational wording across runtime states.
- Correct copy such as:
  - replace copied wording in preview contexts with `to copy`
  - normalize `No active transfer` versus `No active file transfer`
  - replace unclear labels such as `Disabled for this run` where a more operational phrase is available
- Keep labels concise and action-oriented.

### 12. Terminal and sidebar de-emphasis
- Reduce terminal visual dominance while keeping it readable during active runs.
- Slightly lower sidebar visual weight so it does not compete with runtime content.
- If adjusted, keep the sidebar within the AGENTS-prescribed width and style bounds.

## UX Requirements
- The UI must feel active when the system is active.
- Motion should serve status clarity, not decoration.
- Operators should be able to answer these questions instantly:
  - Did the process start?
  - What is it doing right now?
  - How far through is it?
  - Did it fail?
  - What should I do next?
- Error states should be unmissable without being noisy.
- Empty states should remain compact and intentional.

## Technical Considerations
- Main implementation is expected in:
  - `src/App.tsx`
  - `src/App.css`
- If existing backend events do not expose enough progress information for current-file and processed-total display, document the gap and add the smallest necessary backend contract changes under `src-tauri/src/`.
- Keep sync and preview flows cancellable and responsive.
- Avoid blocking the UI thread with animation or polling work.
- Prefer extending shared component patterns already present in the app rather than introducing one-off runtime widgets.

## Implementation Plan

### Phase A: State model
- Define the canonical frontend state enum or equivalent derived view model.
- Map existing runtime signals into state transitions.
- Centralize button visibility and disabled logic by state.

### Phase B: Runtime surface
- Rebuild the Home progress module with current-file and processed-total metrics.
- Add the running badge, top status line, and immediate animation behavior.
- Add state-driven emphasis styling for running, completed, and error.

### Phase C: Layout behavior
- Make the top runtime area sticky.
- Constrain terminal scrolling to its own panel.
- Default low-value feed panels to collapsed and auto-expand when populated.

### Phase D: Error and completion UX
- Replace passive error banner handling with a full error-state treatment.
- Add completion treatment that keeps results visible and actionable.
- Normalize button sets for idle, running, completed, and error states.

### Phase E: Copy and continuity pass
- Clean up inconsistent runtime wording.
- Reduce terminal and sidebar dominance.
- Improve continuity between Home and Preview surfaces.

## Acceptance Criteria
- Clicking `Run preview` or `Run update` immediately changes the UI into a visible running state.
- While running, `Run preview` and `Run update` are disabled and `Stop` is clearly visible.
- The top runtime area shows current file, processed count, and total count outside the terminal.
- Progress bars are thicker, higher-contrast, labeled, and visibly animated during runs.
- The active runtime section is visually emphasized while a process is running.
- Errors present a dedicated error-state UI with a clear title, short explanation, and recovery actions.
- The top runtime section remains visible during scrolling and the terminal scrolls within its own panel.
- Feed panels collapse when empty and expand when populated or relevant.
- Runtime copy is normalized to match the app’s operator-focused language.
- `pnpm lint` passes.
- `pnpm build` passes.
- `cargo test` passes if backend/Tauri changes are required.

## Open Questions
- Do current backend events expose enough information to show `processed / total` reliably for both preview and update flows?
- Should completed state live only on Home, or also persist in Preview and History summaries?
- Is there a real pause capability planned, or should the running action set stay limited to `Stop`?

## Assumptions
- The existing app already exposes enough signal to detect start, completion, stop, and failure states.
- Visual smoothing for progress is acceptable as long as actual completion and totals remain truthful.
- Feed auto-expansion should be event-driven and not persisted between sessions.
- This phase is primarily a frontend interaction/state pass, with only minimal backend changes if required to surface missing runtime data.
