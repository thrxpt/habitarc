export type Role = "participant" | "program-manager";

export interface Identity {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
}

export const isRole = (value: unknown): value is Role =>
  value === "participant" || value === "program-manager";

export const isAccountTimezone = (value: unknown): value is string => {
  if (typeof value !== "string" || (value !== "UTC" && !value.includes("/"))) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
};
