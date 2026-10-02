/** Checkout identity stays the selected branch. Marketplace category is discovery only. */
export function shouldClearBranchCart(input: {
  cartCount: number;
  previousCategoryId?: string | null;
  nextCategoryId?: string | null;
  previousBranchId?: string | null;
  nextBranchId?: string | null;
}): boolean {
  if (input.cartCount <= 0) return false;
  if (
    input.previousCategoryId &&
    input.nextCategoryId &&
    input.previousCategoryId !== input.nextCategoryId
  ) {
    return true;
  }
  if (
    input.previousBranchId &&
    input.nextBranchId &&
    input.previousBranchId !== input.nextBranchId
  ) {
    return true;
  }
  return false;
}

export function materialOrderBranchIdentity(selected: {
  id: string;
  displayName?: string | null;
  name: string;
}) {
  const storeName = (selected.displayName || selected.name || '').trim() || selected.name;
  return {
    storeId: selected.id,
    branchId: selected.id,
    storeName,
  };
}
