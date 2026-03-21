# Contributing

## Development setup

1. Install Node.js 20+, `pnpm`, the Rust toolchain, and Visual Studio 2022 Build Tools with the `Desktop development with C++` workload.
2. Run `pnpm install`.
3. Run `pnpm doctor:tauri` before the first desktop build on a new Windows machine.
4. If the toolchain doctor reports an uninitialized Visual Studio shell, run `& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64` in that PowerShell session.
5. Start the frontend with `pnpm dev` or the desktop app with `pnpm tauri dev`.

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
