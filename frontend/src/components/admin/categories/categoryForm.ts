import type { Category } from '@/types';

export type CategoryFormState = {
  name: string;
  icon: string;
  description: string;
  requiresMaterials: boolean;
  requiresInspection: boolean;
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
  skillsCsv: '',
  step3Type: 'measurements',
  issueTypesCsv: '',
  sortOrder: 0,
};

export function categoryToForm(category: Category): CategoryFormState {
  return {
    name: category.name,
    icon: category.icon,
    description: category.description,
    requiresMaterials: category.requiresMaterials,
    requiresInspection: category.requiresInspection !== false,
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
