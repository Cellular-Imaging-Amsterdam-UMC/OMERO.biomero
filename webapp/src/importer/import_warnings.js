/**
 * File: import_warnings.js
 * Contains warning messages and logic for importing files via the BIOMERO UI import tab.
 * This separates the warning content for easy review.
 */

const CONVERTER_EXTENSIONS = [".lif", ".xlef", ".lof", ".db", ".icarch"];

/**
 * Checks if a file requires conversion.
 * @param {string} filename 
 * @param {object} config - State config containing PREPROCESSING_EXTENSION_MAP 
 * @returns {boolean}
 */
export const checkIfRequiresConversion = (filename, config) => {
  if (!filename) return false;
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  
  // Try to use extension map from config if available
  if (config?.PREPROCESSING_EXTENSION_MAP) {
    return !!config.PREPROCESSING_EXTENSION_MAP[ext];
  }
  
  return CONVERTER_EXTENSIONS.includes(ext);
};

/**
 * Returns the warning text and status details for a file import.
 * @param {string} filename - Name of the file/folder
 * @param {object} config - State config containing PREPROCESSING_EXTENSION_MAP
 * @returns {object|null} - { summary, details } or null if no warning needed
 */
export const getImportWarning = (filename, config) => {
  const requiresConversion = checkIfRequiresConversion(filename, config);

  if (requiresConversion) {
    return {
      summary: "Data duplication warning",
      details: "This file will be converted, which will lead to data duplication. The original file will remain untouched."
    };
  }
  
  return null;
};
