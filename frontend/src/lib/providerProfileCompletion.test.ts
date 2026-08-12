import { describe, expect, it } from 'vitest';
import { evaluateProviderCoreSections } from './providerProfileCompletion';
import type { Provider } from '@/types';

const completeDocs = {
  idDoc: { url: 'https://example.com/id.pdf' },
  companyReg: { url: 'https://example.com/reg.pdf' },
  proofOfAddress: { url: 'https://example.com/addr.pdf' },
} as Provider['documents'];

const baseLocal = {
  phone: '0820000000',
  bio: 'Experienced tiler with more than twenty characters.',
  serviceAreas: ['Cape Town'],
  selectedSkills: ['Plumbing'],
  pricing: {
    Plumbing: { jobFeeLow: 500, jobFeeHigh: 1500 },
  },
  settings: {
    businessHours: {
      monday: { enabled: true, open: '08:00', close: '17:00' },
    },
  } as Provider['settings'],
};

describe('evaluateProviderCoreSections payout', () => {
  it('is 80% at 4/5 without payout, 100% with hasPayoutProfile', () => {
    const without = evaluateProviderCoreSections(
      { documents: completeDocs } as Provider,
      { ...baseLocal, hasPayoutProfile: false }
    );
    expect(without.payoutBanking).toBe(false);
    expect(without.percentCore).toBe(80);

    const withPayout = evaluateProviderCoreSections(
      { documents: completeDocs } as Provider,
      { ...baseLocal, hasPayoutProfile: true }
    );
    expect(withPayout.payoutBanking).toBe(true);
    expect(withPayout.percentCore).toBe(100);
  });

  it('counts one section (20%) when only payout is done', () => {
    const onlyPayout = evaluateProviderCoreSections(null, {
      phone: '',
      bio: '',
      serviceAreas: [],
      selectedSkills: [],
      pricing: {},
      hasPayoutProfile: true,
    });
    expect(onlyPayout.payoutBanking).toBe(true);
    expect(onlyPayout.percentCore).toBe(20);
  });
});
