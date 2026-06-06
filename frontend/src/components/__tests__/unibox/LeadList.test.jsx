import { render, screen, fireEvent } from "@testing-library/react";
import LeadList from "../../unibox/LeadList";

const leads = [
  { id: "1", firstName: "Alice", lastName: "Smith", company: "Acme", status: "INTERESTED" },
  { id: "2", firstName: "Bob", lastName: "Jones", company: "Corp", status: "REPLIED" },
  { id: "3", firstName: "Carol", lastName: "Wu", company: "Inc", status: "CONTACTED" },
];

test("renders all leads by default", () => {
  render(<LeadList leads={leads} selectedId={null} onSelect={() => {}} />);
  expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  expect(screen.getByText("Bob Jones")).toBeInTheDocument();
  expect(screen.getByText("Carol Wu")).toBeInTheDocument();
});

test("filters leads by status when chip clicked", () => {
  render(<LeadList leads={leads} selectedId={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByText("Interested"));
  expect(screen.getByText("Alice Smith")).toBeInTheDocument();
  expect(screen.queryByText("Bob Jones")).not.toBeInTheDocument();
  expect(screen.queryByText("Carol Wu")).not.toBeInTheDocument();
});

test("calls onSelect with lead id when row clicked", () => {
  const onSelect = vi.fn();
  render(<LeadList leads={leads} selectedId={null} onSelect={onSelect} />);
  fireEvent.click(screen.getByText("Bob Jones"));
  expect(onSelect).toHaveBeenCalledWith("2");
});

test("shows empty message when no leads match filter", () => {
  render(<LeadList leads={leads} selectedId={null} onSelect={() => {}} />);
  fireEvent.click(screen.getByText("Convertible"));
  expect(screen.getByText("No conversations match this filter.")).toBeInTheDocument();
});
