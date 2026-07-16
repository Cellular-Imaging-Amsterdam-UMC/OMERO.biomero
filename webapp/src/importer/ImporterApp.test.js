import { render, screen } from "@testing-library/react";
import { fetchMetabaseData } from "../apiService";
import { getDateRange } from "../shared/dateFilters";
import { MonitorPanel } from "./ImporterApp";

jest.mock("./components/FileBrowser", () => () => null);
jest.mock("../shared/components/OmeroDataBrowser", () => () => null);
jest.mock("../shared/components/GroupSelect", () => () => null);
jest.mock("./components/AdminPanel", () => () => null);
jest.mock("./components/ResumableUploader", () => () => null);
jest.mock("./components/NewContainerOverlay", () => () => null);
jest.mock("./components/MetadataForms", () => () => null);
jest.mock("../apiService", () => ({
  fetchMetabaseData: jest.fn(),
}));

const columns = [
  "file_names",
  "stage",
  "Dataset/Screen",
  "uuid",
  "timestamp",
  "elapsed_time",
  "group_name",
  "user_name",
  "description",
  "destination_type",
].map((name) => ({ name }));

test("creates calendar-day ISO boundaries for import date presets", () => {
  const now = new Date(2026, 6, 16, 13, 30);

  expect(getDateRange("today", now)).toEqual({
    dateFrom: new Date(2026, 6, 16).toISOString(),
    dateTo: new Date(2026, 6, 17).toISOString(),
  });
  expect(getDateRange("last_7_days", now)).toEqual({
    dateFrom: new Date(2026, 6, 10).toISOString(),
    dateTo: new Date(2026, 6, 17).toISOString(),
  });
});

test("colors completed and failed imports across their full table rows", async () => {
  fetchMetabaseData.mockResolvedValue({
    data: {
      cols: columns,
      rows: [
        [
          '["completed.tif"]',
          "Import Completed",
          "1",
          "completed-uuid",
          "2026-07-16T08:00:00Z",
          "10 seconds",
          "system",
          "root",
          null,
          "Dataset",
        ],
        [
          '["failed.tif"]',
          "Import Failed",
          "2",
          "failed-uuid",
          "2026-07-16T08:01:00Z",
          "5 seconds",
          "system",
          "root",
          "Import failed",
          "Dataset",
        ],
      ],
      total_rows: 2,
    },
  });

  render(<MonitorPanel isAdmin={false} metabaseUrl="" />);

  expect(fetchMetabaseData).toHaveBeenCalledWith(
    "imports",
    1,
    "",
    50,
    expect.objectContaining({
      dateMode: "include",
      dateFrom: null,
      dateTo: null,
    })
  );
  expect(
    await screen.findByRole("row", { name: /completed\.tif Import Completed/ })
  ).toHaveClass("bg-green-50/70");
  expect(
    screen.getByRole("row", { name: /failed\.tif Import Failed/ })
  ).toHaveClass("bg-red-50/70");
});
