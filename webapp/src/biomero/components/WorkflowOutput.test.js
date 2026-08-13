import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import WorkflowOutput, {
  getSuggestedDatasetDestination,
} from "./WorkflowOutput";
import { useAppContext } from "../../AppContext";

jest.mock("../../AppContext", () => ({
  useAppContext: jest.fn(),
}));
jest.mock("@blueprintjs/core", () => {
  const Container = ({ children }) => <div>{children}</div>;
  const MockFormGroup = ({ children, helperText, label, labelFor }) => (
    <div>
      {label && <label htmlFor={labelFor}>{label}</label>}
      {children}
      {helperText && <span>{helperText}</span>}
    </div>
  );
  return {
    Alignment: { END: "end" },
    Card: Container,
    FormGroup: MockFormGroup,
    HTMLSelect: ({ options = [], ...props }) => (
      <select {...props}>
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          return <option key={value} value={value}>{label}</option>;
        })}
      </select>
    ),
    InputGroup: (props) => <input {...props} />,
    Switch: ({ children, label, ...props }) => (
      <label>
        {label}
        <input type="checkbox" aria-label={label} {...props} />
        {children}
      </label>
    ),
    SwitchCard: Container,
    Callout: Container,
    Tooltip: Container,
    Icon: () => null,
    Divider: () => <hr />,
    Tag: Container,
  };
});

jest.mock("./DatasetSelectWithPopover.js", () => () => (
  <div data-testid="dataset-select" />
));

const baseFormData = {
  importAsZip: false,
  uploadCsv: false,
  attachToOriginalImages: false,
  attachFileOutputs: false,
  selectedDatasets: [],
  selectedDatasetId: null,
  enableRename: false,
  createRois: false,
  roiLabelPattern: "",
  roiShape: "Polygon",
  roiColor: "",
  clearExistingRois: false,
  clearRoiFilter: "",
};

