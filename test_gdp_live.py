"""
Live test: run chunking_by_token_size_with_table_awareness on the GDP file
and print diagnostic info about chunks produced.
"""

import sys
import os

# Add LightRag to path so we can import from lightrag
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "LightRag"))

from lightrag.operate import (
    chunking_by_token_size_with_table_awareness,
    _split_markdown_into_segments,
    _merge_table_fragments,
    _TABLE_SINGLE_CHUNK_MAX_TOKENS,
)
from lightrag.utils import TiktokenTokenizer

GDP_FILE = os.path.join(os.path.dirname(__file__), "Country GDP Billion USD.txt")


def main():
    with open(GDP_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    print(f"File size: {len(content)} characters, {content.count(chr(10))} lines")
    print(f"_TABLE_SINGLE_CHUNK_MAX_TOKENS = {_TABLE_SINGLE_CHUNK_MAX_TOKENS}")
    print()

    # Show raw segments before merging
    raw_segments = _split_markdown_into_segments(content)
    print(f"Raw segments: {len(raw_segments)}")
    for i, seg in enumerate(raw_segments):
        seg_type = seg["type"]
        seg_content = seg["content"]
        preview = seg_content[:80].replace("\n", "\\n")
        print(
            f"  [{i}] type={seg_type!r:6s}  len={len(seg_content):5d} chars  preview: {preview!r}"
        )
    print()

    # Show merged segments
    merged = _merge_table_fragments(raw_segments)
    print(f"Merged segments: {len(merged)}")
    for i, seg in enumerate(merged):
        seg_type = seg["type"]
        seg_content = seg["content"]
        preview = seg_content[:80].replace("\n", "\\n")
        print(
            f"  [{i}] type={seg_type!r:6s}  len={len(seg_content):5d} chars  preview: {preview!r}"
        )
    print()

    # Token count of each merged segment
    tokenizer = TiktokenTokenizer()
    print("Token counts per merged segment:")
    for i, seg in enumerate(merged):
        seg_type = seg["type"]
        seg_content = seg["content"]
        tokens = len(tokenizer.encode(seg_content))
        flag = (
            "*** EXCEEDS 8192 ***"
            if seg_type == "table" and tokens > _TABLE_SINGLE_CHUNK_MAX_TOKENS
            else ""
        )
        print(f"  [{i}] type={seg_type!r:6s}  tokens={tokens:6d}  {flag}")
    print()

    # Run the actual chunking function (signature: tokenizer, content, ...)
    chunks = chunking_by_token_size_with_table_awareness(
        tokenizer=tokenizer,
        content=content,
        split_by_character=None,
        split_by_character_only=False,
        overlap_token_size=100,
        max_token_size=1200,
    )

    print(f"Total chunks produced: {len(chunks)}")
    for i, chunk in enumerate(chunks):
        first_line = chunk["content"].split("\n")[0][:100]
        print(
            f"  Chunk {i}: tokens={chunk['tokens']:5d}  chunk_order_index={chunk['chunk_order_index']}  first_line={first_line!r}"
        )

    print()
    # Quick sanity check
    table_chunks = [c for c in chunks if c["content"].strip().startswith("|")]
    text_chunks = [c for c in chunks if not c["content"].strip().startswith("|")]
    print(f"Table chunks: {len(table_chunks)}")
    print(f"Text chunks:  {len(text_chunks)}")

    if len(table_chunks) == 1:
        print("\nPASS: table kept as a single chunk.")
    elif len(table_chunks) > 1:
        print(
            "\nNOTE: table was split into multiple chunks (row-split fallback triggered)."
        )
    else:
        print("\nWARN: no table chunk detected -- check segment classification.")


if __name__ == "__main__":
    main()
