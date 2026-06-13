# Light/Dark Mode — Design Spec

**Date:** 2026-06-13
**Status:** Approved

## Overview

Add a user-toggleable light/dark mode to the frontend (`frontend/`, Next.js 15 + Tailwind 4).
The app starts in light mode for every user; a toggle in the header lets them switch to dark
mode, and the choice is remembered in the browser for future visits.

## Approach

The codebase currently uses raw Tailwind color utilities throughout (~30 of 52 component/page
files), dominated by structural grays/whites (`bg-white`, `bg-gray-50/100`,
`text-gray-400/500/600/900`, `border-gray-200/300`) with a handful of accent colors used in a
few places each (`bg-purple-600` primary buttons, `bg-amber-50`/`text-amber-700` warning
boxes, `text-red-600` error text).

**Hybrid approach:**
- Define **semantic design tokens** (CSS custom properties, registered via Tailwind v4's
  `@theme`) for the high-frequency **structural** colors: `background`, `foreground`, `card`,
  `card-foreground`, `muted`, `muted-foreground`, `accent`, `accent-foreground`, `border`,
  `primary`, `primary-foreground`. These get one light value and one dark value, defined once.
- For the low-frequency **accent** colors (amber warnings, red errors), add inline Tailwind
  `dark:` variants at each occurrence rather than introducing tokens for them.

This gets most of the consistency benefit of a full token system (the 80% case — backgrounds,
text, borders, primary buttons) without the upfront cost of designing tokens for every one-off
accent color.

Tailwind v4 dark-mode variant is enabled via a class-based custom variant so the toggle can
control it directly (rather than relying on `prefers-color-scheme`):

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));
```

Exact `@theme`/`@custom-variant` syntax should be verified against current Tailwind v4 docs
during implementation (e.g. via the context7 MCP server) — the mechanism may have minor
syntax differences from the snippets below.

## Token palette

Derived from a "soft dim" navy-tinted dark palette, chosen for being easier on the eyes than
pure black while keeping the existing purple primary color legible in both modes.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#ffffff` | `#15171f` | page canvas |
| `foreground` | `#111827` | `#d6d8e1` | default text |
| `card` | `#ffffff` | `#1c1f2b` | sidebar, header, cards/panels |
| `card-foreground` | `#111827` | `#d6d8e1` | text on cards/panels |
| `muted` | `#f9fafb` | `#1c1f2b` | subtle backgrounds (was `bg-gray-50/100`) |
| `muted-foreground` | `#6b7280` | `#9296a8` | secondary text (was `text-gray-400/500/600`) |
| `accent` | `#f3f4f6` | `#262a3b` | hover/active surfaces (e.g. active sidebar link) |
| `accent-foreground` | `#111827` | `#f0f1f5` | text on hover/active surfaces |
| `border` | `#e5e7eb` | `#2f3344` | dividers/borders |
| `primary` | `#9333ea` | `#9333ea` | primary CTA buttons (unchanged — good contrast both ways) |
| `primary-foreground` | `#ffffff` | `#ffffff` | text on primary buttons |

```css
@theme {
  --color-background: #ffffff;
  --color-foreground: #111827;
  --color-card: #ffffff;
  --color-card-foreground: #111827;
  --color-muted: #f9fafb;
  --color-muted-foreground: #6b7280;
  --color-accent: #f3f4f6;
  --color-accent-foreground: #111827;
  --color-border: #e5e7eb;
  --color-primary: #9333ea;
  --color-primary-foreground: #ffffff;
}

.dark {
  --color-background: #15171f;
  --color-foreground: #d6d8e1;
  --color-card: #1c1f2b;
  --color-card-foreground: #d6d8e1;
  --color-muted: #1c1f2b;
  --color-muted-foreground: #9296a8;
  --color-accent: #262a3b;
  --color-accent-foreground: #f0f1f5;
  --color-border: #2f3344;
  --color-primary: #9333ea;
  --color-primary-foreground: #ffffff;
}
```

This registers `bg-background`, `text-foreground`, `bg-card`, `text-card-foreground`,
`bg-muted`, `text-muted-foreground`, `bg-accent`, `text-accent-foreground`, `border-border`,
`bg-primary`, `text-primary-foreground` as Tailwind utilities.

## Components

### `ThemeProvider` (new — `frontend/src/components/ThemeProvider.jsx`)

Client component, React context exposing `{ theme, toggleTheme }`.

- On mount: reads `localStorage.getItem('theme')`. If `'dark'`, ensures `document.documentElement`
  has the `dark` class and sets state to `'dark'`. Otherwise (missing or `'light'`), state is
  `'light'` and no class is applied. **No `prefers-color-scheme` check** — light is always the
  default for first-time visitors.
- `toggleTheme()`: flips state between `'light'`/`'dark'`, adds/removes the `dark` class on
  `document.documentElement`, and writes the new value to `localStorage.theme`.

