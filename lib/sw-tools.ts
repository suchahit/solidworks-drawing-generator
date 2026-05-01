import type Anthropic from "@anthropic-ai/sdk";

export const SW_TOOLS: Anthropic.Tool[] = [
  {
    name: "sw_generate_drawing",
    description:
      "End-to-end orchestrator: opens a SOLIDWORKS part, sets custom properties for the title block, creates a drawing from the ANSI template, inserts standard orthographic views (front/top/right) plus an isometric view, imports model annotations, and saves the drawing. Call this first for any drawing-generation request.",
    input_schema: {
      type: "object",
      properties: {
        part_path: {
          type: "string",
          description: "Full Windows path to the .sldprt file.",
        },
        output_path: {
          type: "string",
          description: "Full Windows path where the .slddrw should be saved (extension added if missing).",
        },
        template_path: {
          type: "string",
          description:
            "Optional path to a .drwdot template. Defaults to the SOLIDWORKS user preference. ANSI template is at C:\\Program Files\\Dassault Systemes\\SOLIDWORKS 3DEXPERIENCE R2026x\\SOLIDWORKS\\data\\templates\\ansi.drwdot",
        },
        paper_size: {
          type: "string",
          enum: ["A", "B", "C", "D", "E"],
          description: "ANSI paper size. Defaults to A (8.5×11 in).",
        },
        include_iso: {
          type: "boolean",
          description: "Insert isometric view in upper-right corner. Default true.",
        },
        conservative_annotations: {
          type: "boolean",
          description:
            "If true (default), only imports dimensions marked-for-drawing. If false, also imports axes, planes, and cosmetic threads.",
        },
        properties: {
          type: "object",
          description:
            "Custom properties written to the part before drawing creation so $PRPSHEET title-block links resolve. Common keys: Description, PartNumber, Material, Finish, DrawnBy, DrawnDate, CheckedBy, Revision, Project.",
        },
      },
      required: ["part_path", "output_path"],
    },
  },
  {
    name: "sw_get_active_doc_info",
    description: "Returns the title, path, and type (1=Part, 2=Assembly, 3=Drawing) of the currently active SOLIDWORKS document.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sw_set_custom_property",
    description:
      "Writes a single custom property on the active SOLIDWORKS document. Use on the part to set title-block fields like Description, Material, DrawnBy, Revision, etc.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        value: { type: "string" },
        configuration: { type: "string", description: "Config name, empty = file-level (default)." },
      },
      required: ["name", "value"],
    },
  },
  {
    name: "sw_get_custom_property",
    description: "Reads one custom property by name, or all custom properties if name is omitted.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        configuration: { type: "string" },
      },
    },
  },
  {
    name: "sw_create_drawing_from_template",
    description: "Creates a new drawing document from a .drwdot template without inserting views yet.",
    input_schema: {
      type: "object",
      properties: {
        template_path: { type: "string" },
        paper_size: { type: "string", enum: ["A", "B", "C", "D", "E"] },
      },
    },
  },
  {
    name: "sw_insert_standard_views",
    description: "Inserts third-angle standard views (front/top/right) and optionally an isometric view into the active drawing.",
    input_schema: {
      type: "object",
      properties: {
        part_path: { type: "string" },
        include_iso: { type: "boolean" },
      },
      required: ["part_path"],
    },
  },
  {
    name: "sw_insert_model_annotations",
    description: "Imports model annotations (dimensions, etc.) from the part model into the drawing views.",
    input_schema: {
      type: "object",
      properties: {
        conservative: { type: "boolean" },
        all_views: { type: "boolean" },
        view_name: { type: "string" },
      },
    },
  },
  {
    name: "sw_populate_title_block",
    description:
      "Sets multiple custom properties at once on the part referenced by the active drawing, then forces a rebuild so $PRPSHEET title-block fields refresh.",
    input_schema: {
      type: "object",
      properties: {
        properties: { type: "object", description: "Map of property name → value." },
      },
      required: ["properties"],
    },
  },
  {
    name: "sw_save_drawing_as",
    description: "Saves the active drawing as .slddrw, .pdf, or .dxf.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        format: { type: "string", enum: ["slddrw", "pdf", "dxf"] },
      },
      required: ["path"],
    },
  },
];

// Maps Anthropic tool names → MCP tool names
export const TOOL_NAME_MAP: Record<string, string> = {
  sw_generate_drawing: "sw.generate_drawing",
  sw_get_active_doc_info: "sw.get_active_doc_info",
  sw_set_custom_property: "sw.set_custom_property",
  sw_get_custom_property: "sw.get_custom_property",
  sw_create_drawing_from_template: "sw.create_drawing_from_template",
  sw_insert_standard_views: "sw.insert_standard_views",
  sw_insert_model_annotations: "sw.insert_model_annotations",
  sw_populate_title_block: "sw.populate_title_block",
  sw_save_drawing_as: "sw.save_drawing_as",
};

export const SYSTEM_PROMPT = `You are an AI assistant that controls a local SOLIDWORKS instance through an MCP (Model Context Protocol) server running on the user's machine. You generate engineering drawings automatically.

Your primary goal: when the user asks to generate a drawing, call sw_generate_drawing with the correct arguments. That single tool handles everything end-to-end.

Guidelines:
- Always use sw_generate_drawing for new drawing requests — it creates the drawing, inserts views, adds annotations, and saves in one call.
- Default template: C:\\Program Files\\Dassault Systemes\\SOLIDWORKS 3DEXPERIENCE R2026x\\SOLIDWORKS\\data\\templates\\ansi.drwdot
- Default paper size: A (8.5×11 in, ANSI)
- Include isometric view by default (upper-right corner)
- Use conservative annotations by default (only dimensions marked for drawing)
- If the user provides title block info (description, material, drawn by, revision, etc.), pass them as the properties object
- Output path: if not given, save next to the part file with the same name but .slddrw extension
- Always confirm success and tell the user where the drawing was saved`;
