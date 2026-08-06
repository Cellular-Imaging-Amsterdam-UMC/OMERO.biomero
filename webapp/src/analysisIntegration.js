export const ANALYSIS_MESSAGE_SCHEMA =
  "nl.bioimaging.omero-analysis.host.v1";

const TYPE_NAMES = {
  dataset: "Dataset",
  screen: "Screen",
  plate: "Plate",
  image: "Image",
};

const MULTI_SOURCE_TYPES = new Set(["Image", "Plate"]);
const MESSAGE_TYPES = new Set([
  "ready",
  "dirty-state-changed",
  "source-title-changed",
  "request-open-new-tab",
  "session-expired",
]);

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const positiveIntegers = (values) => [
  ...new Set(values.map(positiveInteger).filter(Boolean)),
].slice(0, 100);

const normalizedType = (value) =>
  TYPE_NAMES[String(value || "").toLowerCase()] || null;

const sourceFromParams = (params, prefix) => {
  const type = normalizedType(params.get(`${prefix}type`));
  const id = positiveInteger(params.get(`${prefix}id`));
  if (!type || !id) return null;

  const selectionIds = positiveIntegers(params.getAll(`${prefix}selection_id`));
  if (selectionIds.length && !MULTI_SOURCE_TYPES.has(type)) return null;

  return {
    type,
    id,
    selectionIds,
    dataAnnotationIds: positiveIntegers(
      params.getAll(`${prefix}data_annotation`)
    ),
    workspaceAnnotationId: positiveInteger(
      params.get(`${prefix}workspace_annotation`)
    ),
    libraryItemIds: positiveIntegers(params.getAll(`${prefix}library_item`)),
    openLibrary: params.get(`${prefix}open_library`) === "1",
    title: `${type} ${id}`,
  };
};

export const parseAnalysisLaunch = (search) => {
  const params = new URLSearchParams(search || "");
  return sourceFromParams(params, "analysis_") || sourceFromParams(params, "");
};

export const sourceFromTreeItems = (items) => {
  const selected = (items || []).filter(Boolean);
  if (!selected.length) {
    return { source: null, error: "Select a Dataset, Screen, Plate, or Image." };
  }

  const sources = selected.map((item) => ({
    type: normalizedType(String(item.category || "").replace(/s$/, "")),
    id: positiveInteger(item.id),
    title: item.data || item.name || "",
  }));
  if (sources.some((source) => !source.type || !source.id)) {
    return {
      source: null,
      error: "Projects are browsing roots. Select a Dataset inside the Project.",
    };
  }

  const type = sources[0].type;
  if (
    sources.length > 1 &&
    (!MULTI_SOURCE_TYPES.has(type) ||
      sources.some((source) => source.type !== type))
  ) {
    return {
      source: null,
      error: "Multiple selection supports only Images or Plates of the same type.",
    };
  }

  const first = sources[0];
  return {
    source: {
      type,
      id: first.id,
      selectionIds: sources.length > 1 ? sources.map((source) => source.id) : [],
      dataAnnotationIds: [],
      workspaceAnnotationId: null,
      libraryItemIds: [],
      openLibrary: false,
      title:
        sources.length > 1
          ? `${sources.length} selected ${type}s`
          : first.title || `${type} ${first.id}`,
    },
    error: "",
  };
};

export const buildAnalysisUrl = (baseUrl, source, embedded = true) => {
  if (!baseUrl || !source) return "";
  const url = new URL(baseUrl, window.location.origin);
  url.search = "";
  if (embedded) url.searchParams.set("embedded", "biomero");
  url.searchParams.set("type", source.type);
  url.searchParams.set("id", String(source.id));
  (source.selectionIds || []).forEach((id) =>
    url.searchParams.append("selection_id", String(id))
  );
  if (source.workspaceAnnotationId) {
    url.searchParams.set(
      "workspace_annotation",
      String(source.workspaceAnnotationId)
    );
  } else {
    (source.dataAnnotationIds || []).forEach((id) =>
      url.searchParams.append("data_annotation", String(id))
    );
  }
  if (source.openLibrary || (source.libraryItemIds || []).length) {
    url.searchParams.set("open_library", "1");
    (source.libraryItemIds || []).forEach((id) =>
      url.searchParams.append("library_item", String(id))
    );
  }
  return url.toString();
};

export const isAnalysisMessage = (event, iframeWindow) =>
  event.origin === window.location.origin &&
  event.source === iframeWindow &&
  event.data?.schema === ANALYSIS_MESSAGE_SCHEMA &&
  event.data?.source === "omero-analysis" &&
  MESSAGE_TYPES.has(event.data?.type) &&
  event.data?.payload &&
  typeof event.data.payload === "object";
