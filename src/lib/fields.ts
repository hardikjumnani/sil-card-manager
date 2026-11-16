// Single source of truth for contact columns: used by the table, clipboard copy and Excel/CSV export.

export const CONTACT_FIELDS = [
  { key: "fullName", label: "Full Name", width: 24, default: true },
  { key: "prefix", label: "Prefix", width: 8, default: false },
  { key: "firstName", label: "First Name", width: 16, default: false },
  { key: "middleName", label: "Middle Name", width: 14, default: false },
  { key: "lastName", label: "Last Name", width: 16, default: false },
  { key: "suffix", label: "Suffix / Credentials", width: 14, default: false },
  { key: "jobTitle", label: "Job Title", width: 24, default: true },
  { key: "department", label: "Department", width: 18, default: false },
  { key: "company", label: "Company", width: 24, default: true },
  { key: "tagline", label: "Tagline / Services", width: 30, default: false },
  { key: "emails", label: "Email", width: 30, default: true },
  { key: "mobilePhones", label: "Mobile", width: 18, default: true },
  { key: "officePhones", label: "Office Phone", width: 18, default: true },
  { key: "faxNumbers", label: "Fax", width: 16, default: false },
  { key: "otherPhones", label: "Other Phone", width: 18, default: false },
  { key: "website", label: "Website", width: 24, default: true },
  { key: "fullAddress", label: "Full Address", width: 40, default: false },
  { key: "streetAddress", label: "Street", width: 30, default: false },
  { key: "city", label: "City", width: 16, default: true },
  { key: "state", label: "State / Region", width: 16, default: false },
  { key: "postalCode", label: "Postal Code", width: 12, default: false },
  { key: "country", label: "Country", width: 14, default: true },
  { key: "linkedin", label: "LinkedIn", width: 28, default: false },
  { key: "twitter", label: "X / Twitter", width: 20, default: false },
  { key: "instagram", label: "Instagram", width: 20, default: false },
  { key: "facebook", label: "Facebook", width: 20, default: false },
  { key: "whatsapp", label: "WhatsApp", width: 18, default: false },
  { key: "wechat", label: "WeChat", width: 16, default: false },
  { key: "otherSocials", label: "Other Social / Messaging", width: 28, default: false },
  { key: "otherInfo", label: "Other Info on Card", width: 40, default: false },
  { key: "language", label: "Card Language", width: 12, default: false },
] as const;

export type FieldKey = (typeof CONTACT_FIELDS)[number]["key"];
export type ContactData = Partial<Record<FieldKey, string>>;
export const FIELD_KEYS = CONTACT_FIELDS.map((f) => f.key) as FieldKey[];

/** Columns appended after the extracted fields everywhere data leaves the app. */
export const META_COLUMNS = [
  { key: "addedBy", label: "Added By", width: 22 },
  { key: "addedAt", label: "Added At", width: 20 },
  { key: "duplicate", label: "Possible Duplicate", width: 10 },
] as const;
export type MetaKey = (typeof META_COLUMNS)[number]["key"];

export type ContactRow = {
  id: string;
  data: ContactData;
  addedById: string;
  addedByName: string;
  addedByEmail: string;
  createdAt: string;
  cardImageId: string | null;
  isDuplicate: boolean;
};

export function metaValue(row: ContactRow, key: MetaKey) {
  if (key === "addedBy") return row.addedByName || row.addedByEmail;
  if (key === "addedAt") return new Date(row.createdAt).toLocaleString();
  return row.isDuplicate ? "Yes" : "";
}
