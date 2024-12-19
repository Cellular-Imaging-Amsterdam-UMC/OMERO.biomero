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

export const runWorkflow = async (scriptName, params = {}) => {
  const { urls } = getDjangoConstants();  // Base URL for the API from Django constants

  try {
    // Use the global csrftoken directly from window object
    const csrfToken = window.csrftoken; 

    // Prepare the payload with script_name and optional params
    const payload = { script_name: scriptName, params };

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






