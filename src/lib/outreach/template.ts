export type TemplateVariables = {
  company?: string;
  role?: string;
  contactPerson?: string;
  name?: string;
  myName?: string;
};

/**
 * Replaces {{company}}, {{role}}, {{contactPerson}}, {{name}}, {{my_name}}
 * in the text with corresponding values or friendly, natural fallbacks.
 *
 * Disambiguates recipient (contactPerson) from sender (name / myName) so that
 * {{name}} in sign-offs always maps to the candidate, never the recipient.
 */
export function interpolateTemplate(text: string, vars: TemplateVariables): string {
  if (!text) return "";

  const company = vars.company?.trim() || "";
  const role = vars.role?.trim() || "Full-Stack Engineer";

  // Check if text is using the new format with {{contactPerson}}
  const hasContactPersonPlaceholder = /\{\{?\s*contactPerson\s*\}?\}/i.test(text);

  if (hasContactPersonPlaceholder) {
    const rawContact = vars.contactPerson?.trim();
    const isGenericContact =
      !rawContact || /^(hiring\s+(manager|team)|team|recruiter|hr)$/i.test(rawContact);
    const senderName = vars.myName?.trim() || vars.name?.trim() || "";

    const teamLabel = company ? `${company} team` : "there";
    const contactName = isGenericContact ? teamLabel : rawContact;

    let result = text;
    if (isGenericContact) {
      result = result.replace(
        /(?:hi|dear|hello)\s+\{\{?\s*contactPerson\s*\}?\},?/gi,
        `Hi ${teamLabel},`,
      );
    }

    return result
      .replace(/\{\{?\s*company\s*\}?\}/gi, company || "your team")
      .replace(/\{\{?\s*role\s*\}?\}/gi, role)
      .replace(/\{\{?\s*contactPerson\s*\}?\}/gi, contactName)
      .replace(/\{\{?\s*(?:my_name|myName|name)\s*\}?\}/gi, senderName);
  }

  // Legacy format where {{name}} was recipient and {{my_name}} was sender
  const legacyRecipient = vars.contactPerson?.trim() || vars.name?.trim() || "Hiring Team";
  const legacySender = vars.myName?.trim() || "";

  return text
    .replace(/\{\{?\s*company\s*\}?\}/gi, company || "your team")
    .replace(/\{\{?\s*role\s*\}?\}/gi, role)
    .replace(/\{\{?\s*name\s*\}?\}/gi, legacyRecipient)
    .replace(/\{\{?\s*(?:my_name|myName)\s*\}?\}/gi, legacySender);
}
