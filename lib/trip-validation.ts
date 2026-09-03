export function validateTripCreator(createdBy: string, authUserId: string) {
  if (!authUserId || createdBy !== authUserId) throw new Error('created_by 必須與目前登入使用者一致');
  return true;
}
