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
  "file_targets",
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

test("renders colored import rows with links into OMERO", async () => {
  fetchMetabaseData.mockResolvedValue({
    data: {
      cols: columns,
      rows: [
        [
          '["completed.tif", "second.tif"]',
          "Import Completed",
          "1",
          "completed-uuid",
          "2026-07-16T08:00:00Z",
          "10 seconds",
          "system",
          "root",
          null,
          "Dataset",
          {
            "completed.tif": ["image-1251"],
            "second.tif": ["image-1252", "image-1253"],
          },
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
          {},
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
    await screen.findByRole("row", {
      name: /completed\.tif.*Import Completed/,
    })
  ).toHaveClass("bg-green-50/70");
  expect(
    screen.getByRole("row", { name: /failed\.tif Import Failed/ })
  ).toHaveClass("bg-red-50/70");

  const fileLink = screen.getByRole("link", { name: "completed.tif" });
  const uuidLink = screen.getByRole("link", {
    name: "Search OMERO for UUID completed-uuid",
  });
  expect(fileLink).toHaveAttribute(
    "href",
    "/webclient/?show=image-1251"
  );
  expect(screen.getByRole("link", { name: "second.tif" })).toHaveAttribute(
    "href",
    "/webclient/search/?search_query=%22completed-uuid%22"
  );
  expect(uuidLink).toHaveAttribute(
    "href",
    "/webclient/search/?search_query=%22completed-uuid%22"
  );
  expect(screen.getByRole("link", { name: "Dataset 1" })).toHaveAttribute(
    "href",
    "/webclient/?show=dataset-1"
  );
});
