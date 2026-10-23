export interface RequestUserContext {
  userId: string;
  role?: string;
}

export function extractUserIdFromContext(req: { user?: RequestUserContext }): string {
  if (!req || !req.user || !req.user.userId) {
    throw new Error('Unauthorized request: User context missing');
  }
  return req.user.userId;
}
