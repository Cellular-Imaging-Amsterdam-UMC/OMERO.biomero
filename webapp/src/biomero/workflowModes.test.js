import {
  getWorkflowModes,
  isWorkflowAvailableInTab,
} from "./workflowModes";

describe("workflow modes", () => {
  test("keeps descriptor plate workflows plate-only by default", () => {
    const modes = getWorkflowModes(
      "plate_tool",
      {},
      { "requires-plate": true }
    );

    expect(modes).toEqual({
      supportsImages: false,
      supportsPlates: true,
      requiresZarr: true,
      isDualMode: false,
    });
  });

  test("allows one configured workflow in both tabs without duplicating it", () => {
    const modes = getWorkflowModes(
      "shared_tool",
      { dual_mode_workflows: '["shared_tool"]' },
      { "requires-plate": true }
    );

    expect(isWorkflowAvailableInTab(modes, "images", true)).toBe(true);
    expect(isWorkflowAvailableInTab(modes, "plates", true)).toBe(true);
    expect(modes.isDualMode).toBe(true);
  });

  test("does not expose plate or ZARR modes when importer integration is off", () => {
    const modes = getWorkflowModes(
      "shared_tool",
      {
        plate_workflows: '["shared_tool"]',
        dual_mode_workflows: '["shared_tool"]',
      }
    );

    expect(isWorkflowAvailableInTab(modes, "images", false)).toBe(false);
    expect(isWorkflowAvailableInTab(modes, "plates", false)).toBe(false);
  });

  test("ignores malformed workflow lists instead of breaking the run panel", () => {
    const modes = getWorkflowModes("image_tool", {
      plate_workflows: "not-json",
      dual_mode_workflows: "{}",
    });

    expect(modes.supportsImages).toBe(true);
    expect(modes.supportsPlates).toBe(false);
  });
});
