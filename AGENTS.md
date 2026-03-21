# AGENTS.md

## Purpose
TeamUpdater V3 is a Windows desktop operator console for previewing and syncing ShareFile folders to the local workstation. Prefer changes that keep the app fast, compact, and operationally clear.

## Working Rules
- Make the smallest change that solves the task.
- Preserve existing behavior unless the task explicitly asks for behavior changes.
- Run relevant checks after changes: `pnpm lint`, `pnpm build`, and `cargo test` for Tauri/backend changes.
- Update docs when user-facing behavior or setup steps change.

## UI Consistency
- Maintain the current compact desktop-console style. Do not reintroduce large helper text, oversized spacing, or onboarding-style copy.
- Reuse existing layout and spacing patterns in `src/App.css` before adding new one-off styles.
- Keep panels, buttons, toggles, and cards visually consistent across Home, Preview, History, Folder Selection, and Firmware Retention.
- Prefer concise labels and operational status text over explanatory paragraphs.
- When adding new UI sections, match the existing color palette, border treatment, radius, and density.
- Preserve responsive behavior: desktop should use horizontal space efficiently, while smaller widths should still collapse cleanly.
- Use the shared spacing scale only: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`.
- Keep card padding at `24px`, stacked panel gaps at `16px`, major section gaps at `24px`, nav gaps at `12px`, and page padding at `24px`.
- Use the shared radius scale only: `10px` for small controls, `12px` for buttons/cards, `16px` for major panels.
- Keep the sidebar narrow (`240px` to `256px`) with `48px` nav items and low-glow active states.
- Use only three button tiers:
  - Primary: `Run update`
  - Secondary: `Run preview`, `Refresh preview`, `Refresh drives`
  - Utility: collapse toggles, `Stop`, `Quit`
- Collapse controls should use compact chevron toggles in section headers instead of full-size text buttons.
- Prefer designed empty states with a short title and one supporting line; avoid large blank panels with placeholder copy.
- Maintain the Home progress area as a single structured module: transfer title/status first, aligned mini-metrics second, progress bars third, actions last.
- Keep preview wording consistent: use `to copy` language for preview byte totals, `Run preview` for preview generation, and `Run update` for execution.

## Frontend
- Main app UI lives in `src/App.tsx` and `src/App.css`; prefer extending shared components/patterns rather than duplicating markup.
- Keep feed, terminal, preview, and history panels readable with fixed internal rhythm and scrollable content where lists can grow.

## Backend
- Tauri commands and sync logic live under `src-tauri/src/`.
- Keep sync and preview flows cancellable and responsive; avoid blocking the UI thread with long-running work.
- Surface operational failures clearly to the frontend.

## Docs
- Keep high-signal repo docs at the root.
- If planning work is requested, prefer writing or updating `PRD.md`.
