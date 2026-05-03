import { jest } from "@jest/globals";
import { substituteVariables, renderTemplate } from "../../services/templateEngine.js";

const lead = {
  firstName: "Jai",
  lastName: "Nanavati",
  title: "CTO",
  company: "Navana.ai"
};

describe("substituteVariables", () => {
  test("replaces all four lead variables", () => {
    const result = substituteVariables(
      "Hi {{firstName}} {{lastName}}, CTO of {{company}} ({{title}})",
      lead
    );
    expect(result).toBe("Hi Jai Nanavati, CTO of Navana.ai (CTO)");
  });

  test("leaves unknown tags untouched", () => {
    const result = substituteVariables("Hi {{firstName}} {{unknown}}", lead);
    expect(result).toBe("Hi Jai {{unknown}}");
  });

  test("leaves {{aiPersonalization}} untouched", () => {
    const result = substituteVariables("Hi {{firstName}}\n{{aiPersonalization}}", lead);
    expect(result).toBe("Hi Jai\n{{aiPersonalization}}");
  });

  test("handles missing lead field gracefully", () => {
    const result = substituteVariables("Hi {{firstName}}", { firstName: null });
    expect(result).toBe("Hi ");
  });
});

describe("renderTemplate", () => {
  test("substitutes variables and returns subject + body", async () => {
    const { subject, body } = await renderTemplate(
      "Hi {{firstName}}",
      "Join us at {{company}}",
      lead
    );
    expect(subject).toBe("Hi Jai");
    expect(body).toBe("Join us at Navana.ai");
  });

  test("does NOT call generate when {{aiPersonalization}} is absent", async () => {
    const generate = jest.fn();
    await renderTemplate("Subject", "Body text", lead, { generate });
    expect(generate).not.toHaveBeenCalled();
  });

  test("calls generate and substitutes when {{aiPersonalization}} appears in body", async () => {
    const generate = jest.fn().mockResolvedValue("personalised blurb here");
    const { body } = await renderTemplate(
      "Subject",
      "Hi {{firstName}}\n{{aiPersonalization}}",
      lead,
      { generate }
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(body).toBe("Hi Jai\npersonalised blurb here");
  });

  test("calls generate and substitutes when {{aiPersonalization}} appears in subject", async () => {
    const generate = jest.fn().mockResolvedValue("blurb");
    const { subject } = await renderTemplate(
      "{{aiPersonalization}} at {{company}}",
      "Body",
      lead,
      { generate }
    );
    expect(subject).toBe("blurb at Navana.ai");
  });

  test("calls generate only once even when both subject and body contain {{aiPersonalization}}", async () => {
    const generate = jest.fn().mockResolvedValue("blurb");
    const { subject, body } = await renderTemplate(
      "{{aiPersonalization}}",
      "{{aiPersonalization}}",
      lead,
      { generate }
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(subject).toBe("blurb");
    expect(body).toBe("blurb");
  });
});
