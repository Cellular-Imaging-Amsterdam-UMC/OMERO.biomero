import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DateFilterControl from "./DateFilterControl";
import { createDateFilter } from "../dateFilters";

test("applies Blueprint's Today shortcut from the unfiltered default", async () => {
  const onChange = jest.fn();

  render(
    <DateFilterControl
      value={createDateFilter("all")}
      onChange={onChange}
    />
  );

  userEvent.click(screen.getByRole("button", { name: /all time/i }));
  expect(screen.queryByLabelText("Date range")).not.toBeInTheDocument();
  userEvent.click(await screen.findByText("Today"));

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      preset: "custom",
      dateMode: "include",
      customFrom: expect.any(String),
      customTo: expect.any(String),
      dateFrom: expect.any(String),
      dateTo: expect.any(String),
    })
  );

  const appliedFilter = onChange.mock.calls[0][0];
  expect(appliedFilter.customFrom).toBe(appliedFilter.customTo);

  userEvent.click(screen.getByRole("button", { name: /clear/i }));
  expect(onChange).toHaveBeenLastCalledWith(
    expect.objectContaining({
      preset: "all",
      dateFrom: null,
      dateTo: null,
    })
  );
});
