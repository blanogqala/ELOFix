import type { Category, Job, Measurements } from '@/types';



export type JobCategoryStep3Type = Category['step3Type'];



/** Merged view of customer + provider-adjusted measurement payload. */

export function mergeJobMeasurementPayload(job: Job): Partial<Measurements> {

  return {

    ...(job.measurements && typeof job.measurements === 'object' ? job.measurements : {}),

    ...(job.providerAdjustedRequirements?.measurements &&

    typeof job.providerAdjustedRequirements.measurements === 'object'

      ? job.providerAdjustedRequirements.measurements

      : {}),

  };

}



export function measurementsHaveStructuredSpecs(m: Partial<Measurements> | null | undefined): boolean {

  if (!m || typeof m !== 'object') return false;



  const values = m.values;

  const hasValues =

    values &&

    typeof values === 'object' &&

    !Array.isArray(values) &&

    Object.keys(values as Record<string, unknown>).length > 0;

  const hasMovingItems = Array.isArray(m.movingItems) && m.movingItems.length > 0;

  const pi = m.plumbingIssue;

  const hasIssue =

    pi &&

    typeof pi === 'object' &&

    (String(pi.type || '').trim().length > 0 || String(pi.description || '').trim().length > 0);

  const hasCameraAssist = Boolean(m.cameraAssist && typeof m.cameraAssist === 'object');



  return Boolean(hasValues || hasMovingItems || hasIssue || hasCameraAssist);

}



export function getJobCategoryStep3Type(job: Job): JobCategoryStep3Type {

  const t = job.categoryStep3Type;

  if (t === 'items' || t === 'issue' || t === 'measurements' || t === 'none') return t;

  return 'measurements';

}



export function categoryUsesMeasurementFields(step3: JobCategoryStep3Type): boolean {

  return step3 === 'measurements';

}



/** Category has no step-3 measurements / items / issue UI or specs gate. */

export function categorySkipsStep3Specs(step3: JobCategoryStep3Type): boolean {

  return step3 === 'none';

}



/** Provider may mark inspection / submit price only when specs match category rules (mirrors backend). */

export function jobWorkflowSpecsCompleteForProvider(job: Job): boolean {

  const step3 = getJobCategoryStep3Type(job);

  if (categorySkipsStep3Specs(step3)) {

    return true;

  }

  const merged = mergeJobMeasurementPayload(job);

  if (step3 === 'measurements') {

    return measurementsHaveStructuredSpecs(merged);

  }

  if (job.providerAdjustedRequirements?.requirementText?.trim()) {

    return true;

  }

  return measurementsHaveStructuredSpecs(merged);

}


