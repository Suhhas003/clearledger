import { describe, it, expect } from 'vitest';
import {
  generateVirtualIBAN,
  isValidIBAN,
  isValidClearLedgerIBAN,
  calculateCheckDigits,
  formatIBAN,
  normalizeIBAN,
  CLEARLEDGER_BANK_CODE,
} from '../lib/iban';

describe('ClearLedger Virtual IBAN (MOD-97-10)', () => {
  describe('calculateCheckDigits and isValidIBAN', () => {
    it('correctly calculates check digits and validates known MOD-97 standard IBAN', () => {
      // Test known valid standard IBAN structure
      // Example BBAN: CLRG 040004 00000001
      const countryCode = 'GB';
      const bban = 'CLRG04000400000001';
      const checkDigits = calculateCheckDigits(countryCode, bban);

      const iban = `${countryCode}${checkDigits}${bban}`;
      expect(isValidIBAN(iban)).toBe(true);
    });

    it('rejects an IBAN with an invalid check digit', () => {
      const countryCode = 'GB';
      const bban = 'CLRG04000412345678';
      const validCheck = calculateCheckDigits(countryCode, bban);
      const validIban = `${countryCode}${validCheck}${bban}`;

      // Corrupt the check digits by altering the value
      const corruptDigit = validCheck === '02' ? '03' : '02';
      const invalidIban = `${countryCode}${corruptDigit}${bban}`;

      expect(isValidIBAN(validIban)).toBe(true);
      expect(isValidIBAN(invalidIban)).toBe(false);
    });

    it('rejects an IBAN when account digits are transposed or modified', () => {
      const iban = generateVirtualIBAN({ accountNumber: '12345678' });
      expect(isValidIBAN(iban)).toBe(true);

      // Mutate the last digit
      const mutated = iban.slice(0, -1) + (iban.slice(-1) === '9' ? '8' : '9');
      expect(isValidIBAN(mutated)).toBe(false);
    });

    it('rejects invalid characters, empty strings, and malformed lengths', () => {
      expect(isValidIBAN('')).toBe(false);
      expect(isValidIBAN('GB00CLRG')).toBe(false);
      expect(isValidIBAN('GB99CLRG04000412345678!@#')).toBe(false);
    });
  });

  describe('generateVirtualIBAN and Round Trip Validation', () => {
    it('performs generation and validation round trip for various account numbers', () => {
      const testAccountNumbers = [
        '1',
        '42',
        '12345678',
        '99999999',
        '00012345',
        10002000,
      ];

      for (const acc of testAccountNumbers) {
        const generated = generateVirtualIBAN({ accountNumber: acc });

        // Must be exactly 22 characters
        expect(generated.length).toBe(22);
        // Must start with GB
        expect(generated.startsWith('GB')).toBe(true);
        // Must contain CLRG bank code at index 4..8
        expect(generated.slice(4, 8)).toBe(CLEARLEDGER_BANK_CODE);

        // Must pass standard MOD-97-10 check
        expect(isValidIBAN(generated)).toBe(true);

        // Must pass ClearLedger virtual IBAN validation
        expect(isValidClearLedgerIBAN(generated)).toBe(true);
      }
    });

    it('generates deterministic virtual IBANs for the same input', () => {
      const iban1 = generateVirtualIBAN({ accountNumber: '55443322' });
      const iban2 = generateVirtualIBAN({ accountNumber: '55443322' });
      expect(iban1).toBe(iban2);
    });
  });

  describe('Formatting and Normalization', () => {
    it('normalizes spaced and lowercase IBANs', () => {
      const iban = generateVirtualIBAN({ accountNumber: '12345678' });
      const spaced = ` ${iban.slice(0, 4)}  ${iban.slice(4, 8)} ${iban.slice(8)} `;
      expect(normalizeIBAN(spaced)).toBe(iban);
      expect(isValidIBAN(spaced.toLowerCase())).toBe(true);
    });

    it('formats IBAN into 4-character chunks for human-readable display', () => {
      const iban = generateVirtualIBAN({ accountNumber: '12345678' });
      const formatted = formatIBAN(iban);

      // 22 chars divided into groups of 4: 4 + 4 + 4 + 4 + 4 + 2 = 6 blocks, 5 spaces -> 27 chars
      expect(formatted.length).toBe(27);
      expect(normalizeIBAN(formatted)).toBe(iban);
    });
  });
});
