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