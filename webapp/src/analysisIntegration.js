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

export const workspaceDatasetResolutionUrl = (baseUrl, datasetId) => {
  const id = positiveInteger(datasetId);
  if (!baseUrl || !id) return "";
  const base = new URL(baseUrl, window.location.origin);
  if (base.origin !== window.location.origin) return "";
  return new URL(`api/workspace-dataset/${id}/`, base).toString();
};

const sameOriginAnalysisBase = (baseUrl) => {
  if (!baseUrl) return null;
  const base = new URL(baseUrl, window.location.origin);
  return base.origin === window.location.origin ? base : null;
};

const analysisObjectUrl = (baseUrl, resource, source) => {
  const base = sameOriginAnalysisBase(baseUrl);
  const type = normalizedType(source?.type);
  const id = positiveInteger(source?.id);
  if (!base || !type || !id) return "";
  return new URL(`api/${resource}/${type}/${id}/`, base).toString();
};

export const launchContextUrl = (baseUrl, source) => {
  const value = analysisObjectUrl(baseUrl, "launch-context", source);
  if (!value) return "";
  const url = new URL(value);
  (source.selectionIds || []).forEach((id) =>
    url.searchParams.append("selection_id", String(id))
  );
  return url.toString();
};

export const fetchAnalysisLaunchContext = async (baseUrl, source, options = {}) => {
  const url = launchContextUrl(baseUrl, source);
  if (!url) throw new Error("The selected Analysis source is invalid.");
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "The Analysis launch options could not be loaded.");
  }
  return payload;
};

const csrfToken = () => {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
};

export const uploadAnalysisAttachment = async (baseUrl, source, file) => {
  const base = sameOriginAnalysisBase(baseUrl);
  const uploadUrl = analysisObjectUrl(baseUrl, "attachments", source);
  if (!base || !uploadUrl || !file) throw new Error("The Analysis upload is invalid.");
  const tokenResponse = await fetch(new URL("api/context-token/", base), {
    method: "POST",
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRFToken": csrfToken(),
    },
    body: JSON.stringify({ object_type: source.type, object_id: source.id }),
  });
  const tokenPayload = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    throw new Error(tokenPayload?.error?.message || "The Analysis upload could not be authorized.");
  }
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch(`${uploadUrl}upload/`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": csrfToken(),
      "X-OMERO-Analysis-Context": tokenPayload.context_token,
    },
    body: form,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || "The attachment upload failed.");
  }
  return payload.attachment;
};

export const fetchWorkspaceDatasetResolution = async (
  baseUrl,
  datasetId,
  options = {}
) => {
  const url = workspaceDatasetResolutionUrl(baseUrl, datasetId);
  if (!url) throw new Error("The Analysis Workspace Dataset is invalid.");
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        "The Analysis Workspace metadata could not be resolved."
    );
  }
  return payload;
};

export const sourceFromWorkspaceDataset = (payload) => {
  if (!payload?.managed) return { source: null, error: "", managed: false };
  if (!payload.resumable) {
    return {
      source: null,
      error:
        payload.error || "This Analysis Workspace cannot currently be resumed.",
      managed: true,
    };
  }
  const type = normalizedType(payload.sourceObjectType);
  const id = positiveInteger(payload.sourceObjectId);
  const workspaceAnnotationId = positiveInteger(
    payload.workspaceAnnotationId
  );
  if (!type || !id) {
    return {
      source: null,
      error: "This Analysis Workspace has invalid synchronized source metadata.",
      managed: true,
    };
  }
  return {
    source: {
      type,
      id,
      selectionIds: [],
      dataAnnotationIds: [],
      workspaceAnnotationId,
      libraryItemIds: [],
      openLibrary: false,
      title: payload.sourceObjectName || `${type} ${id}`,
      resumeWorkspaceName:
        payload.workspaceName || payload.datasetName || "Analysis Workspace",
    },
    error: "",
    managed: true,
  };
};

export const sourceFromLaunchContext = (payload, fallbackSource) => {
  const summary = payload?.workspace_summary;
  if (payload?.panel_kind !== "workspace" || !summary) {
    return { source: fallbackSource, error: "", managed: false };
  }
  return sourceFromWorkspaceDataset({
    managed: true,
    resumable: Boolean(summary.can_resume),
    error: summary.can_resume ? "" : "This Analysis Workspace cannot currently be resumed.",
    datasetName: summary.dataset_name,
    workspaceName: summary.workspace_name,
    sourceObjectType: summary.source_type,
    sourceObjectId: summary.source_id,
    sourceObjectName: summary.source_name,
    workspaceAnnotationId: summary.snapshot_annotation_id || null,
  });
};

export const isAnalysisMessage = (event, iframeWindow) =>
  event.origin === window.location.origin &&
  event.source === iframeWindow &&
  event.data?.schema === ANALYSIS_MESSAGE_SCHEMA &&
  event.data?.source === "omero-analysis" &&
  MESSAGE_TYPES.has(event.data?.type) &&
  event.data?.payload &&
  typeof event.data.payload === "object";

export const postAnalysisTheme = (iframeWindow, theme) => {
  if (!iframeWindow || !["light", "dark"].includes(theme)) return false;
  iframeWindow.postMessage({
    schema: ANALYSIS_MESSAGE_SCHEMA,
    source: "omero-biomero",
    type: "theme-changed",
    payload: { theme },
  }, window.location.origin);
  return true;
};
