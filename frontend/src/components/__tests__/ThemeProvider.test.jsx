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
