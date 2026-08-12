import type { Category, CategoryPaymentMode } from '@/types';

export type CategoryFormState = {
  name: string;
  icon: string;
  description: string;
  requiresMaterials: boolean;
  requiresInspection: boolean;
  paymentMode: CategoryPaymentMode;
  skillsCsv: string;
  step3Type: Category['step3Type'];
  issueTypesCsv: string;
  sortOrder: number;
};

export const EMPTY_CATEGORY_FORM: CategoryFormState = {
  name: '',
  icon: '',
  description: '',
  requiresMaterials: false,
  requiresInspection: true,
  paymentMode: 'TWO_PAYMENT_50_50',
  skillsCsv: '',
  step3Type: 'measurements',
  issueTypesCsv: '',
  sortOrder: 0,
};

export const PAYMENT_MODE_OPTIONS: {
  value: CategoryPaymentMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'TWO_PAYMENT_50_50',
    label: '50% Deposit + 50% Completion',
    description:
      'Customer pays 50% before the provider starts and the remaining 50% after completion.',
  },
  {
    value: 'SINGLE_PAYMENT_UPFRONT',
    label: '100% Payment Upfront',
    description: 'Customer pays the full amount before the service starts.',
  },
  {
    value: 'SINGLE_PAYMENT_ON_COMPLETION',
    label: '100% Payment After Completion',
    description: 'Customer pays the full amount after the provider completes the service.',
  },
];

export function categoryToForm(category: Category): CategoryFormState {
  return {
    name: category.name,
    icon: category.icon,
    description: category.description,
    requiresMaterials: category.requiresMaterials,
    requiresInspection: category.requiresInspection !== false,
    paymentMode: category.paymentMode || 'TWO_PAYMENT_50_50',
    skillsCsv: (category.skills || []).join(', '),
    step3Type: category.step3Type,
    issueTypesCsv: (category.issueTypes || []).join(', '),
    sortOrder: category.sortOrder || 0,
  };
}

export function parseSkillsCsv(skillsCsv: string): string[] {
  return skillsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
