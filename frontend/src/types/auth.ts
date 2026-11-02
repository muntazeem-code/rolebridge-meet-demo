
export type RoleName = "super_admin" | "vp" | "panelist" | "reviewer" | "customer";

export interface Role {
  id: string;
  name: RoleName;
  label: string;
  dashboardPath: string;
}

export interface User {
  id: string;
  fullName: string;
  email: string;
  status: "active" | "pending" | "disabled";
  mustChangePassword: boolean;
  roles: Role[];
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}

export interface CurrentUserResponse {
  success: boolean;
  user: User;
}

export interface MessageResponse {
  success: boolean;
  message: string;
}

export interface AdminRole extends Omit<Role, "id"> {
  _id: string;
}

export interface AdminUser extends Omit<User, "id" | "roles"> {
  _id: string;
  roles: AdminRole[];
}