describe("WorkflowOutput image-pathway destination suggestions", () => {
  test("suggests a new dataset named after a single input plate", async () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: baseFormData,
        inputDatasets: [{
          index: "plate-42",
          id: 42,
          data: "Screening Plate A",
          category: "plates",
        }],
        selectedWorkflow: {
          name: "cellpose",
          metadata: {
            outputs: [{ id: "mask", name: "Mask", type: "image" }],
          },
        },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(<WorkflowOutput onSelectionChange={jest.fn()} />);

    await waitFor(() => {
      expect(updateState).toHaveBeenCalledWith({
        formData: expect.objectContaining({
          selectedDatasets: [expect.stringMatching(/^Screening_Plate_A_cellpose_\d{8}_\d{6}$/)],
          selectedDatasetId: null,
        }),
      });
    });
  });

  test("suggests one compact new dataset for mixed inputs", async () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: baseFormData,
        inputDatasets: [
          {
            index: "dataset-7",
            id: 7,
            data: "Primary Images",
            category: "datasets",
          },
          {
            index: "plate-42",
            id: 42,
            data: "Screening Plate A",
            category: "plates",
          },
        ],
        selectedWorkflow: {
          name: "nuclei_segmentation",
          metadata: {
            outputs: [{ id: "mask", name: "Mask", type: "image" }],
          },
        },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(<WorkflowOutput onSelectionChange={jest.fn()} />);

    await waitFor(() => {
      expect(updateState).toHaveBeenCalledWith({
        formData: expect.objectContaining({
          selectedDatasets: [expect.stringMatching(/^Primary_Images_nuclei_segmentation_\d{8}_\d{6}$/)],
          selectedDatasetId: null,
        }),
      });
    });
  });

  test("reuses one existing dataset instead of creating another", () => {
    expect(getSuggestedDatasetDestination(
      [{
        index: "dataset-7",
        id: 7,
        data: "Primary Images",
        category: "datasets",
      }],
      "nuclei_segmentation"
    )).toEqual({ name: "Primary Images", id: 7 });
  });

  test("caps generated destination names without listing every input", () => {
    const destination = getSuggestedDatasetDestination(
      [
        {
          data: "A very long primary input container name that should be shortened for display",
          category: "plates",
        },
        { data: "Second input", category: "datasets" },
        { data: "Third input", category: "plates" },
      ],
      "an_extremely_long_workflow_name_that_also_needs_shortening",
      new Date(2026, 6, 29, 14, 35, 22)
    );

    expect(destination.id).toBeNull();
    expect(destination.name.length).toBeLessThanOrEqual(64);
    expect(destination.name).not.toMatch(/\s/);
    expect(destination.name).not.toContain("+");
    expect(destination.name).toMatch(/_20260729_143522$/);
    expect(destination.name).not.toContain("Second input");
    expect(destination.name).not.toContain("Third input");
  });

  test("accepts automatic ROI selection for descriptor label outputs", async () => {
    const onSelectionChange = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
          roiLabelPattern: "*",
        },
        inputDatasets: [],
        selectedWorkflow: {
          name: "bilayers-cellpose",
          metadata: {
            outputs: [{ id: "mask", type: "image", "sub-type": ["label"] }],
          },
        },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState: jest.fn(),
    });

    render(<WorkflowOutput onSelectionChange={onSelectionChange} />);

    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(true));
  });

  test("uses best-effort ROI selection without label descriptors", async () => {
    const onSelectionChange = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
          roiLabelPattern: "",
        },
        inputDatasets: [],
        selectedWorkflow: { name: "biaflows-cellpose", metadata: { outputs: [] } },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState: jest.fn(),
    });

    render(<WorkflowOutput onSelectionChange={onSelectionChange} />);

    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByText(/match imported results to each original image/i)).toBeInTheDocument();
  });

  test("offers OMERO label-image cleanup inside the active ROI card", () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
        },
        inputDatasets: [],
        selectedWorkflow: { name: "cellpose", metadata: { outputs: [] } },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(
      <WorkflowOutput onSelectionChange={jest.fn()} />
    );

    const retentionSelect = screen.getByLabelText("Imported label images");
    expect(retentionSelect).toHaveValue("keep");
    expect(screen.getByText(/workflow files in \.analyzed are preserved/i)).toBeInTheDocument();

    fireEvent.change(retentionSelect, { target: { value: "delete" } });

    expect(updateState).toHaveBeenCalledWith({
      formData: expect.objectContaining({ deleteLabelImagesAfterRois: true }),
    });
  });

  test("defaults ROI color to Auto and offers a custom color picker", () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
        },
        inputDatasets: [],
        selectedWorkflow: { name: "cellpose", metadata: { outputs: [] } },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(<WorkflowOutput onSelectionChange={jest.fn()} />);

    const colorMode = screen.getByLabelText("ROI color");
    expect(colorMode).toHaveValue("auto");
    expect(screen.getByText(/stable color from the workflow run UUID/i)).toBeInTheDocument();

    fireEvent.change(colorMode, { target: { value: "custom" } });

    expect(updateState).toHaveBeenCalledWith({
      formData: expect.objectContaining({ roiColor: "#147EB3" }),
    });
  });

  test("updates a custom ROI color", () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
          roiColor: "#E15759",
        },
        inputDatasets: [],
        selectedWorkflow: { name: "cellpose", metadata: { outputs: [] } },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(<WorkflowOutput onSelectionChange={jest.fn()} />);

    fireEvent.change(screen.getByLabelText("ROI color picker"), {
      target: { value: "#4e79a7" },
    });

    expect(updateState).toHaveBeenCalledWith({
      formData: expect.objectContaining({ roiColor: "#4E79A7" }),
    });
  });

  test("offers opt-in filtered ROI clearing on original images", () => {
    const updateState = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          ...baseFormData,
          selectedDatasets: ["Results"],
          createRois: true,
          clearExistingRois: true,
          clearRoiFilter: "cellpose__run-uuid",
        },
        inputDatasets: [],
        selectedWorkflow: { name: "cellpose", metadata: { outputs: [] } },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState,
    });

    render(<WorkflowOutput onSelectionChange={jest.fn()} />);

    const clearSwitch = screen.getByLabelText("Clear existing ROIs on original images");
    expect(clearSwitch).toBeChecked();
    expect(screen.getByText(/workflow name and run UUID for provenance/i)).toBeInTheDocument();
    expect(screen.getByText(/leaving the filter empty removes every existing ROI/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Only clear ROI names containing (optional)")).toHaveValue(
      "cellpose__run-uuid"
    );

    fireEvent.change(
      screen.getByLabelText("Only clear ROI names containing (optional)"),
      { target: { value: "stardist" } }
    );

    expect(updateState).toHaveBeenCalledWith({
      formData: expect.objectContaining({ clearRoiFilter: "stardist" }),
    });
  });

  test("requires imported screen images for plate ROI postprocessing", async () => {
    const onSelectionChange = jest.fn();
    useAppContext.mockReturnValue({
      state: {
        formData: {
          selectedScreens: [],
          selectedScreenId: null,
          createRois: true,
          roiLabelPattern: "*",
        },
        selectedWorkflow: {
          name: "plate-labels",
          metadata: { outputs: [{ type: "image", subtype: ["label"] }] },
        },
        capabilities: { roi_postprocessing: { available: true } },
        omeroFileTreeData: {},
      },
      updateState: jest.fn(),
    });

    render(<WorkflowOutput plateMode onSelectionChange={onSelectionChange} />);

    await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(false));
  });
});
