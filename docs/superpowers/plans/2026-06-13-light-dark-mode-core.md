# Light/Dark Mode — Core Infrastructure & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a working, persisted light/dark theme toggle to the frontend app shell (Tailwind v4 tokens, theme provider, no-flash boot script, header toggle, sidebar + header colors).

**Architecture:** Tailwind v4 `@theme`/`@custom-variant dark` CSS tokens drive a `.dark` class on `<html>`. A React `ThemeProvider` (context + `localStorage`) toggles that class; an inline boot script applies it before paint to avoid a flash. A new `ThemeToggle` button sits in the app header. The app shell (root layout, `(app)` layout header, `Sidebar`) is migrated from raw Tailwind grays/whites to the new semantic tokens.

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind CSS v4, Vitest + Testing Library.

Reference spec: `docs/superpowers/specs/2026-06-13-light-dark-mode-design.md`

This plan covers the **theming mechanism and app shell only**. Migrating the remaining ~30 page/component files (campaigns, leads, settings, email panels, etc.) to the new tokens is a separate follow-up plan — this plan alone produces a working, testable toggle that already affects the header and sidebar.

---

### Task 1: Tailwind v4 theme tokens, dark variant, and base border rule

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Replace the contents of `globals.css`**

Current content is just:
```css
@import "tailwindcss";
```

Replace it with:

```css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

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

@layer base {
  *,
  ::before,
  ::after {
    border-color: var(--color-border);
  }
}
```

- [ ] **Step 2: Verify the CSS compiles**

Check whether a frontend dev server is already running on port 3000, and use it if so; otherwise start one:

```bash
cd frontend
if ! lsof -ti:3000 >/dev/null 2>&1; then
  npm run dev > /tmp/frontend-dev.log 2>&1 &
  for i in {1..30}; do grep -q "Ready in" /tmp/frontend-dev.log 2>/dev/null && break; sleep 1; done
fi
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Expected: `200`. If you started a new server and `/tmp/frontend-dev.log` contains a PostCSS/Tailwind error instead, fix the CSS syntax before continuing. If you started the server yourself for this check, leave it running — later tasks reuse it.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/globals.css
git commit -m "feat(frontend): add light/dark theme tokens via Tailwind v4 @theme"
```

---

### Task 2: ThemeProvider component (context + localStorage)

**Files:**
- Create: `frontend/src/components/ThemeProvider.jsx`
- Test: `frontend/src/components/__tests__/ThemeProvider.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ThemeProvider, useTheme } from "../ThemeProvider";

function Probe() {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button onClick={toggleTheme}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

test("defaults to light mode when no theme is stored", () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);

  expect(screen.getByTestId("theme")).toHaveTextContent("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});

test("applies a stored 'dark' preference on mount", () => {
  localStorage.setItem("theme", "dark");

  render(<ThemeProvider><Probe /></ThemeProvider>);

  expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("toggleTheme flips the theme, toggles the dark class, and persists to localStorage", () => {
  render(<ThemeProvider><Probe /></ThemeProvider>);

  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByTestId("theme")).toHaveTextContent("dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem("theme")).toBe("dark");

  fireEvent.click(screen.getByText("toggle"));
  expect(screen.getByTestId("theme")).toHaveTextContent("light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem("theme")).toBe("light");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/__tests__/ThemeProvider.test.jsx`
