import { fireEvent, render, screen } from "@testing-library/react";
import ResizableTable from "./ResizableTable";

beforeEach(() => {
  window.localStorage.clear();
  window.PointerEvent = MouseEvent;
});

test("fills its container and supports keyboard column resizing", () => {
  render(
    <ResizableTable
      columns={[
        { key: "files", label: "File Names", width: 200, minWidth: 140 },
        { key: "status", label: "Status", width: 120, minWidth: 80 },
      ]}
      storageKey="resizable-table-test"
    >
      <tr>
        <td>image.tif</td>
        <td>Complete</td>
      </tr>
    </ResizableTable>
  );

  const table = screen.getByRole("table");
  const fileColumn = screen.getByTestId("column-files");
  expect(table).toHaveStyle("width: 100%; min-width: 320px");
  expect(fileColumn).toHaveStyle({ width: "200px" });

  const resizeHandle = screen.getByRole("separator", {
    name: "Resize File Names column",
  });
  fireEvent.keyDown(resizeHandle, { key: "ArrowRight" });

  expect(fileColumn).toHaveStyle({ width: "216px" });

  fireEvent.pointerDown(resizeHandle, { clientX: 100 });
  fireEvent.pointerMove(window, { clientX: 140 });
  fireEvent.pointerUp(window);

  expect(fileColumn).toHaveStyle({ width: "256px" });
});
