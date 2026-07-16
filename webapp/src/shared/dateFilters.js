export const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "custom", label: "Custom dates" },
  { value: "all", label: "All time" },
];

const startOfLocalDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addLocalDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

const parseLocalDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, month, day);

  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
};

export const toDateInputValue = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getDateRange = (
  preset,
  now = new Date(),
  customFrom = "",
  customTo = ""
) => {
  const today = startOfLocalDay(now);
  let dateFrom;
  let dateTo;

  switch (preset) {
    case "today":
      dateFrom = today;
      dateTo = addLocalDays(today, 1);
      break;
    case "yesterday":
      dateFrom = addLocalDays(today, -1);
      dateTo = today;
      break;
    case "this_week": {
      const daysSinceMonday = (today.getDay() + 6) % 7;
      dateFrom = addLocalDays(today, -daysSinceMonday);
      dateTo = addLocalDays(dateFrom, 7);
      break;
    }
    case "last_week": {
      const daysSinceMonday = (today.getDay() + 6) % 7;
      dateTo = addLocalDays(today, -daysSinceMonday);
      dateFrom = addLocalDays(dateTo, -7);
      break;
    }
    case "last_7_days":
      dateFrom = addLocalDays(today, -6);
      dateTo = addLocalDays(today, 1);
      break;
    case "last_30_days":
      dateFrom = addLocalDays(today, -29);
      dateTo = addLocalDays(today, 1);
      break;
    case "this_month":
      dateFrom = new Date(today.getFullYear(), today.getMonth(), 1);
      dateTo = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      break;
    case "last_month":
      dateFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      dateTo = new Date(today.getFullYear(), today.getMonth(), 1);
      break;
    case "custom":
      dateFrom = parseLocalDate(customFrom);
      dateTo = parseLocalDate(customTo);
      if (!dateFrom || !dateTo || dateFrom > dateTo) return null;
      dateTo = addLocalDays(dateTo, 1);
      break;
    case "all":
    default:
      return { dateFrom: null, dateTo: null };
  }

  return {
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
  };
};

export const createDateFilter = (
  preset = "all",
  dateMode = "include",
  customFrom = "",
  customTo = "",
  now = new Date()
) => ({
  preset,
  dateMode: preset === "all" ? "include" : dateMode,
  customFrom,
  customTo,
  ...getDateRange(preset, now, customFrom, customTo),
});

export const getDateFilterLabel = (filter) => {
  if (filter.preset === "custom") {
    const range = `${filter.customFrom} – ${filter.customTo}`;
    return filter.dateMode === "exclude" ? `Exclude: ${range}` : range;
  }

  const preset = DATE_PRESETS.find(({ value }) => value === filter.preset);
  const label = preset?.label || "All time";
  return filter.dateMode === "exclude" && filter.preset !== "all"
    ? `Exclude: ${label}`
    : label;
};
