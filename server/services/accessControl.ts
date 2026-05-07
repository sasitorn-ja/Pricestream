import { ALL_APP_MENU_KEYS, COMPANY_DASHBOARD_DIVISIONS } from "../../shared/appConfig.js";
import type { AppMenuKey, AuthUser, CompanyCode } from "../handlers/auth.js";
import { HttpError } from "./httpSecurity.js";

export function isAppMenuKey(value: string): value is AppMenuKey {
  return ALL_APP_MENU_KEYS.includes(value as AppMenuKey);
}

export function getAllowedMenusForUser(user: AuthUser) {
  if (user.role === "admin") {
    return [...ALL_APP_MENU_KEYS];
  }

  const requestedMenus = Array.isArray(user.menuPermissions)
    ? user.menuPermissions.filter(isAppMenuKey)
    : [];

  return requestedMenus;
}

export function getAllowedCompaniesForUser(user: AuthUser): CompanyCode[] {
  if (user.role === "admin") {
    return ["CPAC", "QMIX"];
  }

  const menus = new Set(getAllowedMenusForUser(user));
  const allowedCompanies: CompanyCode[] = [];

  if (menus.has("dashboard-cpac")) {
    allowedCompanies.push("CPAC");
  }

  if (menus.has("dashboard-qmix")) {
    allowedCompanies.push("QMIX");
  }

  return allowedCompanies;
}

export function resolveAuthorizedCompany(user: AuthUser, requestedCompany: string) {
  const normalizedRequestedCompany = requestedCompany.trim().toUpperCase() as CompanyCode | "";
  const allowedCompanies = getAllowedCompaniesForUser(user);

  if (allowedCompanies.length === 0) {
    throw new HttpError(403, "บัญชีนี้ยังไม่มีสิทธิ์ดู dashboard");
  }

  if (!normalizedRequestedCompany) {
    return allowedCompanies[0];
  }

  if (!allowedCompanies.includes(normalizedRequestedCompany)) {
    throw new HttpError(403, "บัญชีนี้ไม่มีสิทธิ์ดูข้อมูลบริษัทที่เลือก");
  }

  return normalizedRequestedCompany;
}

export function getAllowedDivisionsForCompany(company: CompanyCode) {
  return [...COMPANY_DASHBOARD_DIVISIONS[company]];
}

export function scopeDivisionFiltersToCompany(
  requestedDivisions: string[],
  company: CompanyCode
) {
  const allowedDivisions = getAllowedDivisionsForCompany(company);
  const allowedDivisionSet = new Set(allowedDivisions.map((value) => value.toUpperCase()));
  const normalizedRequestedDivisions = requestedDivisions
    .map((value) => value.trim())
    .filter(Boolean);

  if (normalizedRequestedDivisions.length === 0) {
    return allowedDivisions;
  }

  const scopedDivisions = normalizedRequestedDivisions.filter((division) =>
    allowedDivisionSet.has(division.toUpperCase())
  );

  if (scopedDivisions.length === 0) {
    throw new HttpError(403, "บัญชีนี้ไม่มีสิทธิ์ใช้ filter division ที่เลือก");
  }

  return scopedDivisions;
}
