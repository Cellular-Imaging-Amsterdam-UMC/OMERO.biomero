import { render, screen, waitFor } from "@testing-library/react";
import { fetchMetabaseData } from "../apiService";
import { StatusPanel } from "./BiomeroApp";

jest.mock("./components/TabContainer", () => () => null);
jest.mock("./components/RunPanel", () => () => null);
jest.mock("../shared/components/GroupSelect", () => () => null);
jest.mock("../shared/components/SlurmStatusIndicator", () => () => null);
jest.mock("./components/SettingsForm", () => () => null);
jest.mock("../apiService", () => ({
  fetchMetabaseData: jest.fn(),
}));

test("loads workflow status without a date restriction by default", async () => {
  fetchMetabaseData.mockResolvedValue({
    data: {
      cols: [],
      rows: [],
      total_rows: 0,
    },
  });

  render(<StatusPanel isAdmin={false} metabaseUrl="" />);

  expect(screen.getByRole("button", { name: /all time/i })).toBeInTheDocument();
  await waitFor(() =>
    expect(fetchMetabaseData).toHaveBeenCalledWith(
      "workflows",
      1,
      "",
      50,
      expect.objectContaining({
        dateMode: "include",
        dateFrom: null,
        dateTo: null,
      })
    )
  );
});
