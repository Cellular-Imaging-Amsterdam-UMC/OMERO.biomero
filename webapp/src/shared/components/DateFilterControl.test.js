import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateFilterControl from "./DateFilterControl";
import { createDateFilter } from "../dateFilters";

test("offers Today first and applies it from the unfiltered default", async () => {
  const onChange = jest.fn();

  render(
    <DateFilterControl
      value={createDateFilter("all")}
      onChange={onChange}
    />
  );

  userEvent.click(screen.getByRole("button", { name: /all time/i }));
  const presetSelect = await screen.findByLabelText("Date range");
  expect(within(presetSelect).getAllByRole("option")[0]).toHaveTextContent(
    "Today"
  );

  userEvent.selectOptions(presetSelect, "today");

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      preset: "today",
      dateMode: "include",
      dateFrom: expect.any(String),
      dateTo: expect.any(String),
    })
  );
});
