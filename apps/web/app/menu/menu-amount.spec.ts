import { describe, expect, it } from 'vitest';
import {
  basisPointsToPercentLabel,
  catalogView,
  centavosToLabel,
  InvalidMenuAmountError,
  percentToBasisPoints,
  pesosToCentavos,
} from './menu-amount';

describe('menu amount presentation', () => {
  it('labels 4500 centavos as $45.00 (A1)', () => {
    expect(centavosToLabel(4500)).toBe('$45.00');
  });

  it('labels 5 and 0 centavos (A2)', () => {
    expect(centavosToLabel(5)).toBe('$0.05');
    expect(centavosToLabel(0)).toBe('$0.00');
  });

  it('converts peso text to centavos with integer parts (A3)', () => {
    expect(pesosToCentavos('45')).toBe(4500);
    expect(pesosToCentavos('45.5')).toBe(4550);
    expect(pesosToCentavos('45.50')).toBe(4550);
    expect(pesosToCentavos(' 45.50 ')).toBe(4550);
    expect(pesosToCentavos('0.05')).toBe(5);
  });

  it('rejects peso text that is not one or two decimal places (A4)', () => {
    for (const input of ['', '45.505', '-1', '45,50', '45.', '45 MXN', 'MXN45']) {
      let produced: number | undefined;
      expect(() => {
        produced = pesosToCentavos(input);
      }).toThrow(InvalidMenuAmountError);
      expect(produced).toBeUndefined();
    }
  });

  it('labels 1600 basis points as 16.00 % (A5)', () => {
    expect(basisPointsToPercentLabel(1600)).toBe('16.00 %');
  });

  it('converts percent text to basis points (A6)', () => {
    expect(percentToBasisPoints('16')).toBe(1600);
    expect(percentToBasisPoints('16.5')).toBe(1650);
    expect(percentToBasisPoints('0')).toBe(0);
  });

  it('maps catalog status to a view (A7)', () => {
    expect(catalogView({ kind: 'loading' })).toBe('loading');
    expect(catalogView({ kind: 'error' })).toBe('error');
    expect(catalogView({ kind: 'ready', items: [] })).toBe('empty');
    expect(catalogView({ kind: 'ready', items: [{ name: 'Tacos de suadero' }] })).toBe('list');
  });
});
