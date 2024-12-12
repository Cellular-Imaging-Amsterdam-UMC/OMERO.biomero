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
    const response = await apiRequest(urls.scripts, "GET"); // Assuming `urls.scripts` is the correct endpoint for fetching scripts
    return response; // Return the fetched data
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

