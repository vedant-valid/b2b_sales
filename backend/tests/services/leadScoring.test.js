import { jest } from "@jest/globals";
import { scoreLeads } from "../../services/leadScoring.js";

const mockLeads = [
  { id: "lead-1", firstName: "Alice", lastName: "Smith", title: "CTO", company: "Acme AI", location: "India", seniority: "director" },
  { id: "lead-2", firstName: "Bob", lastName: "Jones", title: "IT Manager", company: "Corp", location: "India", seniority: "manager" }
];

describe("scoreLeads", () => {
  test("returns score and bullets for each lead", async () => {
    const generate = jest.fn().mockResolvedValue([
      { leadId: "lead-1", score: 85, bullets: ["Senior engineering title", "AI startup", "India market", "No significant gaps"] },
      { leadId: "lead-2", score: 38, bullets: ["IT role, not engineering leadership", "Large corp, not startup", "India market", "Title mismatch with goal"] }
    ]);

    const result = await scoreLeads("Find CTOs at AI startups in India", mockLeads, { generate });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      leadId: "lead-1",
      score: 85,
      bullets: ["Senior engineering title", "AI startup", "India market", "No significant gaps"]
    });
    expect(result[1].score).toBe(38);
    expect(result[1].bullets).toHaveLength(4);
  });

  test("returns empty array when Gemini returns non-array", async () => {
    const generate = jest.fn().mockResolvedValue("not an array");

    const result = await scoreLeads("Find CTOs", mockLeads, { generate });

    expect(result).toEqual([]);
  });

  test("returns empty array when Gemini throws", async () => {
    const generate = jest.fn().mockRejectedValue(new Error("API unavailable"));

    const result = await scoreLeads("Find CTOs", mockLeads, { generate });

    expect(result).toEqual([]);
  });

  test("filters out malformed entries missing required fields", async () => {
    const generate = jest.fn().mockResolvedValue([
      { leadId: "lead-1", score: 85, bullets: ["Good title", "Good company", "India", "No gaps"] },
      { score: 70, bullets: ["Missing leadId"] },
      { leadId: "lead-2", bullets: ["Missing score"] },
      { leadId: "lead-2", score: "not-a-number", bullets: ["Bad score type"] }
    ]);

    const result = await scoreLeads("Find CTOs", mockLeads, { generate });

    expect(result).toHaveLength(1);
    expect(result[0].leadId).toBe("lead-1");
  });

  test("passes rawGoal and compact lead summaries to Gemini", async () => {
    const generate = jest.fn().mockResolvedValue([]);

    await scoreLeads("Find VP Engineers at fintech", mockLeads, { generate });

    expect(generate).toHaveBeenCalledTimes(1);
    const calledPrompt = generate.mock.calls[0][0];
    expect(calledPrompt).toContain("Find VP Engineers at fintech");
    expect(calledPrompt).toContain("lead-1");
    expect(calledPrompt).toContain("CTO");
  });
});
