export type Role = 'admin' | 'atendente';

export interface AuthUser {
  id: string;
  businessId: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface UserRow {
  id: string;
  business_id: string;
  name: string;
  username: string;
  password_hash: string;
  role: Role;
  is_active: number;
  must_change_password: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
  };
}

export function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    isActive: row.is_active === 1,
    mustChangePassword: row.must_change_password === 1,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}
