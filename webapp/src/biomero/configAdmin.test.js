import { getDeletedConfigOptions } from "./configAdmin";


test("finds explicit deletions across arbitrary flat config sections", () => {
  const previous = {
    SLURM: { keep: "value", remove: "value" },
    ANALYTICS: { remove_too: "true" },
    WORKFLOWS: {
      cellpose: "cellpose",
      cellpose_repo: "https://example.test/cellpose",
      cellpose_job: "jobs/cellpose.sh",
    },
  };
  const next = {
    SLURM: { keep: "value" },
    ANALYTICS: {},
    WORKFLOWS: {},
  };

  expect(getDeletedConfigOptions(previous, next)).toEqual([
    { section: "SLURM", option: "remove" },
    { section: "ANALYTICS", option: "remove_too" },
    { section: "WORKFLOWS", option: "cellpose" },
    { section: "WORKFLOWS", option: "cellpose_repo" },
    { section: "WORKFLOWS", option: "cellpose_job" },
  ]);
});
