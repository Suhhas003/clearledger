/**
 * ClearLedger Virtual IBAN Utility
 *
 * Implements ISO 13616 structure and ISO 7064 MOD-97-10 checksum validation
 * for educational virtual banking account identifiers.
 *
 * Virtual IBAN Structure for ClearLedger:
 * - Country Code: 2 letters (Default: 'GB')
 * - Check Digits: 2 numeric digits (02-98 calculated via MOD-97-10)
 * - Bank Identifier: 4 letters ('CLRG' for ClearLedger)
 * - Sort / Branch Code: 6 numeric digits (Default: '040004')
 * - Account Number: 8 numeric digits
 * Total: 22 characters
 *
 * Example: GB29CLRG04000412345678
 */

export const CLEARLEDGER_BANK_CODE = 'CLRG';
export const DEFAULT_COUNTRY_CODE = 'GB';
export const DEFAULT_SORT_CODE = '040004';

export interface GenerateVirtualIBANOptions {
  countryCode?: string;
  sortCode?: string;
  accountNumber: string | number;
}

/**
 * Normalizes an IBAN by removing whitespace and uppercase formatting.
 */
export function normalizeIBAN(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase();
}

/**
 * Formats an IBAN with 4-character blocks for readability.
 * e.g. "GB29CLRG04000412345678" -> "GB29 CLRG 0400 0412 3456 78"
 */
export function formatIBAN(iban: string): string {
  const clean = normalizeIBAN(iban);
  const chunks = clean.match(/.{1,4}/g);
  return chunks ? chunks.join(' ') : clean;
}

/**
 * Converts alphanumeric characters to their numeric MOD-97 representation.
 * Letters A-Z map to 10-35. Digits 0-9 remain as-is.
 */
function toNumericString(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 'A'-'Z' (65 - 90) -> 10 - 35
    if (code >= 65 && code <= 90) {
      result += (code - 55).toString();
    } else if (code >= 48 && code <= 57) {
      // '0'-'9'
      result += str[i];
    } else {
      throw new Error(`Invalid character in IBAN string: ${str[i]}`);
    }
  }
  return result;
}

/**
 * Computes the MOD-97 checksum of a large numeric string using BigInt.
 */
function mod97(numericStr: string): number {
  return Number(BigInt(numericStr) % BigInt(97));
}

/**
 * Calculates the 2-digit MOD-97-10 check digits for a given Country Code and BBAN.
 */
export function calculateCheckDigits(countryCode: string, bban: string): string {
  const normalizedCountry = countryCode.trim().toUpperCase();
  const normalizedBBAN = bban.replace(/\s+/g, '').toUpperCase();

  if (normalizedCountry.length !== 2) {
    throw new Error(`Country code must be exactly 2 letters, received '${countryCode}'`);
  }

  // ISO 7064: Append country code and '00' to BBAN
  const rearranged = normalizedBBAN + normalizedCountry + '00';
  const numericString = toNumericString(rearranged);
  const remainder = mod97(numericString);
  const checkValue = 98 - remainder;

  return checkValue.toString().padStart(2, '0');
}

/**
 * Validates any IBAN string using the ISO 7064 MOD-97-10 algorithm.
 * Returns true if valid, false otherwise.
 */
export function isValidIBAN(iban: string): boolean {
  if (!iban || typeof iban !== 'string') return false;

  const clean = normalizeIBAN(iban);

  // ClearLedger virtual IBAN standard length check (22 characters)
  // General minimum IBAN is 15 chars, maximum 34 chars.
  if (clean.length < 15 || clean.length > 34) return false;

  // Basic regex: 2 letters, 2 digits, followed by alphanumeric BBAN
  const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
  if (!ibanRegex.test(clean)) return false;

  try {
    // ISO 7064 verification: Move first 4 characters to the end
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    const numericString = toNumericString(rearranged);
    return mod97(numericString) === 1;
  } catch {
    return false;
  }
}

/**
 * Validates specifically that an IBAN is a ClearLedger Virtual IBAN.
 */
export function isValidClearLedgerIBAN(iban: string): boolean {
  const clean = normalizeIBAN(iban);
  if (clean.length !== 22) return false;
  if (!clean.startsWith('GB')) return false;
  if (clean.slice(4, 8) !== CLEARLEDGER_BANK_CODE) return false;

  return isValidIBAN(clean);
}

/**
 * Generates a deterministic or parameterized ClearLedger Virtual IBAN.
 *
 * @param options Account number and optional country/sort code
 * @returns Complete 22-character Virtual IBAN (e.g. "GB29CLRG04000412345678")
 */
export function generateVirtualIBAN(options: GenerateVirtualIBANOptions): string {
  const countryCode = (options.countryCode || DEFAULT_COUNTRY_CODE).toUpperCase();
  const sortCode = options.sortCode || DEFAULT_SORT_CODE;

  // Account number must be zero-padded to 8 digits
  const rawAcc = String(options.accountNumber).replace(/\D/g, '');
  if (!rawAcc) {
    throw new Error('Valid numeric account number is required');
  }
  const accountNumberPadded = rawAcc.padStart(8, '0').slice(-8);

  // BBAN for ClearLedger: CLRG (4) + sortCode (6) + accountNumber (8) = 18 chars
  const bban = `${CLEARLEDGER_BANK_CODE}${sortCode}${accountNumberPadded}`;

  // Calculate MOD-97-10 check digits
  const checkDigits = calculateCheckDigits(countryCode, bban);

  return `${countryCode}${checkDigits}${bban}`;
}
