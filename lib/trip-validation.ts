export function validateTripCreator(createdBy: string, authUserId: string) {
  if (!authUserId || createdBy !== authUserId) throw new Error('created_by 必須與目前登入使用者一致');
  return true;
}
export function buildTripPayload<T extends Record<string, unknown>>(input: T, authUserId: string) {
  if (!authUserId) throw new Error('目前沒有有效的登入 session');
  return { ...input, created_by: authUserId };
}
