/** Fields that hold phone numbers ("; "-separated when there are several). */
export const PHONE_KEYS = ["mobilePhones", "officePhones", "faxNumbers", "otherPhones", "whatsapp"] as const;
export const PHONE_KEY_SET = new Set<string>(PHONE_KEYS);

/**
 * "+91 98450 12345; +1 415 555 0100" -> "(+91) 98450 12345; (+1) 415 555 0100".
 * A cell starting with "+" is read as a formula by Google Sheets / Excel (#ERROR!), so the country code is
 * wrapped in brackets. Only a code followed by a separator is touched, and already-bracketed values are left
 * alone, so this is safe to run repeatedly. Same rule as the SQL migration in db/schema.sql.
 */
export function bracketCountryCode(value: string): string {
  return value.replace(/(^|;\s*)\+\s*(\d{1,4})(?=[\s\-.(])[\s\-.]*/g, "$1(+$2) ");
}
