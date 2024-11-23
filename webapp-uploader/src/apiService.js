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
export const fetchTreeData = async () => {
  const { user, urls } = getDjangoConstants();
  const params = {
    id: 0,
    experimenter_id: user.active_user.id,
    page: 0,
    group: 0,
  };
  return apiRequest(urls.tree_top_level, "GET", null, { params });
};
