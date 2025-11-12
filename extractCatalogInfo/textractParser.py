import json
import pandas as pd
from collections import defaultdict
from typing import List, Dict, Any


def load_textract_pages(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    # Some folks save a single dict; others save a list of pages. Normalize:
    if isinstance(data, dict) and "Blocks" in data:
        return [data]
    elif isinstance(data, list):
        return data
    else:
        raise ValueError("Unexpected JSON structure – expected a list of responses or a single response with Blocks.")


def convert_pages_to_blocks(pages):
    """Flatten and return all Blocks from a list of Textract page responses."""
    all_blocks = []
    for part in pages:
        all_blocks.extend(part.get("Blocks", []))
    return all_blocks


def build_block_maps(blocks: List[Dict[str, Any]]):
    """Return dicts for quick lookup by Id and by BlockType."""
    id_map = {}
    type_map = defaultdict(list)
    for b in blocks:
        bid = b.get("Id")
        if bid:
            id_map[bid] = b
        type_map[b.get("BlockType","")].append(b)
    return id_map, type_map


def get_text_for_block(block: Dict[str,Any], id_map: Dict[str,Any]) -> str:
    """Collect WORD/SELECTION_ELEMENT text under a LINE or CELL, etc."""
    text = []
    for rel in block.get("Relationships", []):
        if rel.get("Type") == "CHILD":
            for cid in rel.get("Ids", []):
                child = id_map.get(cid)
                if not child: 
                    continue
                if child.get("BlockType") == "WORD":
                    text.append(child.get("Text",""))
                elif child.get("BlockType") == "SELECTION_ELEMENT":
                    if child.get("SelectionStatus") == "SELECTED":
                        text.append("[X]")
    return " ".join(text).strip()

    
def _collect_cells_for_table(tblock, id_map):
    """Return list of CELLs, and MERGED_CELLs (if any) for this table."""
    cells, merged = [], []
    for rel in tblock.get("Relationships", []):
        rel_type = rel.get("Type")
        # CELLs are linked via CHILD relationship
        if rel_type == "CHILD":
            for cid in rel.get("Ids", []):
                b = id_map.get(cid)
                if not b: 
                    continue
                bt = b.get("BlockType")
                if bt == "CELL":
                    cells.append(b)
        # MERGED_CELLs are linked via MERGED_CELL relationship (not CHILD)
        elif rel_type == "MERGED_CELL":
            for cid in rel.get("Ids", []):
                b = id_map.get(cid)
                if not b:
                    continue
                if b.get("BlockType") == "MERGED_CELL":
                    merged.append(b)
    return cells, merged

def convert_table_block_to_grid(tblock, id_map, replicate_data=True, header_scan_rows=5):
    """
    Converts an Amazon Textract TABLE block and its block map into a normalized tabular structure.

    Args:
        tblock (dict): A TABLE block from Textract response.
        id_map (dict): Dictionary mapping block Ids to blocks for lookup.
        replicate_data (bool): If True, replicate merged cell values across all spanned positions.
        header_scan_rows (int): Number of top rows to consider when inferring and composing multilevel headers.

    Returns:
        dict: {
            "page": page number (int or None),
            "headers": list of str: column headers (auto-joined if multirow header),
            "rows": list of list of str: body rows (header rows excluded),
            "spans": list of list of tuple: span info for each cell as (row_span, col_span),
        }

    Detailed behavior:
        - Handles merged cells (MERGED_CELL blocks) and normal CELL blocks,
        - Attempts data replication for merged/spanned cells if replicate_data=True,
        - Detects a header band (possibly multirow) by cell-value density and composes hierarchical headers using " / " separator,
        - Returns only body rows (not header rows).
    """
    page = tblock.get("Page", None)
    cells, merged_cells = _collect_cells_for_table(tblock, id_map)

    # Compute table shape (max row/col index considering spans, 1-based indices)
    max_row = max((c.get("RowIndex", 0) + c.get("RowSpan", 1) - 1) for c in cells) if cells else 0
    max_col = max((c.get("ColumnIndex", 0) + c.get("ColumnSpan", 1) - 1) for c in cells) if cells else 0

    # Create empty grid & span holders (0-based indices)
    grid = [["" for _ in range(max_col)] for _ in range(max_row)]
    spans = [[(1,1) for _ in range(max_col)] for _ in range(max_row)]
    is_header_row = [False]*max_row

    # --- Step 1: Gather explicit merged cell regions and their text ---
    merged_regions = {}  # (row_start, col_start, row_span, col_span) -> text
    for m in merged_cells:
        child_ids = []
        for rel in m.get("Relationships", []):
            if rel.get("Type") == "CHILD":
                child_ids.extend(rel.get("Ids", []))
        child_cells = [id_map[i] for i in child_ids if id_map.get(i) and id_map[i].get("BlockType")=="CELL"]
        if not child_cells:
            continue
        r_indices, c_indices = [], []
        for cc in child_cells:
            ri = cc.get("RowIndex", 1)-1
            ci = cc.get("ColumnIndex", 1)-1
            rs = cc.get("RowSpan", 1)
            cs = cc.get("ColumnSpan", 1)
            r_indices.extend(range(ri, ri+rs))
            c_indices.extend(range(ci, ci+cs))
        r0, c0 = min(r_indices), min(c_indices)
        rs = max(r_indices) - r0 + 1
        cs = max(c_indices) - c0 + 1

        # Prefer string from MERGED_CELL block itself, else any of its children
        txt = get_text_for_block(m, id_map)
        if not txt or not txt.strip():
            for cc in child_cells:
                txt = get_text_for_block(cc, id_map)
                if txt and txt.strip():
                    break
        if txt and txt.strip():
            merged_regions[(r0, c0, rs, cs)] = txt.strip()

    # --- Step 2: Populate grid with regular cell values, and collect span info ---
    cell_spans = {}  # (row,col) -> (rs,cs)
    for c in cells:
        r0 = c.get("RowIndex", 1)-1
        c0 = c.get("ColumnIndex", 1)-1
        rs = c.get("RowSpan", 1)
        cs = c.get("ColumnSpan", 1)
        cell_spans[(r0, c0)] = (rs, cs)
        spans[r0][c0] = (rs, cs)
        txt = get_text_for_block(c, id_map)
        if txt and txt.strip():
            grid[r0][c0] = txt.strip()

    # --- Step 3: Copy merged region values over all spanned cells in merged area ---
    for (r0, c0, rs, cs), txt in merged_regions.items():
        for rr in range(r0, r0+rs):
            for cc in range(c0, c0+cs):
                grid[rr][cc] = txt
                spans[rr][cc] = (rs, cs)

    # --- Step 4: If enabled, replicate text data across ALL span regions (merged and explicit) ---
    span_regions = {}
    if replicate_data:
        # 4a. Build up all explicit regions (merged & spanned normal cells)
        for (r0, c0), (rs, cs) in cell_spans.items():
            if rs > 1 or cs > 1:
                span_regions[(r0, c0, rs, cs)] = set((rr, cc)
                    for rr in range(r0, r0+rs) for cc in range(c0, c0+cs))
        for (r0, c0, rs, cs) in merged_regions.keys():
            span_regions[(r0, c0, rs, cs)] = set((rr, cc)
                    for rr in range(r0, r0+rs) for cc in range(c0, c0+cs))

        # 4b. Map position to original CELL block for getting text
        position_to_cell = {}
        for (r0, c0), (rs, cs) in cell_spans.items():
            for rr in range(r0, r0+rs):
                for cc in range(c0, c0+cs):
                    for c in cells:
                        cr0 = c.get("RowIndex", 1)-1
                        cc0 = c.get("ColumnIndex", 1)-1
                        crs = c.get("RowSpan", 1)
                        ccs = c.get("ColumnSpan", 1)
                        if cr0 <= rr < cr0+crs and cc0 <= cc < cc0+ccs:
                            position_to_cell[(rr, cc)] = c
                            break

        # 4c. For each region, combine all text, deduplicating, and replicate
        for (r0, c0, rs, cs), positions in span_regions.items():
            text_parts = []
            seen_text = set()
            for (rr, cc) in positions:
                cell_block = position_to_cell.get((rr, cc))
                cell_text = None
                if cell_block:
                    cell_text = get_text_for_block(cell_block, id_map)
                if (not cell_text or not cell_text.strip()) and grid[rr][cc]:
                    cell_text = grid[rr][cc]
                if cell_text and cell_text.strip():
                    text_stripped = cell_text.strip()
                    if text_stripped not in seen_text:
                        text_parts.append(text_stripped)
                        seen_text.add(text_stripped)
            if text_parts:
                joined_text = " ".join(text_parts)
                for (rr, cc) in positions:
                    grid[rr][cc] = joined_text

    # --- Step 5: Detect header region via row value density, and compose multirow headers ---
    densities = [sum(1 for x in row if x.strip()) for row in grid[:min(header_scan_rows, max_row)]]
    header_end = 0
    for i in range(len(densities)):
        header_end = i
        if i > 0 and densities[i] <= max(1, densities[i-1]//2):
            break
    header_rows = list(range(0, header_end+1))
    for r in header_rows:
        is_header_row[r] = True
    headers = []
    for c in range(max_col):
        parts = []
        for r in header_rows:
            t = grid[r][c].strip()
            if t and (not parts or t.lower() != parts[-1].lower()):
                parts.append(t)
        header = " / ".join(parts) if parts else f"col_{c+1}"
        headers.append(header)

    # --- Step 6: Heuristic: replicate down "grouped" values even if Textract missed explicit merges ---
    if replicate_data:
        covered_positions = set()
        for (r0, c0, rs, cs) in span_regions.keys():
            for rr in range(r0, r0+rs):
                for cc in range(c0, c0+cs):
                    covered_positions.add((rr, cc))
        data_start_row = min(header_scan_rows + 1, max_row)
        for col in range(max_col):
            row = data_start_row
            while row < max_row:
                if (row, col) in covered_positions:
                    row += 1
                    continue
                if grid[row][col] and grid[row][col].strip():
                    value = grid[row][col]
                    group_start = row
                    text_parts = [value.strip()]
                    row += 1
                    group_positions = [(group_start, col)]
                    while row < max_row:
                        if (row, col) in covered_positions:
                            break
                        if grid[row][col] and grid[row][col].strip():
                            break
                        group_positions.append((row, col))
                        row += 1
                    if len(group_positions) > 1:
                        for (rr, cc) in group_positions[1:]:
                            if grid[rr][cc] and grid[rr][cc].strip():
                                text_parts.append(grid[rr][cc].strip())
                        if text_parts:
                            joined_text = " ".join(text_parts)
                            for (rr, cc) in group_positions:
                                grid[rr][cc] = joined_text
                else:
                    row += 1

    body_rows = [grid[r] for r in range(max_row) if not is_header_row[r]]
    return {
        "page": page,
        "headers": headers,
        "rows": body_rows,
        "spans": spans,
    }


def convert_grid_result_to_dataframe(grid_result, include_page_column=False):
    """
    Convenience function: Load table grid result as a pandas DataFrame.

    Args:
        grid_result (dict): Output from convert_table_block_to_grid().
        include_page_column (bool): If True, include 'page' integer as a DataFrame column.

    Returns:
        pd.DataFrame: Table data, headers as DataFrame columns. Optionally with a 'page' column.
    """
    import pandas as pd
    headers = grid_result["headers"]
    rows = grid_result["rows"]
    df = pd.DataFrame(rows, columns=headers)
    if include_page_column:
        df.insert(0, "page", grid_result.get("page"))
    return df


def get_special_cells_texts(tblock: Dict[str, Any], id_map: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Extract text from all special cell types for a specific table block.
    
    Args:
        tblock: A TABLE block from Textract response.
        id_map: Dictionary mapping block Ids to blocks for lookup.
    
    Returns:
        Dictionary with keys for each special cell type, containing lists of dicts with:
        {
            "text": str,
            "page": int or None,
            "block_id": str,
            "row_index": int or None (for CELL blocks),
            "column_index": int or None (for CELL blocks)
        }
        
        Keys: "TABLE_TITLE", "TABLE_FOOTER", "TABLE_SECTION_TITLE", 
              "COLUMN_HEADER", "TABLE_SUMMARY"
    """
    # Target special cell types
    special_types = {
        "TABLE_TITLE": [],
        "TABLE_FOOTER": [],
        "TABLE_SECTION_TITLE": [],
        "COLUMN_HEADER": [],
        "TABLE_SUMMARY": []
    }
    
    page = tblock.get("Page", None)
    
    # Check table relationships for special block types (e.g., TABLE_TITLE, TABLE_FOOTER)
    for rel in tblock.get("Relationships", []):
        rel_type = rel.get("Type")
        if rel_type in special_types:
            for block_id in rel.get("Ids", []):
                block = id_map.get(block_id)
                if block:
                    text = get_text_for_block(block, id_map)
                    if text and text.strip():
                        special_types[rel_type].append({
                            "text": text.strip(),
                            "page": block.get("Page", page),
                            "block_id": block_id,
                            "row_index": None,
                            "column_index": None
                        })
    
    # Get all cells for this table
    cells, merged_cells = _collect_cells_for_table(tblock, id_map)
    
    # Check CELL blocks for EntityTypes matching special types
    for cell in cells:
        entity_types = cell.get("EntityTypes", [])
        for entity_type in entity_types:
            if entity_type in special_types:
                text = get_text_for_block(cell, id_map)
                if text and text.strip():
                    special_types[entity_type].append({
                        "text": text.strip(),
                        "page": cell.get("Page", page),
                        "block_id": cell.get("Id", ""),
                        "row_index": cell.get("RowIndex"),
                        "column_index": cell.get("ColumnIndex")
                    })
    
    # Also check MERGED_CELL blocks for EntityTypes
    for merged_cell in merged_cells:
        entity_types = merged_cell.get("EntityTypes", [])
        for entity_type in entity_types:
            if entity_type in special_types:
                text = get_text_for_block(merged_cell, id_map)
                if text and text.strip():
                    # For merged cells, try to get position from child cells
                    row_index = None
                    column_index = None
                    for rel in merged_cell.get("Relationships", []):
                        if rel.get("Type") == "CHILD":
                            for cid in rel.get("Ids", []):
                                child = id_map.get(cid)
                                if child and child.get("BlockType") == "CELL":
                                    row_index = child.get("RowIndex")
                                    column_index = child.get("ColumnIndex")
                                    break
                            if row_index is not None:
                                break
                    
                    special_types[entity_type].append({
                        "text": text.strip(),
                        "page": merged_cell.get("Page", page),
                        "block_id": merged_cell.get("Id", ""),
                        "row_index": row_index,
                        "column_index": column_index
                    })
    
    return special_types


def get_header_row_count(column_headers: List[Dict[str, Any]]) -> int:
    """
    Calculate the number of header rows based on COLUMN_HEADER cells.
    
    The function finds the maximum row_index among COLUMN_HEADER cells, which
    indicates how many rows the header spans. Textract uses 1-based indexing
    for RowIndex, so if the max row_index is 3, there are 3 header rows.
    
    Args:
        special_cells: Dictionary returned from get_special_cells_texts().
    
    Returns:
        int: Number of header rows (0 if no COLUMN_HEADER cells found).
    
    Examples:
        >>> special_cells = {
        ...     "COLUMN_HEADER": [
        ...         {"row_index": 1, "text": "Name"},
        ...         {"row_index": 2, "text": "Price"},
        ...         {"row_index": 3, "text": "Description"}
        ...     ]
        ... }
        >>> get_header_row_count(special_cells)
        3
        
        >>> special_cells = {"COLUMN_HEADER": []}
        >>> get_header_row_count(special_cells)
        0
    """
    fallback_row_count = 2
    if not column_headers:
        return fallback_row_count
    
    # Extract row_index values, filtering out None values
    row_indices = [
        cell.get("row_index") 
        for cell in column_headers 
        if cell.get("row_index") is not None
    ]
    
    if not row_indices:
        return fallback_row_count
    
    # Return the maximum row_index (1-based, so max row_index = number of header rows)
    return max(row_indices)


def has_ordering_number_header(headers):
    """
    Check if headers contain an ordering number column and return its index.
    
    Args:
        headers: List of header strings.
    
    Returns:
        int or None: Column index (0-based) if found, None otherwise.
    """
    # Normalize to lower-case, remove common non-alpha chars, for fuzzy matching
    norm = lambda s: ''.join(c.lower() for c in s if c.isalnum() or c.isspace())
    for idx, h in enumerate(headers):
        hn = norm(h)
        # Look for "ordering" and "number" close to each other
        if "ordering" in hn and "number" in hn:
            return idx
        # Some catalogs may use just "ordering", or "order number"
        if "order" in hn and "number" in hn:
            return idx
        # Accept "ordering#" or "ordering no."
        if "ordering" in hn and ("no" in hn or "#" in hn):
            return idx
    return None


def convert_grid_to_catalog_products(
    grid_result: Dict[str, Any], 
    tblock: Dict[str, Any] = None, 
    id_map: Dict[str, Any] = None,
    tindex: int = None
) -> Dict[str, Dict[str, Any]]:
    """
    Convert table grid result to catalog products dictionary keyed by ordering number.
    
    This function takes the output from convert_table_block_to_grid() and converts it
    into a format suitable for the UI catalog review page. The result is a dictionary
    where keys are ordering numbers and values are product objects.
    
    Args:
        grid_result: Dictionary from convert_table_block_to_grid() with keys:
            - "headers": list of column header strings
            - "rows": list of data rows (each row is a list of cell values)
            - "page": page number (optional)
            - "spans": span information (optional)
        tblock: Optional TABLE block from Textract. Required for location information.
        id_map: Optional dictionary mapping block Ids to blocks. Required for location information.
        tindex: Optional index of the table block in the table blocks list. Required for location information.
    
    Returns:
        Dictionary mapping ordering numbers to product objects:
        {
            "PN-12345": {
                "id": int (auto-generated),
                "orderingNumber": "PN-12345",
                "specs": {
                    "Header Name": "Cell Value",
                    ...
                },
                "location": {
                    "page": int,
                    "boundingBox": {
                        "left": float (0-1, relative to page width),
                        "top": float (0-1, relative to page height),
                        "width": float (0-1, relative to page width),
                        "height": float (0-1, relative to page height)
                    }
                }
            },
            ...
        }
        
        Note: Empty fields (specs, location) are omitted from the output.
    
    The function:
    1. Identifies the ordering number column (using has_ordering_number_header)
    2. Converts all other columns to specs as an object (column header as key, cell value as value)
    3. Uses ordering number as the dictionary key
    4. Auto-generates sequential IDs for each product
    5. Includes location information with PDF bounding box coordinates if tblock and id_map provided
    6. Omits empty fields (specs, location) from the output
    
    Examples:
        >>> grid = {
        ...     "headers": ["Ordering Number", "Pressure", "Material"],
        ...     "rows": [
        ...         ["PN-123", "1000psi", "SS316"],
        ...         ["PN-456", "500psi", "Aluminum"]
        ...     ],
        ...     "page": 2
        ... }
        >>> products = convert_grid_to_catalog_products(grid, tblock, id_map)
        >>> products["PN-123"]["specs"]
        {'Pressure': '1000psi', 'Material': 'SS316'}
        >>> products["PN-123"]["location"]["boundingBox"]
        {'left': 0.1, 'top': 0.2, 'width': 0.15, 'height': 0.02}
    """
    headers = grid_result.get("headers", [])
    rows = grid_result.get("rows", [])
    page = grid_result.get("page", None)
    
    if not headers or not rows:
        return {}
    
    # Find ordering number column index
    ordering_col_idx = has_ordering_number_header(headers)
    
    if ordering_col_idx is None:
        # If no ordering number column found, return empty dict
        return {}
    
    # Identify spec columns (all columns except ordering number)
    spec_column_indices = []
    for idx, header in enumerate(headers):
        if idx != ordering_col_idx:
            spec_column_indices.append(idx)
    
    # Build a mapping from (row_index, col_index) to cell for location lookup
    # We need to find which Textract column index corresponds to the ordering column
    cell_position_map = {}
    if tblock and id_map:
        cells, _ = _collect_cells_for_table(tblock, id_map)
        # Find the Textract column index that corresponds to our ordering column
        # We'll match by finding cells in the first data row that match the ordering numbers
        # First, build a map of all cells by their position
        for cell in cells:
            cell_row = cell.get("RowIndex")
            cell_col = cell.get("ColumnIndex")
            cell_text = get_text_for_block(cell, id_map).strip()
            if cell_row and cell_col:
                cell_position_map[(cell_row, cell_col)] = {
                    "rowIndex": cell_row,
                    "columnIndex": cell_col,
                    "text": cell_text,
                    "cell": cell
                }
    
    products = {}
    product_id_counter = 1
    
    for row_idx, row in enumerate(rows):
        # Skip empty rows
        if not row or all(not str(cell).strip() for cell in row):
            continue
        
        # Extract ordering number
        ordering_number = str(row[ordering_col_idx]).strip() if ordering_col_idx < len(row) else ""
        
        # Skip rows without ordering number
        if not ordering_number:
            continue
        
        # Build specs as object (column header as key, cell value as value)
        specs = {}
        for spec_col_idx in spec_column_indices:
            if spec_col_idx < len(row):
                spec_key = headers[spec_col_idx].strip()
                spec_value = str(row[spec_col_idx]).strip()
                # Only add spec if both key and value are non-empty
                if spec_key and spec_value:
                    specs[spec_key] = spec_value
        
        # Get location information with PDF coordinates
        location = None
        if tblock and id_map and cell_position_map:
            # Find the cell that matches this ordering number
            matching_cell_info = None
            for (cell_row, cell_col), cell_info in cell_position_map.items():
                if cell_info["text"] == ordering_number:
                    matching_cell_info = cell_info
                    break
            
            if matching_cell_info and matching_cell_info.get("cell"):
                cell = matching_cell_info["cell"]
                geometry = cell.get("Geometry", {})
                bounding_box = geometry.get("BoundingBox", {})
                
                # Extract bounding box coordinates for PDF preview
                if bounding_box:
                    location = {
                        "page": page,
                        "boundingBox": {
                            "left": bounding_box.get("Left", 0),
                            "top": bounding_box.get("Top", 0),
                            "width": bounding_box.get("Width", 0),
                            "height": bounding_box.get("Height", 0)
                        }
                    }
        
        if not location and page is not None:
            # Fallback: use page only (no coordinates available)
            location = {
                "page": page
            }
        
        # Create product object (only include non-empty fields)
        product = {
            "id": product_id_counter,
            "orderingNumber": ordering_number
        }
        
        # Only add specs if not empty
        if specs:
            product["specs"] = specs
        
        # Only add location if available
        if location:
            product["location"] = location

        if tindex:
            product["tindex"] = tindex
        
        products[ordering_number] = product
        
        product_id_counter += 1
    
    return products