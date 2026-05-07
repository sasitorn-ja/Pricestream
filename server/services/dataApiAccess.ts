import type { CompanyCode, AuthUser } from "../handlers/auth.js";
import {
  resolveAuthorizedCompany,
  scopeDivisionFiltersToCompany
} from "./accessControl.js";

type BaseFilterInput = {
  company?: string;
  divisions?: string[];
  segments?: string[];
  channels?: string[];
  fcNames?: string[];
  discountTypes?: string[];
  baselineStart?: string;
  baselineEnd?: string;
};

export type AuthorizedFilterInput = {
  company: CompanyCode;
  divisions: string[];
  segments: string[];
  channels: string[];
  fcNames: string[];
  discountTypes: string[];
  baselineStart: string;
  baselineEnd: string;
};

export function buildAuthorizedFilterInput(
  user: AuthUser,
  input: BaseFilterInput = {}
): AuthorizedFilterInput {
  const company = resolveAuthorizedCompany(user, input.company ?? "");

  return {
    company,
    divisions: scopeDivisionFiltersToCompany(input.divisions ?? [], company),
    segments: input.segments ?? [],
    channels: input.channels ?? [],
    fcNames: input.fcNames ?? [],
    discountTypes: input.discountTypes ?? [],
    baselineStart: input.baselineStart ?? "",
    baselineEnd: input.baselineEnd ?? ""
  };
}

export function buildAuthorizedProjectParams(
  user: AuthUser,
  input: BaseFilterInput & {
    search?: string;
    ladder?: string;
    day?: string;
    page?: number;
    pageSize?: number;
  }
) {
  return {
    ...buildAuthorizedFilterInput(user, input),
    search: input.search ?? "",
    ladder: input.ladder ?? "",
    day: input.day ?? "",
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20
  };
}