Expected: FAIL — `Failed to resolve import "../ThemeProvider"` (file doesn't exist yet).

- [ ] **Step 3: Implement `ThemeProvider.jsx`**

```jsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (localStorage.getItem("theme") === "dark") {
      document.documentElement.classList.add("dark");
      setTheme("dark");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/__tests__/ThemeProvider.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ThemeProvider.jsx frontend/src/components/__tests__/ThemeProvider.test.jsx
git commit -m "feat(frontend): add ThemeProvider for light/dark mode"
```

---

### Task 3: No-flash boot script + global background/foreground + wire ThemeProvider

**Files:**
- Modify: `frontend/src/app/layout.jsx`
- Modify: `frontend/src/components/Providers.jsx`

- [ ] **Step 1: Wrap `ThemeProvider` around the existing providers**

Current `frontend/src/components/Providers.jsx`:

```jsx
"use client";
import { SessionProvider } from "next-auth/react";

export default function Providers({ children }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

Replace with:

```jsx
"use client";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./ThemeProvider";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ThemeProvider>{children}</ThemeProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 2: Add the no-flash boot script and theme-aware body classes**

Current `frontend/src/app/layout.jsx`:

```jsx
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = { title: "Outreach App" };

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

Replace with:

```jsx
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata = { title: "Outreach App" };

const THEME_INIT_SCRIPT = `
  (function () {
    try {
      if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

The `dark` class applied by this script (and by `ThemeProvider`) lives on `<html>`, which is why `@custom-variant dark (&:where(.dark, .dark *));` matches descendants of `<html>.dark`. `suppressHydrationWarning` on `<html>`/`<body>` already covers the class/attribute mismatch this script causes between server and client render.

- [ ] **Step 3: Verify the boot script and body classes are served**

Reuse the dev server from Task 1 (start one the same way if it's not running):

```bash
curl -s http://localhost:3000/login > /tmp/login.html
grep -c "bg-background text-foreground" /tmp/login.html
grep -c "classList.add('dark')" /tmp/login.html
```

Expected: both greps print `1` or more.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all existing tests + the new `ThemeProvider` tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/layout.jsx frontend/src/components/Providers.jsx
git commit -m "feat(frontend): wire ThemeProvider and add no-flash theme boot script"
```

---

### Task 4: ThemeToggle component

**Files:**
- Create: `frontend/src/components/ThemeToggle.jsx`
- Test: `frontend/src/components/__tests__/ThemeToggle.test.jsx`

- [ ] **Step 1: Write the failing test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ThemeProvider } from "../ThemeProvider";
import ThemeToggle from "../ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

test("shows a 'switch to dark mode' button in light mode and switches on click", () => {
  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  );

  const button = screen.getByRole("button", { name: /switch to dark mode/i });
  fireEvent.click(button);

  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(localStorage.getItem("theme")).toBe("dark");
  expect(screen.getByRole("button", { name: /switch to light mode/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/__tests__/ThemeToggle.test.jsx`
Expected: FAIL — `Failed to resolve import "../ThemeToggle"` (file doesn't exist yet).

- [ ] **Step 3: Implement `ThemeToggle.jsx`**

```jsx
"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="p-1.5 rounded border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/__tests__/ThemeToggle.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ThemeToggle.jsx frontend/src/components/__tests__/ThemeToggle.test.jsx
git commit -m "feat(frontend): add ThemeToggle button"
```

---

### Task 5: Add ThemeToggle to the app header and migrate header colors

**Files:**
- Modify: `frontend/src/app/(app)/layout.jsx`

- [ ] **Step 1: Edit the header**

Current `frontend/src/app/(app)/layout.jsx`:

```jsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import AuthWatcher from "@/components/AuthWatcher";
import Sidebar from "@/components/Sidebar";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center bg-white">
        <span className="font-bold text-lg tracking-tight">Outreach</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">
            {session.user.email} · {session.user.role}
          </span>
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <AuthWatcher />
          {children}
        </main>
      </div>
    </div>
  );
}
```

Replace with:

```jsx
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";
import AuthWatcher from "@/components/AuthWatcher";
import Sidebar from "@/components/Sidebar";
import ThemeToggle from "@/components/ThemeToggle";

export default async function AppLayout({ children }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b px-6 py-3 flex justify-between items-center bg-card">
        <span className="font-bold text-lg tracking-tight">Outreach</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {session.user.email} · {session.user.role}
          </span>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 p-6 overflow-auto">
          <AuthWatcher />
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass (this file has no dedicated test — it's an async server component — so this is a regression check).

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/(app)/layout.jsx"
git commit -m "feat(frontend): add theme toggle to app header"
```

---

### Task 6: Migrate Sidebar colors to theme tokens

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: Edit the nav, active/inactive link, and footer classes**

Current `frontend/src/components/Sidebar.jsx` (relevant lines):

```jsx
  return (
    <nav className="w-52 border-r bg-gray-50 flex flex-col shrink-0">
      <div className="flex-1 p-3 space-y-0.5 pt-4">
        {NAV.filter(item => !item.adminOnly || session?.user?.role === "ADMIN").map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-white border-l-2 border-black font-semibold text-black shadow-sm"
                  : "text-gray-600 hover:bg-gray-200 border-l-2 border-transparent"
              }`}
            >
              <Image src={icon} alt={label} width={20} height={20} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
      {credits !== null && (
        <div className="px-4 py-3 border-t text-xs text-gray-500">
          <span className="font-medium text-gray-700">{credits}</span> credits remaining
        </div>
      )}
    </nav>
  );
```

Replace with:

```jsx
  return (
    <nav className="w-52 border-r bg-muted flex flex-col shrink-0">
      <div className="flex-1 p-3 space-y-0.5 pt-4">
        {NAV.filter(item => !item.adminOnly || session?.user?.role === "ADMIN").map(({ href, label, icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? "bg-accent border-l-2 border-foreground font-semibold text-accent-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent border-l-2 border-transparent"
              }`}
            >
              <Image src={icon} alt={label} width={20} height={20} className="shrink-0" />
              {label}
            </Link>
          );
        })}
      </div>
      {credits !== null && (
        <div className="px-4 py-3 border-t text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{credits}</span> credits remaining
        </div>
      )}
    </nav>
  );
