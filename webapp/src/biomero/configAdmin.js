export const getDeletedConfigOptions = (previousConfig = {}, nextConfig = {}) => {
  const deleted = [];
  Object.entries(previousConfig).forEach(([section, previousSettings]) => {
    if (!previousSettings || typeof previousSettings !== "object" || Array.isArray(previousSettings)) {
      return;
    }
    const nextSettings = nextConfig[section];
    const comparableNext = (
      nextSettings && typeof nextSettings === "object" && !Array.isArray(nextSettings)
    ) ? nextSettings : {};
    Object.keys(previousSettings).forEach((option) => {
      if (!Object.prototype.hasOwnProperty.call(comparableNext, option)) {
        deleted.push({ section, option });
      }
    });
  });
  return deleted;
};
