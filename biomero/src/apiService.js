import axios from "axios";
import { getDjangoConstants } from "./constants";

// General API request function
export const apiRequest = async (
  endpoint,
  method = "GET",
  data = null,
  options = {}
) => {
  try {
    const response = await axios({
      url: `${window.location.origin}${endpoint}`,
      method,
      data,
      ...options,
    });
    return response.data;
  } catch (error) {
    console.error("API Request Error:", error);
    throw error;
  }
};

// Specific API calls
export const fetchomeroTreeData = async () => {
  const { user, urls } = getDjangoConstants();
  const params = {
    id: user.active_user.id,
    experimenter_id: user.active_user.id,
    page: 0,
    group: user.active_group_id,
    _: new Date().getTime(),
  };
  return apiRequest(urls.tree_top_level, "GET", null, { params });
};

export const fetchProjectData = async (item) => {
  const projectId = item.id;
  const { urls, user } = getDjangoConstants();
  const params = {
    id: projectId,
    page: 0,
    group: user.active_group_id,
    _: new Date().getTime(),
  };
  return apiRequest(urls.api_datasets, "GET", null, { params });
};

export const fetchFolderData = async (folderId = null) => {
  const { urls, user } = getDjangoConstants();
  const params = {
    folder_id: folderId,
    page: 0,
    group: user.active_group_id,
    _: new Date().getTime(),
  };
  return apiRequest(urls.api_local_file_browser, "GET", null, { params });
};

export const fetchGroups = async () => {
  const { urls } = getDjangoConstants();
  return apiRequest(urls.api_get_groups, "GET");
};

// Fetch scripts from the server
export const fetchScripts = async () => {
  const { urls } = getDjangoConstants(); // Get the URLs from Django constants
  try {
    const response = await apiRequest(urls.scripts, "GET");
    return response;
  } catch (error) {
    console.error("Error fetching scripts:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
};

// Fetch script menu data
export const fetchScriptData = async (scriptId, directory) => {
  const { urls } = getDjangoConstants();
  const params = {
    script_ids: scriptId,
    directory: directory, // Include the directory as a query parameter
  };

  return apiRequest(urls.get_script_menu, "GET", null, { params });
};

// Fetch available workflows
export const fetchWorkflows = async () => {
  const { urls } = getDjangoConstants();
  return apiRequest(urls.workflows, "GET");
};

export const fetchConfig = async () => {
  const { urls } = getDjangoConstants();
  return apiRequest(urls.config, "GET");
};

// Fetch metadata for a specific workflow
export const fetchWorkflowMetadata = async (workflow) => {
  const { urls } = getDjangoConstants();
  const workflowMetadataUrl = `${urls.workflows}${workflow}/metadata/`; // Dynamically build the URL
  return apiRequest(workflowMetadataUrl, "GET");
};

// Fetch GitHub URL for a specific workflow
export const fetchWorkflowGithub = async (workflow) => {
  const { urls } = getDjangoConstants();
  const workflowGithubUrl = `${urls.workflows}${workflow}/github/`; // Dynamically build the URL
  return apiRequest(workflowGithubUrl, "GET");
};

// Fetch thumbnails for imageids
export const fetchThumbnails = async (imageIds) => {
  const { urls } = getDjangoConstants(); // Get the URLs from Django constants
  const validImageIds = imageIds.filter(id => id != null); // Removes undefined and null

  if (!validImageIds || validImageIds.length === 0) {
    console.warn("No (valid) image IDs provided, skipping thumbnail fetch.");
    return []; // Skip the API call if the array is empty
  }

  try {
    const queryString = validImageIds.map((id) => `id=${id}`).join("&");
    const endpoint = `${urls.api_thumbnails}?${queryString}`;
    const response = await apiRequest(endpoint, "GET");
    return response || [];
  } catch (error) {
    console.error("Error fetching thumbnails:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
};

// Fetch images for a dataset
export const fetchImages = async (datasetId, page = 1, sizeXYZ = false, date = false, group = 0) => {
  const { urls } = getDjangoConstants(); // Get the URLs from Django constants
  
  if (!datasetId) {
    datasetId = 51;//6;
    console.warn("No dataset ID provided, fetching example:", datasetId);
    // return []; // Skip the API call if the dataset ID is not provided
    
  }

  try {
    // Construct the query string
    const queryString = new URLSearchParams({
      id: datasetId,
      page: page,
      sizeXYZ: sizeXYZ.toString(),
      date: date.toString(),
      group: group.toString()
    }).toString();

    // Construct the endpoint URL
    const endpoint = `${urls.api_images}?${queryString}`;

    // Make the API call
    const response = await apiRequest(endpoint, "GET");
    
    return response.images || []; // Return the response or an empty array if no response
  } catch (error) {
    console.error("Error fetching images:", error);
    throw error; // Rethrow the error to be handled by the caller
  }
};




export const runWorkflow = async (workflowName, params = {}) => {
  const { urls } = getDjangoConstants();  // Base URL for the API from Django constants

  try {
    // Use the global csrftoken directly from window object
    const csrfToken = window.csrftoken; 

    // Prepare the payload with script_name and optional params
    const payload = { workflow_name: workflowName, params };

    const response = await apiRequest(urls.api_run_workflow, "POST", payload, {
      headers: {
        'X-CSRFToken': csrfToken,  // Include CSRF token in request headers
      },
    });

    return response;  // Return the API response
  } catch (error) {
    console.error("Error running workflow:", error);
    throw error;
  }
};

export const postConfig = async (config) => {
  const { urls } = getDjangoConstants();  // Base URL for the API from Django constants

  try {
    // Use the global csrftoken directly from window object
    const csrfToken = window.csrftoken; 

    // Prepare the payload with script_name and optional params
    const payload = { config };

    const response = await apiRequest(urls.api_save_config, "POST", payload, {
      headers: {
        'X-CSRFToken': csrfToken,  // Include CSRF token in request headers
      },
    });

    return response;  // Return the API response
  } catch (error) {
    console.error("Error saving config:", error);
    throw error;
  }
};






