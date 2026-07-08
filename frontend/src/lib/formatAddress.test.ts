import { describe, expect, it } from 'vitest';
import { formatDeliveryPointLabel, formatGeoPointLabel } from '@/lib/formatAddress';

describe('formatAddress', () => {
  it('dedupes repeated locality segments in delivery addresses', () => {
    const label = formatDeliveryPointLabel({
      address: '7 Greys Way, Milnerton, South Africa, Milnerton, Milnerton',
      suburb: 'Milnerton',
      area: 'Milnerton',
      city: 'Milnerton',
    });
    expect(label).toBe('7 Greys Way, Milnerton, South Africa');
    expect(label.match(/Milnerton/g)?.length).toBe(1);
  });

  it('includes label once in geo point labels', () => {
    const label = formatGeoPointLabel({
      label: 'ABC Builders - bellville',
      address: 'King william\'s town',
      city: 'Cape Town',
    });
    expect(label).toBe('ABC Builders - bellville, King william\'s town, Cape Town');
  });
});
