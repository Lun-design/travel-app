export const PUPPY_IDS = ['-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11'] as const;
export type PuppyId = (typeof PUPPY_IDS)[number];

export function isPuppyId(value: string): value is PuppyId {
  return (PUPPY_IDS as readonly string[]).includes(value);
}
