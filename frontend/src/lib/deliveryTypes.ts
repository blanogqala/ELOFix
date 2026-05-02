/** Maps API `deliveryType` to product terminology (single source for UI copy). */
export type CanonicalDeliveryType = 'pickup' | 'provider_delivery' | 'supplier_delivery';

export function toCanonicalDeliveryType(
  deliveryType: string | undefined | null
): CanonicalDeliveryType {
  const d = String(deliveryType || 'SELF').toUpperCase();
  if (d === 'SELF') return 'pickup';
  if (d === 'DELIVERY_PROVIDER') return 'provider_delivery';
  return 'supplier_delivery';
}

export function canonicalDeliveryLabel(t: CanonicalDeliveryType): string {
  if (t === 'pickup') return 'Pickup';
  if (t === 'provider_delivery') return 'Courier delivery';
  return 'Store delivery';
}
