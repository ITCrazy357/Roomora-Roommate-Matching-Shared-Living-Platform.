<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Roomora UI palette

All current and future screens must use the shared palette in
`src/app/theme.css`: coral `#E65036` for brand/highlights, coral action
`#D3432B` for solid controls, peach `#F28E6B`, warm cream `#FAF8F5`, and dark
neutral text. Follow the user's coral landing-page reference:
use coral for CTA, logo, selected states and focus; use cream/peach
surfaces and neutral text. Read `../docs/ui-theme.md` before UI work. Reuse semantic
CSS variables, their Tailwind mappings in `globals.css`, and shared UI
components. Do not introduce page-specific hard-coded colors. Preserve
semantic error colors and third-party brand marks. Keep Be Vietnam Pro.