```

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/Sidebar.jsx
git commit -m "feat(frontend): migrate sidebar to theme tokens"
```

---

### Task 7: Manual end-to-end smoke test

**Files:** none (verification only — no commit)

- [ ] **Step 1: Start both dev servers**

Backend (from `backend/`, port 4000) and frontend (from `frontend/`, port 3000) must both be running. Reuse any servers already running from previous tasks. Check with:

```bash
lsof -ti:4000 >/dev/null 2>&1 && echo "backend up" || echo "backend down"
lsof -ti:3000 >/dev/null 2>&1 && echo "frontend up" || echo "frontend down"
```

Start whichever is down (`cd backend && node --watch server.js` / `cd frontend && npm run dev`, each in the background).

- [ ] **Step 2: Log in and verify the toggle in a browser**

Open `http://localhost:3000/login` and log in with a seeded test account (see project memory for credentials). Then check:

1. App loads in **light mode** by default — header and sidebar are white/light-gray, a **sun icon** button is visible top-right in the header (next to the email/role text and Logout button).
2. Click the toggle — header, sidebar, and page background switch to the dark "soft dim" palette (navy-gray tones), and the icon changes to a **moon**.
3. Reload the page — it **stays in dark mode** with no flash of light mode before the dark styles apply.
4. Click the toggle again — returns to light mode; reload — **stays in light mode**.
5. The sidebar's active nav item is visibly highlighted in both themes, and the "N credits remaining" footer text is legible in both themes.

- [ ] **Step 3: Report results**

If any check fails, fix the relevant task's code before moving on to `finishing-a-development-branch`.

---

## Self-Review Notes

- **Spec coverage:** Tokens + `@custom-variant`/`@theme` setup (Task 1), `ThemeProvider` (Task 2), no-flash script + body classes (Task 3), `ThemeToggle` (Task 4), header placement (Task 5), and the documented sidebar mapping (Task 6) are all covered. The base border-color rule added to the spec is in Task 1. Migrating the remaining ~30 page/component files per the spec's mapping table is intentionally **out of scope for this plan** (see header note) and will be a follow-up plan.
- **Type/name consistency:** `ThemeProvider` exports `ThemeProvider` and `useTheme`; `ThemeToggle` imports `useTheme` from `./ThemeProvider` — consistent across Tasks 2–4. `theme`/`toggleTheme` names match between provider, toggle, and tests.
- **No placeholders:** every step has complete file contents or exact commands.
