import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { FIELD_KEYS, type ContactData, type FieldKey } from "@/lib/fields";
import { bracketCountryCode } from "@/lib/phone";

const LIST_FIELDS = new Set(["emails", "mobilePhones", "officePhones", "faxNumbers", "otherPhones", "otherSocials"]);
const PHONE_FIELDS = new Set(["mobilePhones", "officePhones", "faxNumbers", "otherPhones"]);
const KNOWN = new Set<string>(FIELD_KEYS);

function formatPhone(p: string) {
  const country = (process.env.DEFAULT_PHONE_COUNTRY || undefined) as CountryCode | undefined;
  const ext = p.match(/(?:ext\.?|x)\s*(\d+)\s*$/i)?.[1];
  // Accept already-bracketed input like "(+91) 98450 12345".
  const parsed = parsePhoneNumberFromString(p.replace(/^\s*\(\s*\+\s*(\d{1,4})\s*\)/, "+$1"), country);
  if (parsed && parsed.isPossible()) {
    const intl = parsed.formatInternational();
    return bracketCountryCode(ext && !parsed.ext ? `${intl} ext. ${ext}` : intl);
  }
  return bracketCountryCode(p.trim());
}

/** Formats a "; "-separated list of phone numbers, e.g. "(+91) 98450 12345; (+91) 80 4123 4567". */
export function formatPhoneList(value: string): string {
  // Only plain phone numbers are reformatted (WhatsApp may hold a wa.me link instead).
  return value
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map((p) => (/^[\s\d+()\-.]+(?:(?:ext\.?|x)\s*\d+)?$/i.test(p) ? formatPhone(p) : p))
    .join("; ");
}

function str(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join("; ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v).replace(/\s+/g, " ").trim();
}

export function normalizeContact(c: Record<string, unknown>): ContactData {
  const out: ContactData = {};
  const extras: string[] = [];
  for (const [k, v] of Object.entries(c)) {
    if (!KNOWN.has(k)) {
      // Unknown keys from the model are kept, not lost.
      const s = str(v);
      if (s) extras.push(`${k}: ${s}`);
      continue;
    }
    if (LIST_FIELDS.has(k)) {
      let items = (Array.isArray(v) ? v : [v]).map(str).filter(Boolean);
      if (k === "emails") items = items.map((e) => e.replace(/^mailto:/i, "").replace(/\s/g, "").toLowerCase());
      if (PHONE_FIELDS.has(k)) items = items.map(formatPhone);
      out[k as FieldKey] = [...new Set(items)].join("; ");
    } else {
      out[k as FieldKey] = k === "whatsapp" ? formatPhoneList(str(v)) : str(v);
    }
  }
  if (extras.length) out.otherInfo = [out.otherInfo, ...extras].filter(Boolean).join("; ");
  if (!out.fullName && (out.firstName || out.lastName)) {
    out.fullName = [out.prefix, out.firstName, out.middleName, out.lastName, out.suffix].filter(Boolean).join(" ");
  }
  for (const k of Object.keys(out) as FieldKey[]) if (!out[k]) delete out[k];
  return out;
}

/** Keys used to spot the same person scanned twice (emails and phone numbers). */
export function identityKeys(d: ContactData): string[] {
  const keys: string[] = [];
  for (const e of (d.emails ?? "").split(";")) if (e.trim()) keys.push("e:" + e.trim().toLowerCase());
  for (const f of ["mobilePhones", "officePhones"] as const)
    for (const p of (d[f] ?? "").split(";")) {
      const digits = p.replace(/ext.*$/i, "").replace(/\D/g, "");
      if (digits.length >= 7) keys.push("p:" + digits.slice(-10));
    }
  return keys;
}
