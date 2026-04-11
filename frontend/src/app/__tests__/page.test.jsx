import { render, screen } from "@testing-library/react";
import Home from "../page.jsx";

test("home renders heading", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { name: /outreach/i })).toBeInTheDocument();
});
