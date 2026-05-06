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
        hole_callouts: {
          type: "boolean",
          description: "Add hole callout annotations to circular features. Default true.",
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
  {
    name: "sw_add_section_view",
    description:
      "EXPERIMENTAL — adds a section view to the active drawing. Works on parts AND assemblies. " +
      "Use ONLY when the user explicitly asks for a section view, or (for parts) when " +
      "sw_analyze_part_geometry's internal_features.has_internal_features is true AND the user has approved one. " +
      "Best-effort: returns success=false with an error message on failure (do not retry blindly — surface the error to the user). " +
      "The cutting line direction defaults to 'horizontal'; for parts where the primary axis is X, horizontal is correct. " +
      "ASSEMBLIES: pass excluded_components (array of component names) to skip parts in the cut. " +
      "Names not found in the assembly are reported in excluded_not_found rather than failing the call.",
    input_schema: {
      type: "object",
      properties: {
        letter:              { type: "string", description: "Section letter (A, B, C...). Default 'A'." },
        direction:           { type: "string", enum: ["horizontal", "vertical"], description: "Cut direction. Default 'horizontal'." },
        source_view:         { type: "string", description: "Optional source view name. Defaults to the first orthographic view." },
        section_x:           { type: "number", description: "Override sheet X position (meters)." },
        section_y:           { type: "number", description: "Override sheet Y position (meters)." },
        excluded_components: { type: "array",  items: { type: "string" }, description: "ASSEMBLIES ONLY — array of component Name2 strings to exclude from the section cut." },
      },
    },
  },
  {
    name: "sw_analyze_part_geometry",
    description:
      "Read-only geometry analysis of a part. Returns a JSON inventory: bounding box, primary axis, " +
      "hole features, and pattern features (linear/circular/mirror with seed feature names). " +
      "sw_generate_drawing calls this internally and includes the result as part_inventory in its response. " +
      "Call directly only if the user asks about part dimensions, hole counts, or pattern structure.",
    input_schema: {
      type: "object",
      properties: {
        part_path: { type: "string", description: "Full Windows path to the .sldprt." },
      },
      required: ["part_path"],
    },
  },
  {
    name: "sw_add_auto_balloons",
    description:
      "Auto-places balloons on the active drawing's iso view (or specified source view). " +
      "Defaults to one balloon per UNIQUE component (not per instance) per drafting convention. " +
      "Used inside sw_generate_assembly_drawing's flow. Call standalone to re-run balloons " +
      "after editing a drawing or to test different layout options. Returns balloon_count on success.",
    input_schema: {
      type: "object",
      properties: {
        layout:               { type: "string", enum: ["square", "circular", "top", "bottom", "left", "right"], description: "Default 'square'." },
        source_view:          { type: "string", description: "Optional view name. Defaults to iso view, falling back to first assembly-referencing view." },
        ignore_multiple:      { type: "boolean", description: "True (default) = one balloon per unique component. False = balloon every instance." },
        attach_to_faces:      { type: "boolean", description: "True (default) = leaders attach to faces. False = edges." },
        insert_magnetic_line: { type: "boolean", description: "Insert a magnetic line for balloon alignment. Default false." },
      },
    },
  },
  {
    name: "sw_analyze_assembly_drawing_quality",
    description:
      "Read-only quality audit of the active assembly drawing. Walks sheets/views to count BOM rows + balloons " +
      "(detecting mismatches), inspects drawing-level custom properties, finds components missing a PartNumber " +
      "(blank BOM rows), and flags suppressed components. Returns a 0-100 score and warnings array. " +
      "sw_generate_assembly_drawing calls this automatically and embeds the result as quality_report. " +
      "Call standalone after manual edits to re-score the drawing.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sw_add_exploded_view_sheet",
    description:
      "Adds a new sheet to the active assembly drawing and inserts an iso view of the assembly in exploded state. " +
      "Mirrors Sheet 1's paper size and template. Used inside sw_generate_assembly_drawing's flow when the assembly " +
      "has an exploded view defined. Call standalone to add an exploded sheet to an existing drawing, or to retry " +
      "after creating an exploded view in the assembly. Returns success=true with exploded=false + explode_error " +
      "if the configuration has no exploded view (iso view still gets inserted, just collapsed).",
    input_schema: {
      type: "object",
      properties: {
        sheet_name:         { type: "string", description: "Name for the new sheet. Default 'Exploded View'." },
        source_view:        { type: "string", description: "Optional source view name to read assembly path from. Defaults to first assembly-referencing view." },
        exploded_view_name: { type: "string", description: "Optional named exploded view (when assembly has multiple)." },
      },
    },
  },
  {
    name: "sw_add_bom_table",
    description:
      "Inserts a Bill of Materials table on the active drawing. Used inside sw_generate_assembly_drawing's flow " +
      "but exposed standalone for adding BOMs to existing drawings or for re-running the BOM after the agent " +
      "modifies an assembly. Auto-finds a source view that references an assembly. " +
      "Returns success=false with a structured error on failure (e.g., no assembly view, invalid template).",
    input_schema: {
      type: "object",
      properties: {
        bom_type:      { type: "string", enum: ["top_level", "parts_only", "indented"], description: "Default 'top_level'." },
        anchor:        { type: "string", enum: ["top_right", "top_left", "bottom_right", "bottom_left"], description: "Default 'top_right'." },
        template_path: { type: "string", description: "Optional .sldbomtbt path. Empty = SOLIDWORKS default." },
        source_view:   { type: "string", description: "Optional view name. Defaults to first view that references an assembly." },
        configuration: { type: "string", description: "Optional configuration name. Empty = active." },
      },
    },
  },
  {
    name: "sw_generate_assembly_drawing",
    description:
      "End-to-end orchestrator for ASSEMBLY drawings (.sldasm). Sheet 1: iso-primary view + optional " +
      "front view + BOM table + auto-balloons on the iso view. Sheet 2: exploded iso view (skipped via " +
      "include_exploded_sheet=false). After save, runs a quality audit and returns a quality_report block " +
      "with a 0-100 score and warnings (missing PartNumbers, BOM/balloon mismatches, missing drawing " +
      "properties, suppressed components). Returns a step-by-step result with assembly_inventory, " +
      "bom_result, balloon_result, exploded_sheet_result, quality_report, and a features_pending list " +
      "(section_views still pending). For PART drawings (.sldprt) call sw_generate_drawing instead.",
    input_schema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Full Windows path to the .sldasm." },
        output_path:   { type: "string", description: "Full Windows path where the .slddrw should be saved (extension added if missing)." },
        template_path: { type: "string", description: "Optional .drwdot template. An assembly template is recommended but any drawing template works." },
        paper_size:    { type: "string", enum: ["A", "B", "C", "D", "E"], description: "ANSI paper size. Default A." },
        include_front: { type: "boolean", description: "Insert a front orientation view alongside the iso. Default true." },
        include_bom:   { type: "boolean", description: "Insert a Bill of Materials table. Default true." },
        bom_type:      { type: "string",  enum: ["top_level", "parts_only", "indented"], description: "Default 'top_level'. Use 'indented' for multi-level assemblies." },
        bom_anchor:    { type: "string",  enum: ["top_right", "top_left", "bottom_right", "bottom_left"], description: "BOM corner placement. Default 'top_right'." },
        include_balloons: { type: "boolean", description: "Auto-place balloons on the iso view. Default true." },
        balloon_layout:   { type: "string",  enum: ["square", "circular", "top", "bottom", "left", "right"], description: "Balloon arrangement. Default 'square'." },
        include_exploded_sheet: { type: "boolean", description: "Add a second sheet with the assembly's exploded iso view. Default true. Skipped silently if the assembly has no exploded view (the iso view still gets inserted on the second sheet, just collapsed)." },
        exploded_sheet_name:    { type: "string",  description: "Name for the second sheet. Default 'Exploded View'." },
        properties:    { type: "object", description: "Custom properties to set on the assembly. Recommended keys: Description, AssemblyNumber, Revision, DrawnBy." },
      },
      required: ["assembly_path", "output_path"],
    },
  },
  {
    name: "sw_analyze_assembly_geometry",
    description:
      "Read-only geometry analysis of an assembly file (.sldasm). Returns a JSON inventory: bounding box, " +
      "primary axis, and component statistics (total instances, unique part files, sub-assembly count + max depth, " +
      "flexible components, components using non-default configurations). " +
      "Use after sw_get_assembly_readiness to give the user a structural summary, or as input data " +
      "when generating an assembly drawing (BOM row count, view scaling, multi-sheet decisions).",
    input_schema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Full Windows path to the .sldasm." },
      },
      required: ["assembly_path"],
    },
  },
  {
    name: "sw_get_assembly_readiness",
    description:
      "Inspects an assembly file (.sldasm) WITHOUT modifying it. Returns a JSON report: missing top-level " +
      "custom properties (Description, AssemblyNumber, Revision, DrawnBy), component health (count, suppressed, " +
      "missing-on-disk, missing-PartNumber list), configuration names + exploded-view presence, and mate counts. " +
      "Call this BEFORE attempting to generate an assembly drawing. Routes by file extension: " +
      "use sw_get_part_readiness for .sldprt files, this for .sldasm files.",
    input_schema: {
      type: "object",
      properties: {
        assembly_path: { type: "string", description: "Full Windows path to the .sldasm." },
      },
      required: ["assembly_path"],
    },
  },
  {
    name: "sw_get_part_readiness",
    description:
      "Inspects a part file WITHOUT modifying it and returns a JSON readiness report: missing properties, " +
      "material status, DimXpert presence, default-named features, and an overall score (0-100). " +
      "Call BEFORE sw_generate_drawing if the user wants a quality check, or to explain why a drawing has gaps.",
    input_schema: {
      type: "object",
      properties: {
        part_path: { type: "string", description: "Full Windows path to the .sldprt." },
      },
      required: ["part_path"],
    },
  },
  {
    name: "sw_auto_annotate",
    description:
      "Adds center marks and hole callouts to every model view in the active drawing. " +
      "Run after inserting views and model annotations. " +
      "Center marks are always added; pass hole_callouts=false to skip callouts.",
    input_schema: {
      type: "object",
      properties: {
        center_marks:  { type: "boolean", description: "Insert center marks on circular edges. Default true." },
        hole_callouts: { type: "boolean", description: "Insert hole callout annotations. Default true." },
      },
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
  sw_auto_annotate:   "sw.auto_annotate",
  sw_get_part_readiness:    "sw.get_part_readiness",
  sw_analyze_part_geometry: "sw.analyze_part_geometry",
  sw_add_section_view:        "sw.add_section_view",
  sw_get_assembly_readiness:    "sw.get_assembly_readiness",
  sw_analyze_assembly_geometry: "sw.analyze_assembly_geometry",
  sw_generate_assembly_drawing: "sw.generate_assembly_drawing",
  sw_add_bom_table:             "sw.add_bom_table",
  sw_add_auto_balloons:         "sw.add_auto_balloons",
  sw_add_exploded_view_sheet:           "sw.add_exploded_view_sheet",
  sw_analyze_assembly_drawing_quality:  "sw.analyze_assembly_drawing_quality",
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
- Always confirm success and tell the user where the drawing was saved
- sw_generate_drawing automatically adds center marks and hole callouts (via auto_annotate step) — no need to call sw_auto_annotate separately unless the user asks to re-run annotation on an existing drawing
- Hole callouts are placed only on orthographic views (front/top/right) per drafting standards — never on isometric views

PARTIAL FAILURE RECOVERY:
sw_generate_drawing returns a result object with both "steps" (what succeeded) and "step_errors" (what failed). It always tries to save the drawing at the end, even if individual steps failed. If you see step_errors in the response:
- Look at which step(s) failed. Common ones: insert_annotations, auto_annotate.
- If insert_annotations failed but the drawing was saved, call sw_insert_model_annotations to retry adding dimensions on the existing drawing.
- If auto_annotate failed, call sw_auto_annotate explicitly to retry center marks + hole callouts.
- After retrying missed steps, call sw_save_drawing_as again to persist the additions.
- Report exactly what was added vs. what was skipped — don't claim "annotations added" if step_errors shows insert_annotations failed.

If the entire sw_generate_drawing call returns an error (not a partial result), check sw_get_active_doc_info to see if a drawing was created. If yes, recover by calling sw_insert_model_annotations + sw_auto_annotate + sw_save_drawing_as in sequence on the active drawing.

PART READINESS:
sw_get_part_readiness inspects a part without modifying it and returns a quality score (0-100) plus warnings about missing custom properties, missing material, missing DimXpert, and default-named features. If the user asks why a drawing has gaps (empty title block, no dimensions, etc.) call this tool to explain. Mention low scores in your response so users know which drawings need manual cleanup.

FILE TYPE ROUTING:
SOLIDWORKS uses three model file extensions. Route tool calls strictly by extension — DO NOT cross-call:
- .sldprt → part. Use sw_get_part_readiness, sw_analyze_part_geometry, sw_generate_drawing.
- .sldasm → assembly. Use sw_get_assembly_readiness, sw_analyze_assembly_geometry, sw_generate_assembly_drawing.
- .slddrw → existing drawing. Operate on it directly with sw_insert_model_annotations, sw_auto_annotate, sw_save_drawing_as, etc.

ASSEMBLY DRAWING SCOPE (sw_generate_assembly_drawing):
The assembly drawing flow produces a multi-sheet drawing. Sheet 1: iso view (primary, prominent), optional front view, BOM table (top-level, top-right by default), and auto-balloons on the iso view (one per UNIQUE component, square layout). Sheet 2: exploded iso view of the assembly. After save, Sheet 1 is re-activated so the user opens to the primary sheet. Inspect FOUR result blocks in the response: bom_result, balloon_result, exploded_sheet_result, and quality_report. Surface any success=false errors verbatim. Common failures:
- bom_result: source view doesn't reference an assembly, or template has no BOM anchor and fallback positioning failed.
- balloon_result: source view didn't activate, AutoBalloon5 returned null (usually means the iso view has no components), or CreateAutoBalloonOptions unavailable.
- exploded_sheet_result with success=true but exploded=false: the assembly has no exploded view defined for the active configuration. The second sheet still has a (collapsed) iso view; tell the user they can either define an exploded view in the assembly and re-run sw_add_exploded_view_sheet, or pass include_exploded_sheet=false next time to skip it.
QUALITY REPORT: quality_report is the most important block to read aloud. Fields:
- score (0-100): overall drawing quality.
- warnings: array of human-readable issues. Read these to the user verbatim — they're already phrased for an end user.
- components_missing_part_number: list of component names whose BOM rows will render blank. If non-empty, suggest the user fix PartNumber in those components and re-run sw_analyze_assembly_drawing_quality to re-score.
- balloon_bom_mismatch: |bom_row_count - balloon_count|. >0 usually means balloons need a re-run via sw_add_auto_balloons with a different source_view, or the BOM was inserted on the wrong view.
- drawing_properties_missing: top-level title-block fields that are blank.
Pending feature in features_pending: section_views (user-triggered via sw_add_section_view).

SECTION VIEWS (EXPERIMENTAL — parts and assemblies):
sw_generate_drawing's response includes part_inventory.internal_features.has_internal_features. When this is true, the part has Cut-Extrude / Cut-Revolve / Shell features that may not be fully visible from standard ortho views. DO NOT auto-add a section view — sw_add_section_view is experimental and may fail. Instead:
1. After generation, mention to the user that the part has internal features (cite the counts)
2. Ask if they'd like a section view added
3. Only if they confirm, call sw_add_section_view (default args usually work for a basic horizontal cut on the front view)
4. If sw_add_section_view returns success=false, surface the error verbatim — do not retry. The user may need to add the section view manually.
ASSEMBLIES: same flow but pass excluded_components when the user wants to keep certain parts intact in the section (e.g., fasteners, gaskets — anything that shouldn't be cut). Component names must match Component2.Name2 exactly (case-insensitive). Names not found in the assembly are returned in excluded_not_found — read those back to the user as a hint that they may have typo'd a component name.`;
