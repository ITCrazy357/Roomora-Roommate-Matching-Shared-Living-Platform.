import { payosSignature } from './payos-signature.js';

describe('payOS payment-requests signatures', () => {
  it('matches the published webhook signature vector', () => {
    const data = {
      orderCode: 123,
      amount: 3000,
      description: 'VQRIO123',
      accountNumber: '12345678',
      reference: 'TF230204212323',
      transactionDateTime: '2023-02-04 18:25:00',
      currency: 'VND',
      paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
      code: '00',
      desc: 'Thành công',
      counterAccountBankId: '',
      counterAccountBankName: '',
      counterAccountName: '',
      counterAccountNumber: '',
      virtualAccountName: '',
      virtualAccountNumber: '',
    };
    expect(
      payosSignature(
        data,
        '1a54716c8f0efb2744fb28b6e38b25da7f67a925d98bc1c18bd8faaecadd7675',
      ),
    ).toBe('412e915d2871504ed31be63c8f62a149a4410d34c4c42affc9006ef9917eaa03');
  });
  it('normalizes optional fields and sorts object keys within transaction arrays', () => {
    expect(payosSignature({ c: 'null', a: null, b: undefined }, 'test')).toBe(
      payosSignature({ a: '', b: '', c: '' }, 'test'),
    );
    expect(
      payosSignature(
        {
          transactions: [
            { b: 2, a: 1 },
            { b: 4, a: 3 },
          ],
        },
        'test',
      ),
    ).toBe(
      payosSignature(
        {
          transactions: [
            { a: 1, b: 2 },
            { a: 3, b: 4 },
          ],
        },
        'test',
      ),
    );
    expect(
      payosSignature({ transactions: [{ a: 1 }, { a: 2 }] }, 'test'),
    ).not.toBe(payosSignature({ transactions: [{ a: 2 }, { a: 1 }] }, 'test'));
  });
});