Wrapped around `children` in `frontend/src/components/Providers.jsx`, alongside the existing
`SessionProvider`.

### No-flash inline script (`frontend/src/app/layout.jsx`)

A small inline `<script>` in `<head>`, executed before paint:

```js
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}
})();
```

This avoids a flash of light mode for returning users who picked dark, before
`ThemeProvider` hydrates. `layout.jsx` already has `suppressHydrationWarning` on `<html>` and
`<body>`, which covers the resulting class-attribute mismatch between server and client render.

### `ThemeToggle` (new — `frontend/src/components/ThemeToggle.jsx`)

Small button using `useTheme()` from `ThemeProvider`'s context. Renders an inline sun SVG icon
in light mode / moon SVG icon in dark mode (no new icon library dependency); clicking calls
`toggleTheme()`.

Placed in `frontend/src/app/(app)/layout.jsx`'s header, top-right, next to the user
email/role and the `LogoutButton`.

## Migration

Apply across the full app (`(app)/layout.jsx` shell plus all ~30 component/page files using
raw color utilities, including email preview/draft/template/sequence panels — these follow the
app theme like everything else, no special-cased "always light" preview areas).

Class mapping to apply throughout:

| Old | New |
|---|---|
| `bg-white` (page/panel background) | `bg-card` |
| `bg-gray-50` (subtle backgrounds), static `bg-gray-100` badges | `bg-muted` |
| `text-gray-400`, `text-gray-500`, `text-gray-600` | `text-muted-foreground` |
| `text-gray-700`, `text-gray-900`, default/inherited text | `text-foreground` |
| `border`, `border-b`, `border-t`, `border-gray-200`, `border-gray-300` (no explicit color) | No change — covered by a new base-layer rule (see below) |
| `bg-purple-600`/`bg-purple-700` + white text (Unlock/Save/Revise buttons) | `bg-primary text-primary-foreground` |
| `bg-black text-white`, `bg-gray-800 text-white` (high-contrast CTA buttons — the app's most common primary-button style) | `bg-foreground text-background` |
| `border-black text-black` (outlined secondary button) | `border-foreground text-foreground` |
| `hover:bg-gray-100`, `hover:bg-gray-200` (interactive hover surfaces) | `hover:bg-accent` |
| Sidebar active item (`bg-white border-l-2 border-black ... text-black`) | `bg-accent border-l-2 border-foreground text-accent-foreground` |
| Accent colors used a handful of times each — error/warning/success/info text and panels (`text-red-600`, `bg-amber-50`/`text-amber-700`/`border-amber-300`, `bg-green-50`/`text-green-700`, `bg-blue-50`/`text-blue-700`/`text-blue-900`, etc.) | Add inline `dark:` variant per occurrence, following the convention below |
| Status/sentiment badges (`bg-{color}-100 text-{color}-700`, e.g. `LeadStatusBadge`, `SentimentBadge`, "Approved"/"Template" badges) | Add `dark:bg-{color}-900/40 dark:text-{color}-300` |

**`dark:` variant convention for accent colors** (applied per-occurrence, not as tokens):
- Light panel + border (`bg-{color}-50 border-{color}-200/300`) → add `dark:bg-{color}-950/30 dark:border-{color}-800`
- Badge (`bg-{color}-100 text-{color}-600/700/800`) → add `dark:bg-{color}-900/40 dark:text-{color}-300`
- Plain accent text (`text-{color}-500/600/700/900`) → add `dark:text-{color}-400` (or `dark:text-{color}-200` for the darkest `-900` shades)
- Solid saturated action buttons (`bg-green-600`, `bg-purple-600`, `bg-purple-700`, `bg-amber-500` dot) → no change; already have sufficient contrast on both `bg-card` and `bg-background`

### Base border-color rule

Many elements use bare `border`, `border-b`, `border-t`, etc. without an explicit color, relying on Tailwind's default border color. Add a base-layer rule so these automatically pick up the `border` token in both themes, without touching every call site:

```css
@layer base {
  *, ::before, ::after {
    border-color: var(--color-border);
  }
}
```

## Out of scope / non-goals

- No `prefers-color-scheme` / system-theme detection — always starts light.
- No server-side or per-account persistence of theme preference — `localStorage` only.
- No "system" option in the toggle — binary light/dark switch.
- No additional themes beyond light and this one dark palette.

## Testing

**Automated (Vitest + Testing Library, `frontend/`):**
- `ThemeProvider`: toggling flips the `dark` class on `document.documentElement` and persists
  the choice to `localStorage`; on mount, respects a previously stored `'dark'` preference.
- `ThemeToggle`: renders the correct icon for the current theme; clicking invokes
  `toggleTheme()` and the icon swaps accordingly.

**Manual:**
- Visually spot-check a representative set of pages (dashboard, campaigns list/detail with
  email draft panels, settings, unibox/replies) in both light and dark mode for contrast and
  readability, particularly the amber warning and red error states that rely on inline `dark:`
  variants rather than tokens.
