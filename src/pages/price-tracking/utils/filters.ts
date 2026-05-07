type DashboardFilterQueryOptions = {
  divisions: string[];
  segments: string[];
  channels: string[];
  fcNames: string[];
  discountTypes: string[];
  baselineStart?: string;
  baselineEnd?: string;
};

export function normalizeQueryValues(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).sort();
}

export function buildDashboardFilterQuery({
  divisions,
  segments,
  channels,
  fcNames,
  discountTypes,
  baselineStart,
  baselineEnd
}: DashboardFilterQueryOptions) {
  const params = new URLSearchParams();
  const normalizedDivisions = normalizeQueryValues(divisions);
  const normalizedSegments = normalizeQueryValues(segments);
  const normalizedChannels = normalizeQueryValues(channels);
  const normalizedFcNames = normalizeQueryValues(fcNames);
  const normalizedDiscountTypes = normalizeQueryValues(discountTypes);

  if (normalizedDivisions.length > 0) {
    params.set("divisions", normalizedDivisions.join(","));
  }

  if (normalizedSegments.length > 0) {
    params.set("segments", normalizedSegments.join(","));
  }

  if (normalizedChannels.length > 0) {
    params.set("channels", normalizedChannels.join(","));
  }

  if (normalizedFcNames.length > 0) {
    params.set("fcNames", normalizedFcNames.join(","));
  }

  if (normalizedDiscountTypes.length > 0) {
    params.set("discountTypes", normalizedDiscountTypes.join(","));
  }

  if (baselineStart) {
    params.set("baselineStart", baselineStart);
  }

  if (baselineEnd) {
    params.set("baselineEnd", baselineEnd);
  }

  return params;
}

export function buildCanonicalQueryKey(params: URLSearchParams) {
  const entries = Array.from(params.entries()).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    if (leftKey === rightKey) {
      return leftValue.localeCompare(rightValue);
    }

    return leftKey.localeCompare(rightKey);
  });

  return new URLSearchParams(entries).toString();
}

export function summarizeMultiSelect(selectedValues: string[], fallbackLabel: string) {
  if (selectedValues.length === 0) {
    return fallbackLabel;
  }

  if (selectedValues.length === 1) {
    return selectedValues[0];
  }

  return `${selectedValues[0]} +${selectedValues.length - 1}`;
}
