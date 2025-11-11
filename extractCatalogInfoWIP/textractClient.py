import boto3
import json
import os
import csv
from collections import defaultdict
from typing import List, Dict, Any, Tuple

def start_job(bucket, document, features=['TABLES','FORMS'], region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.start_document_analysis(
        DocumentLocation={'S3Object': {'Bucket': bucket, 'Name': document}},
        FeatureTypes=features
    )
    job_id = response['JobId']
    print(f"Started job with JobId: {job_id}")
    return job_id

def is_job_complete(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    response = client.get_document_analysis(JobId=job_id)
    status = response['JobStatus']
    print(f"Job status: {status}")
    return status

def get_job_results(job_id, region='us-east-1'):
    client = boto3.client('textract', region_name=region)
    pages = []
    next_token = None

    while True:
        if next_token:
            response = client.get_document_analysis(JobId=job_id, NextToken=next_token)
        else:
            response = client.get_document_analysis(JobId=job_id)
        pages.append(response)
        print(f"Retrieved {len(response.get('Blocks', []))} blocks on this page.")
        next_token = response.get('NextToken')
        if not next_token:
            break
        print("Fetching next page of results...")
    return pages

def save_results_to_file(pages, out_filename='textract_output.json'):
    # if you want to save full list of pages into one file:
    with open(out_filename, 'w', encoding='utf-8') as f:
        json.dump(pages, f, indent=2)
    print(f"Saved results to {out_filename}")








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

import re
from collections import defaultdict

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

def extract_tables_from_blocks_unmerged(blocks, replicate_data=True, header_scan_rows=5):
    """
    Build span-aware grids and unmerge merged cells.
    - replicate_data=True: copy merged cell values across spanned columns in data rows.
    - header_scan_rows: how many top rows to consider when building composite headers.
    Returns: [{page, table_index, headers, rows, spans}]
    """
    # Build maps
    id_map, type_map = build_block_maps(blocks)

    out = []
    for t_index, tblock in enumerate(type_map.get("TABLE", []), start=1):
        page = tblock.get("Page", None)

        cells, merged_cells = _collect_cells_for_table(tblock, id_map)

        # Compute table size considering spans
        max_row = max((c.get("RowIndex", 0) + c.get("RowSpan", 1) - 1) for c in cells) if cells else 0
        max_col = max((c.get("ColumnIndex", 0) + c.get("ColumnSpan", 1) - 1) for c in cells) if cells else 0

        # Init grid + span holders
        grid = [["" for _ in range(max_col)] for _ in range(max_row)]
        spans = [[(1,1) for _ in range(max_col)] for _ in range(max_row)]
        is_header_row = [False]*max_row  # we'll guess header band later

        # Step 1: Process MERGED_CELLs first to establish merged regions and find their text
        # Build a map of merged regions: (r0, c0, rs, cs) -> text_value
        merged_regions = {}  # key: (r0, c0, rs, cs), value: text
        
        for m in merged_cells:
            # Textract links MERGED_CELL -> CHILD -> CELL ids
            child_ids = []
            for rel in m.get("Relationships", []):
                if rel.get("Type") == "CHILD":
                    child_ids.extend(rel.get("Ids", []))
            child_cells = [id_map[i] for i in child_ids if id_map.get(i) and id_map[i].get("BlockType")=="CELL"]
            if not child_cells:
                continue
            
            # Compute merged area boundaries
            r_indices = []
            c_indices = []
            for cc in child_cells:
                ri = cc.get("RowIndex", 1)-1
                ci = cc.get("ColumnIndex", 1)-1
                rs = cc.get("RowSpan", 1)
                cs = cc.get("ColumnSpan", 1)
                r_indices.extend(list(range(ri, ri+rs)))
                c_indices.extend(list(range(ci, ci+cs)))
            
            r0, c0 = min(r_indices), min(c_indices)
            rs = max(r_indices) - r0 + 1
            cs = max(c_indices) - c0 + 1
            
            # Try to get text from MERGED_CELL block first, then from any child cell
            txt = get_text_for_block(m, id_map)
            if not txt or not txt.strip():
                # Search through all child cells to find where the text actually is
                for cc in child_cells:
                    txt = get_text_for_block(cc, id_map)
                    if txt and txt.strip():
                        break
            
            if txt and txt.strip():
                merged_regions[(r0, c0, rs, cs)] = txt.strip()
        
        # Step 2: Process all CELLs and place their text
        # Also track which cells are part of merged regions
        cell_spans = {}  # key: (r0, c0), value: (rs, cs)
        
        for c in cells:
            r0 = c.get("RowIndex", 1)-1
            c0 = c.get("ColumnIndex", 1)-1
            rs = c.get("RowSpan", 1)
            cs = c.get("ColumnSpan", 1)
            
            # Store span information
            cell_spans[(r0, c0)] = (rs, cs)
            spans[r0][c0] = (rs, cs)
            
            # Get text for this cell
            txt = get_text_for_block(c, id_map)
            if txt and txt.strip():
                grid[r0][c0] = txt.strip()
        
        # Step 3: Apply merged region text to all positions in the merged area
        for (r0, c0, rs, cs), txt in merged_regions.items():
            for rr in range(r0, r0+rs):
                for cc in range(c0, c0+cs):
                    grid[rr][cc] = txt
                    spans[rr][cc] = (rs, cs)
        
        # Step 4: If replicate_data=True, replicate text across all spans
        # For each cell with a span, collect text from ALL cells within that span, join them, and replicate
        span_regions = {}  # key: (r0, c0, rs, cs), value: set of (r, c) positions
        
        if replicate_data:
            # Create a map of span regions: (r0, c0, rs, cs) -> set of all cells in that span
            
            # Process regular cells with spans
            for (r0, c0), (rs, cs) in cell_spans.items():
                if rs > 1 or cs > 1:  # Only process cells that actually span
                    # Collect all positions in this span
                    positions = set()
                    for rr in range(r0, r0+rs):
                        for cc in range(c0, c0+cs):
                            positions.add((rr, cc))
                    span_regions[(r0, c0, rs, cs)] = positions
            
            # Process merged regions
            for (r0, c0, rs, cs) in merged_regions.keys():
                positions = set()
                for rr in range(r0, r0+rs):
                    for cc in range(c0, c0+cs):
                        positions.add((rr, cc))
                span_regions[(r0, c0, rs, cs)] = positions
            
            # For each span region, collect text from ALL cells within it, join, and replicate
            # Build a map of position -> original cell block for text extraction
            position_to_cell = {}
            for (r0, c0), (rs, cs) in cell_spans.items():
                for rr in range(r0, r0+rs):
                    for cc in range(c0, c0+cs):
                        # Find the original cell block for this position
                        for c in cells:
                            cr0 = c.get("RowIndex", 1)-1
                            cc0 = c.get("ColumnIndex", 1)-1
                            crs = c.get("RowSpan", 1)
                            ccs = c.get("ColumnSpan", 1)
                            if cr0 <= rr < cr0 + crs and cc0 <= cc < cc0 + ccs:
                                position_to_cell[(rr, cc)] = c
                                break
            
            for (r0, c0, rs, cs), positions in span_regions.items():
                # Collect all text values from ORIGINAL cell blocks within this span (not from grid)
                text_parts = []
                seen_text = set()  # Deduplicate text values
                
                for (rr, cc) in positions:
                    # Try to get text from original cell block first
                    cell_block = position_to_cell.get((rr, cc))
                    if cell_block:
                        cell_text = get_text_for_block(cell_block, id_map)
                        if cell_text and cell_text.strip():
                            text_stripped = cell_text.strip()
                            if text_stripped not in seen_text:
                                text_parts.append(text_stripped)
                                seen_text.add(text_stripped)
                    else:
                        # Fallback to grid if no cell block found
                        cell_text = grid[rr][cc]
                        if cell_text and cell_text.strip():
                            text_stripped = cell_text.strip()
                            if text_stripped not in seen_text:
                                text_parts.append(text_stripped)
                                seen_text.add(text_stripped)
                
                # Join all text parts with space (deduplicated)
                if text_parts:
                    joined_text = " ".join(text_parts)
                    # Replicate the joined text to ALL cells in the span
                    for (rr, cc) in positions:
                        grid[rr][cc] = joined_text

        # ---- Header detection & composition (multi-row headers) ----
        # Density-based header band guess
        densities = [sum(1 for x in row if x.strip()) for row in grid[:min(header_scan_rows, max_row)]]
        header_end = 0
        for i in range(len(densities)):
            header_end = i
            if i > 0 and densities[i] <= max(1, densities[i-1]//2):
                break
        header_rows = list(range(0, header_end+1))
        for r in header_rows:
            is_header_row[r] = True

        # Compose headers: parent spans replicated above child columns become "Parent / Child"
        headers = []
        for c in range(max_col):
            parts = []
            for r in header_rows:
                t = grid[r][c].strip()
                if t and (not parts or t.lower() != parts[-1].lower()):
                    parts.append(t)
            header = " / ".join(parts) if parts else f"col_{c+1}"
            headers.append(header)

        # Step 5: Handle cells that should be merged but Textract didn't detect as merged
        # This is a fallback for cases where Textract doesn't detect RowSpan > 1
        # We infer merged groups by looking for patterns: non-empty cell followed by empty cells until next non-empty
        # But only do this if replicate_data=True and we haven't already handled these cells via spans
        # Also: skip header region when inferring (use header_scan_rows as a hint, but don't rely on exact detection)
        if replicate_data:
            # Track which positions are already covered by explicit spans
            covered_positions = set()
            for (r0, c0, rs, cs) in span_regions.keys():
                for rr in range(r0, r0+rs):
                    for cc in range(c0, c0+cs):
                        covered_positions.add((rr, cc))
            
            # Start inference from after the header region (use header_scan_rows as hint)
            data_start_row = min(header_scan_rows + 1, max_row)
            
            # For each column, identify inferred merged groups (only for positions not already covered)
            for col in range(max_col):
                row = data_start_row  # Start from after header region
                while row < max_row:
                    # Skip if this position is already covered by an explicit span
                    if (row, col) in covered_positions:
                        row += 1
                        continue
                    
                    # Check if current cell has a value
                    if grid[row][col] and grid[row][col].strip():
                        # Found start of a potential merged cell group
                        value = grid[row][col]
                        group_start = row
                        
                        # Find the end of this group (next non-empty cell or end of table)
                        # Also collect all text values in this group
                        text_parts = [value.strip()]
                        row += 1
                        group_positions = [(group_start, col)]
                        
                        while row < max_row:
                            # Skip if this position is already covered by an explicit span
                            if (row, col) in covered_positions:
                                break
                            
                            # Stop if we hit a non-empty cell (start of next group)
                            if grid[row][col] and grid[row][col].strip():
                                break
                            
                            # This is an empty cell in the same group
                            group_positions.append((row, col))
                            row += 1
                        
                        # If we found a group with multiple positions, join and replicate
                        if len(group_positions) > 1:
                            # Collect any additional text from cells in the group
                            for (rr, cc) in group_positions[1:]:
                                if grid[rr][cc] and grid[rr][cc].strip():
                                    text_parts.append(grid[rr][cc].strip())
                            
                            # Join all text parts and replicate
                            if text_parts:
                                joined_text = " ".join(text_parts)
                                for (rr, cc) in group_positions:
                                    grid[rr][cc] = joined_text
                    else:
                        # Empty cell, move to next
                        row += 1

        # Body rows
        body_rows = [grid[r] for r in range(max_row) if not is_header_row[r]]

        out.append({
            "page": page,
            "table_index": t_index,
            "headers": headers,
            "rows": body_rows,
            "spans": spans,  # keep for downstream logic if needed
        })
    return out

def extract_forms_kv(blocks: List[Dict[str,Any]]) -> List[Dict[str,str]]:
    """Extract KEY_VALUE_SET (FORMS) pairs."""
    id_map, type_map = build_block_maps(blocks)
    kv_pairs = []

    for kv in type_map.get("KEY_VALUE_SET", []):
        if "KEY" not in kv.get("EntityTypes", []):
            continue
        key_text = get_text_for_block(kv, id_map)
        value_text = ""
        # find linked VALUE via Relationships of type VALUE
        for rel in kv.get("Relationships", []):
            if rel.get("Type") == "VALUE":
                for vid in rel.get("Ids", []):
                    vblock = id_map.get(vid)
                    if vblock and vblock.get("BlockType") == "KEY_VALUE_SET":
                        value_text = get_text_for_block(vblock, id_map)
        if key_text or value_text:
            kv_pairs.append({
                "page": kv.get("Page"),
                "key": key_text,
                "value": value_text
            })
    return kv_pairs

def write_tables_csv(tables: List[Dict[str,Any]], output_dir="output"):
    tables_dir = os.path.join(output_dir, "tables_out")
    os.makedirs(tables_dir, exist_ok=True)
    
    # per-table CSVs
    for t in tables:
        page = t["page"]
        idx = t["table_index"]
        headers = t["headers"]
        rows = t["rows"]
        path = os.path.join(tables_dir, f"tables_page_{page}_table_{idx}.csv")
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(headers)
            w.writerows(rows)

    # consolidated CSV (best-effort union of headers)
    # We'll normalize headers per table and write them one under another, with blank filler for missing cols.
    all_headers = set()
    norm_tables = []
    for t in tables:
        headers = [h.strip() for h in t["headers"]]
        all_headers.update(headers)
        norm_tables.append((headers, t["rows"], t["page"], t["table_index"]))
    all_headers = list(all_headers)

    with open(os.path.join(tables_dir, "tables_consolidated.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["page","table_index"] + all_headers)
        for headers, rows, page, tindex in norm_tables:
            for r in rows:
                rowmap = dict(zip(headers, r))
                w.writerow([page, tindex] + [rowmap.get(h, "") for h in all_headers])

def write_forms_csv(forms: List[Dict[str,str]], output_dir="output"):
    if not forms:
        return
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "forms_kv_pairs.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["page","key","value"])
        for kv in forms:
            w.writerow([kv["page"], kv["key"], kv["value"]])

def build_llm_jsonl(tables: List[Dict[str,Any]], output_dir="output", max_rows_per_chunk=50):
    """
    Emit compact, LLM-friendly JSONL. Each line contains:
      { "page": n, "table_index": i, "headers": [...], "rows": [[...],...]}
    Split large tables into chunks to keep tokens manageable.
    """
    os.makedirs(output_dir, exist_ok=True)
    path = os.path.join(output_dir, "tables_for_llm.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for t in tables:
            headers = t["headers"]
            rows = t["rows"]
            page = t["page"]
            ti = t["table_index"]

            # chunk
            for start in range(0, len(rows), max_rows_per_chunk):
                chunk = rows[start:start+max_rows_per_chunk]
                obj = {
                    "page": page,
                    "table_index": ti,
                    "row_range": [start, start+len(chunk)-1],
                    "headers": headers,
                    "rows": chunk
                }
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")
