import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '@/api/client';

const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));

vi.mock('@/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/api/client')>('@/api/client');
  return {
    ...actual,
    default: {
      delete: deleteMock,
    },
  };
});

import {
  CategoryInUseError,
  deleteAdminMarketplaceMaterialCategory,
} from './marketplaceMaterialCategories';

describe('deleteAdminMarketplaceMaterialCategory', () => {
  beforeEach(() => {
    deleteMock.mockReset();
  });

  it('opens the in-use confirmation when the client rejects a 409 ApiHttpError', async () => {
    deleteMock.mockRejectedValue(
      new ApiHttpError('This category is assigned to 2 suppliers. Confirm to delete it.', 409, {
        success: false,
        code: 'CATEGORY_IN_USE',
        message: 'This category is assigned to 2 suppliers. Confirm to delete it.',
        supplierCount: 2,
      })
    );

    await expect(deleteAdminMarketplaceMaterialCategory('cat-1', false)).rejects.toMatchObject({
      name: 'CategoryInUseError',
      supplierCount: 2,
      message: 'This category is assigned to 2 suppliers. Confirm to delete it.',
    });
    await expect(deleteAdminMarketplaceMaterialCategory('cat-1', false)).rejects.toBeInstanceOf(CategoryInUseError);
  });

  it('still recognizes a raw axios 409 response', async () => {
    deleteMock.mockRejectedValue({
      response: {
        status: 409,
        data: { message: 'Assigned', supplierCount: 1 },
      },
    });

    await expect(deleteAdminMarketplaceMaterialCategory('cat-1')).rejects.toMatchObject({
      supplierCount: 1,
      message: 'Assigned',
    });
  });

  it('does not treat other failures as category-in-use', async () => {
    deleteMock.mockRejectedValue(new ApiHttpError('Something went wrong', 500, { message: 'nope' }));

    await expect(deleteAdminMarketplaceMaterialCategory('cat-1', true)).rejects.toThrow('Something went wrong');
    await expect(deleteAdminMarketplaceMaterialCategory('cat-1', true)).rejects.not.toBeInstanceOf(CategoryInUseError);
  });
});
