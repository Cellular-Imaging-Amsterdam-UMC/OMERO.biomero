import React from "react";
import { HTMLTable, Tag, Button, Icon } from "@blueprintjs/core";

const TrackingTableView = ({
  units,
  selectedIndex,
  onSelectUnit,
  filterStatus,
  onFilterChange,
}) => {
  // Build filtered list with original indices preserved
  const filteredUnits = units
    .map((unit, idx) => ({ ...unit, _originalIndex: idx }))
    .filter((unit) => {
      if (filterStatus === "pending") return !unit.processed;
      if (filterStatus === "completed") return unit.processed;
      return true;
    });

  const totalUnits = units.length;
  const completedUnits = units.filter((u) => u.processed).length;

  return (
    <div className="flex flex-col h-full">
      {/* Progress header */}
      <div className="p-2 border-b bg-gray-50">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">
            {completedUnits}/{totalUnits} completed
          </span>
          <div className="flex gap-1">
            <Button
              small
              minimal
              active={filterStatus === "all"}
              onClick={() => onFilterChange("all")}
              text="All"
            />
            <Button
              small
              minimal
              active={filterStatus === "pending"}
              onClick={() => onFilterChange("pending")}
              text="Pending"
            />
            <Button
              small
              minimal
              active={filterStatus === "completed"}
              onClick={() => onFilterChange("completed")}
              text="Done"
            />
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-green-500 h-2 rounded-full transition-all"
            style={{
              width: `${totalUnits > 0 ? (completedUnits / totalUnits) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {/* Units list */}
      <div className="flex-1 overflow-y-auto">
        <HTMLTable compact interactive condensed className="w-full">
          <thead>
            <tr>
              <th className="text-xs">Image</th>
              <th className="text-xs">Cat</th>
              <th className="text-xs">C/Z/T</th>
              <th className="text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredUnits.map((unit) => {
              const actualIndex = unit._originalIndex;
              const isSelected = actualIndex === selectedIndex;
              return (
                <tr
                  key={actualIndex}
                  className={`cursor-pointer ${
                    isSelected ? "bg-blue-100" : ""
                  } ${unit.processed ? "opacity-60" : ""}`}
                  onClick={() => onSelectUnit(actualIndex)}
                >
                  <td
                    className="text-xs truncate max-w-[120px]"
                    title={unit.image_name}
                  >
                    {unit.image_name}
                  </td>
                  <td>
                    <Tag
                      minimal
                      small
                      intent={
                        unit.category === "training"
                          ? "primary"
                          : unit.category === "validation"
                            ? "warning"
                            : "none"
                      }
                    >
                      {(unit.category || "train").slice(0, 3)}
                    </Tag>
                  </td>
                  <td className="text-xs">
                    {unit.channel}/{unit.z_slice}/{unit.timepoint}
                  </td>
                  <td>
                    {unit.processed ? (
                      <Icon icon="tick-circle" intent="success" size={14} />
                    ) : (
                      <Icon icon="circle" className="text-gray-300" size={14} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </HTMLTable>
        {filteredUnits.length === 0 && (
          <div className="text-center text-gray-400 text-sm p-4">
            {filterStatus === "pending"
              ? "All units are completed!"
              : filterStatus === "completed"
                ? "No completed units yet."
                : "No processing units."}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrackingTableView;
