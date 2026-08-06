import {
  ANALYSIS_MESSAGE_SCHEMA,
  buildAnalysisUrl,
  isAnalysisMessage,
  parseAnalysisLaunch,
  sourceFromTreeItems,
} from "./analysisIntegration";

test("explicit Analysis parameters are parsed through the supported whitelist", () => {
  const source = parseAnalysisLaunch(
    "?tab=data-analysis&analysis_type=Plate&analysis_id=12" +
      "&analysis_selection_id=12&analysis_selection_id=13" +
      "&analysis_workspace_annotation=99&ignored=https://evil.example"
  );
  expect(source).toMatchObject({
    type: "Plate",
    id: 12,
    selectionIds: [12, 13],
    workspaceAnnotationId: 99,
  });
  const url = new URL(buildAnalysisUrl("/omero_analysis/", source));
  expect(url.origin).toBe(window.location.origin);
  expect(url.searchParams.get("embedded")).toBe("biomero");
  expect(url.searchParams.getAll("selection_id")).toEqual(["12", "13"]);
  expect(url.searchParams.has("ignored")).toBe(false);
});

test("invalid and mixed source selections are rejected", () => {
  expect(parseAnalysisLaunch("?analysis_type=Project&analysis_id=4")).toBeNull();
  expect(
    sourceFromTreeItems([
      { category: "plates", id: 1, data: "P1" },
      { category: "images", id: 2, data: "I2" },
    ]).error
  ).toMatch(/same type/);
});

test("same-type image selection becomes one Analysis source", () => {
  const result = sourceFromTreeItems([
    { category: "images", id: 5, data: "I5" },
    { category: "images", id: 6, data: "I6" },
  ]);
  expect(result.error).toBe("");
  expect(result.source).toMatchObject({
    type: "Image",
    id: 5,
    selectionIds: [5, 6],
  });
});

test("iframe messages require the same origin, source window, and schema", () => {
  const iframeWindow = {};
  const message = {
    origin: window.location.origin,
    source: iframeWindow,
    data: {
      schema: ANALYSIS_MESSAGE_SCHEMA,
      source: "omero-analysis",
      type: "ready",
      payload: {},
    },
  };
  expect(isAnalysisMessage(message, iframeWindow)).toBe(true);
  expect(isAnalysisMessage({ ...message, origin: "https://evil.example" }, iframeWindow)).toBe(false);
  expect(
    isAnalysisMessage(
      { ...message, data: { ...message.data, type: "arbitrary-command" } },
      iframeWindow
    )
  ).toBe(false);
});
