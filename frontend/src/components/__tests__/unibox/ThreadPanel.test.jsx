import { render, screen } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import ThreadPanel from "../../unibox/ThreadPanel";

function wrap(ui) {
  return render(<SessionProvider session={null}>{ui}</SessionProvider>);
}

test("shows empty state when no lead is selected", () => {
  wrap(<ThreadPanel lead={null} />);
  expect(screen.getByText("Select a lead to view their conversation.")).toBeInTheDocument();
});

test("renders lead name and email in header when lead is provided", () => {
  const lead = { id: "1", firstName: "Alice", lastName: "Smith", email: "alice@acme.com", status: "INTERESTED" };
  wrap(<ThreadPanel lead={lead} />);
  expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  expect(screen.getByText("alice@acme.com")).toBeInTheDocument();
});

test("reply button is disabled when textarea is empty", () => {
  const lead = { id: "1", firstName: "Alice", lastName: "Smith", email: "alice@acme.com", status: "INTERESTED" };
  wrap(<ThreadPanel lead={lead} />);
  expect(screen.getByRole("button", { name: /send via instantly/i })).toBeDisabled();
});
