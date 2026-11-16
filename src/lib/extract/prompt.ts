export const EXTRACTION_PROMPT = `You are an expert business-card OCR and data-extraction system.

The image shows one or more business cards (possibly front and back, rotated, photographed at an angle, or in any language).
Extract EVERY piece of information printed on each distinct person's card. Return one contact object per distinct person.
If the front and back of the same card are visible, merge them into ONE contact.

Rules:
- Copy text exactly as printed (keep original spelling, accents and capitalisation of names). Do not invent or guess data that is not visible.
- Put every email address in "emails", and every phone number in the correct phone list (mobile/cell/M -> mobilePhones; tel/office/direct/T/landline -> officePhones; fax/F -> faxNumbers; unclear -> otherPhones). Keep country codes and extensions.
- "website": the company/personal website (not social links).
- Split the address into components AND give the complete address in "fullAddress". Fill "country" only if printed or clearly implied (e.g. by state, postal code format or phone country code).
- Social handles/URLs go into the matching field; anything else (Skype, Telegram, Line, GitHub, etc.) goes into "otherSocials" as "Network: handle".
- "tagline": company slogan, list of services/products, certifications or similar marketing text.
- "otherInfo": any remaining printed text not captured elsewhere (e.g. GST/VAT/registration numbers, branch names, QR code captions, notes).
- "language": main language of the card (e.g. "English", "Japanese").
- If the name is in a non-Latin script and a Latin transliteration is also printed, put the Latin version in the name fields and the original in otherInfo.
- If the image contains no business card, return {"contacts": []}.

Return ONLY JSON of the form:
{"contacts":[{"fullName":"","prefix":"","firstName":"","middleName":"","lastName":"","suffix":"","jobTitle":"","department":"","company":"","tagline":"","emails":[],"mobilePhones":[],"officePhones":[],"faxNumbers":[],"otherPhones":[],"website":"","fullAddress":"","streetAddress":"","city":"","state":"","postalCode":"","country":"","linkedin":"","twitter":"","instagram":"","facebook":"","whatsapp":"","wechat":"","otherSocials":[],"otherInfo":"","language":""}]}
Use "" or [] for anything not present.`;

const S = { type: "string" };
const A = { type: "array", items: { type: "string" } };

/** Standard JSON Schema for the model's structured output. */
export const CONTACTS_JSON_SCHEMA = {
  type: "object",
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          fullName: S, prefix: S, firstName: S, middleName: S, lastName: S, suffix: S,
          jobTitle: S, department: S, company: S, tagline: S,
          emails: A, mobilePhones: A, officePhones: A, faxNumbers: A, otherPhones: A,
          website: S, fullAddress: S, streetAddress: S, city: S, state: S, postalCode: S, country: S,
          linkedin: S, twitter: S, instagram: S, facebook: S, whatsapp: S, wechat: S, otherSocials: A,
          otherInfo: S, language: S,
        },
      },
    },
  },
  required: ["contacts"],
};
