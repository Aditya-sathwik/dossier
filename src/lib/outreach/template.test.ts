import { describe, expect, it } from "vitest";
import { interpolateTemplate } from "./template";

describe("interpolateTemplate", () => {
  it("interpolates double curly braces variables correctly in legacy two-name pattern", () => {
    const template = "Hi {{name}}, applying for {{role}} at {{company}}. Best, {{my_name}}";
    const result = interpolateTemplate(template, {
      name: "Gopi",
      role: "Frontend Engineer",
      company: "Tessolve",
      myName: "Aditya",
    });
    expect(result).toBe("Hi Gopi, applying for Frontend Engineer at Tessolve. Best, Aditya");
  });

  it("interpolates single curly brace variables and handles whitespace", () => {
    const template = "Dear { name }, I am interested in {  role } at {company}. - {my_name}";
    const result = interpolateTemplate(template, {
      name: "HR",
      role: "Backend Dev",
      company: "Stripe",
      myName: "Jane",
    });
    expect(result).toBe("Dear HR, I am interested in Backend Dev at Stripe. - Jane");
  });

  it("handles contactPerson and name correctly without collision", () => {
    const template = "Hi {{contactPerson}},\nReaching out for {{role}} at {{company}}.\n\nThanks,\n{{name}}";
    const result = interpolateTemplate(template, {
      contactPerson: "Rahul",
      company: "Stripe",
      role: "Full-Stack Engineer",
      name: "Aditya",
    });
    expect(result).toBe("Hi Rahul,\nReaching out for Full-Stack Engineer at Stripe.\n\nThanks,\nAditya");
  });

  it("falls back to team name when contactPerson is missing or generic", () => {
    const template = "Hi {{contactPerson}},\nReaching out to {{company}}.\n\nThanks,\n{{name}}";
    const resultWithNoContact = interpolateTemplate(template, {
      company: "Stripe",
      name: "Aditya",
    });
    expect(resultWithNoContact).toBe("Hi Stripe team,\nReaching out to Stripe.\n\nThanks,\nAditya");

    const resultWithHiringManager = interpolateTemplate(template, {
      company: "Stripe",
      contactPerson: "Hiring Manager",
      name: "Aditya",
    });
    expect(resultWithHiringManager).toBe("Hi Stripe team,\nReaching out to Stripe.\n\nThanks,\nAditya");
  });

  it("falls back to 'Hi there,' when both company and contactPerson are empty", () => {
    const template = "Hi {{contactPerson}},\nReaching out for {{role}} at {{company}}.\n\nThanks,\n{{name}}";
    const result = interpolateTemplate(template, {
      name: "Aditya",
    });
    expect(result).toBe("Hi there,\nReaching out for Full-Stack Engineer at your team.\n\nThanks,\nAditya");
  });

  it("applies friendly fallbacks when fields are missing or empty in legacy format", () => {
    const template = "Hi {{name}}, regarding the {{role}} opening at {{company}}.";
    const result = interpolateTemplate(template, {});
    expect(result).toBe("Hi Hiring Team, regarding the Full-Stack Engineer opening at your team.");
  });

  it("handles empty or blank text gracefully", () => {
    expect(interpolateTemplate("", { company: "Google" })).toBe("");
  });
});
