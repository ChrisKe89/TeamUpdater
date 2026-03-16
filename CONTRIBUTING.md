# Contributing

## Development setup

1. Install Node.js 20+, `pnpm`, and the Rust toolchain.
2. Run `pnpm install`.
3. Start the frontend with `pnpm dev` or the desktop app with `pnpm tauri dev`.

## Quality gates

- `pnpm lint`
- `pnpm test -- --run`
- `pnpm build`
- `pnpm tauri build --debug`

## Code style

- TypeScript uses strict mode.
- Rust code should pass `cargo fmt` and `cargo test`.
- Keep README and CHANGELOG updated with behavioral changes.

## Pull requests

- Branch names should follow `feature/<topic>`, `fix/<topic>`, or `chore/<topic>`.
- PR titles should follow `[TeamUpdaterV3] Short description`.
- Include testing notes and any packaging impact.
