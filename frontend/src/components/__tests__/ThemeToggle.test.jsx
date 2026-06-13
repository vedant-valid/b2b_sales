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
