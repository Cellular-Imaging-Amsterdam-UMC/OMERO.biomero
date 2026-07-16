import React, { useEffect, useMemo, useState } from "react";
import { Button, Classes, Popover, Switch } from "@blueprintjs/core";
import { DateRangePicker } from "@blueprintjs/datetime";
import "@blueprintjs/datetime/lib/css/blueprint-datetime.css";
import "./DateFilterControl.css";
import {
  createDateFilter,
  createDateFilterFromRange,
  getDateFilterLabel,
} from "../dateFilters";

const getPickerRange = ({ dateFrom, dateTo }) => {
  if (!dateFrom || !dateTo) return [null, null];

  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [null, null];
  }

  end.setDate(end.getDate() - 1);
  return [start, end];
};

const DateFilterControl = ({ value, onChange }) => {
  const { dateFrom, dateMode, dateTo } = value;
  const [selectedRange, setSelectedRange] = useState(() =>
    getPickerRange(value)
  );
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  useEffect(() => {
    setSelectedRange(getPickerRange({ dateFrom, dateTo }));
  }, [dateFrom, dateTo]);

  const hasCompleteRange = Boolean(selectedRange[0] && selectedRange[1]);

  const selectRange = (nextRange) => {
    setSelectedRange(nextRange);

    if (nextRange[0] && nextRange[1]) {
      onChange(createDateFilterFromRange(nextRange, dateMode));
    } else if (!nextRange[0] && !nextRange[1]) {
      onChange(createDateFilter("all"));
    }
  };

  const toggleMode = (event) => {
    const nextMode = event.target.checked ? "exclude" : "include";
    if (hasCompleteRange) {
      onChange(createDateFilterFromRange(selectedRange, nextMode));
    }
  };

  const clearRange = () => {
    const emptyRange = [null, null];
    setSelectedRange(emptyRange);
    onChange(createDateFilter("all"));
  };

  const content = (
    <div className={Classes.UI_TEXT}>
      <DateRangePicker
        allowSingleDayRange
        className="date-filter-picker"
        highlightCurrentDay
        maxDate={today}
        shortcuts
        singleMonthOnly
        value={selectedRange}
        onChange={selectRange}
      />
      <div className="flex items-center justify-between gap-4 p-3 pt-0">
        <Switch
          className="mb-0"
          checked={dateMode === "exclude"}
          disabled={!hasCompleteRange}
          label="Exclude selected range"
          onChange={toggleMode}
        />
        <Button
          disabled={!selectedRange[0] && !selectedRange[1]}
          icon="filter-remove"
          minimal
          text="Clear"
          onClick={clearRange}
        />
      </div>
    </div>
  );

  return (
    <Popover content={content} placement="bottom-end">
      <Button
        icon="calendar"
        rightIcon="caret-down"
        text={getDateFilterLabel(value)}
      />
    </Popover>
  );
};

export default DateFilterControl;
