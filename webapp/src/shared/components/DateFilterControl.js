import React, { useId, useState } from "react";
import {
  Button,
  FormGroup,
  HTMLSelect,
  InputGroup,
  Popover,
  Switch,
} from "@blueprintjs/core";
import {
  createDateFilter,
  DATE_PRESETS,
  getDateRange,
  getDateFilterLabel,
  toDateInputValue,
} from "../dateFilters";

const DateFilterControl = ({ value, onChange }) => {
  const today = toDateInputValue(new Date());
  const [selectedPreset, setSelectedPreset] = useState(value.preset);
  const [dateMode, setDateMode] = useState(value.dateMode);
  const [customFrom, setCustomFrom] = useState(value.customFrom || today);
  const [customTo, setCustomTo] = useState(value.customTo || today);
  const presetInputId = useId();
  const fromInputId = useId();
  const toInputId = useId();

  const selectPreset = (event) => {
    const nextPreset = event.target.value;
    setSelectedPreset(nextPreset);

    if (nextPreset === "all") {
      setDateMode("include");
      onChange(createDateFilter("all"));
    } else if (nextPreset !== "custom") {
      onChange(createDateFilter(nextPreset, dateMode));
    }
  };

  const toggleMode = (event) => {
    const nextMode = event.target.checked ? "exclude" : "include";
    setDateMode(nextMode);

    if (selectedPreset !== "custom" && selectedPreset !== "all") {
      onChange(createDateFilter(selectedPreset, nextMode));
    }
  };

  const customRange = getDateRange(
    "custom",
    new Date(),
    customFrom,
    customTo
  );

  const applyCustomRange = () => {
    if (customRange) {
      onChange(
        createDateFilter("custom", dateMode, customFrom, customTo)
      );
    }
  };

  const content = (
    <div className="p-4 w-80">
      <FormGroup label="Date range" labelFor={presetInputId}>
        <HTMLSelect
          id={presetInputId}
          fill
          value={selectedPreset}
          options={DATE_PRESETS}
          onChange={selectPreset}
        />
      </FormGroup>

      {selectedPreset === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <FormGroup label="From" labelFor={fromInputId}>
            <InputGroup
              id={fromInputId}
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(event) => setCustomFrom(event.target.value)}
            />
          </FormGroup>
          <FormGroup label="To" labelFor={toInputId}>
            <InputGroup
              id={toInputId}
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(event) => setCustomTo(event.target.value)}
            />
          </FormGroup>
        </div>
      )}

      <Switch
        checked={dateMode === "exclude"}
        disabled={selectedPreset === "all"}
        label="Exclude selected range"
        onChange={toggleMode}
      />

      {selectedPreset === "custom" && (
        <Button
          fill
          intent="primary"
          text="Apply date range"
          disabled={!customRange}
          onClick={applyCustomRange}
        />
      )}
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
