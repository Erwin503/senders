export type UserRole = 'admin' | 'manager' | 'driver' | 'storekeeper';

export type AuthUser = {
  id: number;
  username: string;
  name: string;
  role: UserRole;
};
