"""Unit tests for table-aware markdown chunking.

Uses a lightweight mock tokenizer (whitespace split) so tests have no
external dependencies like tiktoken.
"""

from __future__ import annotations

import pytest
from typing import List

from lightrag.operate import (
    _split_markdown_into_segments,
    _is_page_break_gap,
    _merge_table_fragments,
    _chunk_table,
    _TABLE_SINGLE_CHUNK_MAX_TOKENS,
    chunking_by_token_size,
    chunking_by_token_size_with_table_awareness,
)


# ---------------------------------------------------------------------------
# Mock tokenizer – counts whitespace-separated words as "tokens"
# ---------------------------------------------------------------------------


class _MockTokenizerBackend:
    """Minimal tokenizer that maps each whitespace-separated word to a unique
    integer id (deterministic via a growing vocabulary)."""

    def __init__(self):
        self._vocab: dict[str, int] = {}
        self._reverse: dict[int, str] = {}
        self._next_id = 0

    def encode(self, text: str) -> List[int]:
        ids: list[int] = []
        for word in text.split():
            if word not in self._vocab:
                self._vocab[word] = self._next_id
                self._reverse[self._next_id] = word
                self._next_id += 1
            ids.append(self._vocab[word])
        return ids

    def decode(self, ids: List[int]) -> str:
        return " ".join(self._reverse[i] for i in ids)


class MockTokenizer:
    """Duck-typed replacement for ``lightrag.utils.Tokenizer``."""

    def __init__(self):
        self._backend = _MockTokenizerBackend()
        self.model_name = "mock"

    def encode(self, text: str) -> List[int]:
        return self._backend.encode(text)

    def decode(self, ids: List[int]) -> str:
        return self._backend.decode(ids)


@pytest.fixture()
def tokenizer():
    return MockTokenizer()


# ===================================================================
# _split_markdown_into_segments
# ===================================================================


class TestSplitMarkdownIntoSegments:
    def test_plain_text_only(self):
        content = "Hello world\nThis is a paragraph."
        segments = _split_markdown_into_segments(content)
        assert len(segments) == 1
        assert segments[0]["type"] == "text"
        assert "Hello world" in segments[0]["content"]

    def test_table_only(self):
        content = "| A | B |\n| --- | --- |\n| 1 | 2 |"
        segments = _split_markdown_into_segments(content)
        assert len(segments) == 1
        assert segments[0]["type"] == "table"

    def test_mixed_text_and_table(self):
        content = (
            "Some intro text.\n"
            "\n"
            "| Col1 | Col2 |\n"
            "| --- | --- |\n"
            "| a | b |\n"
            "\n"
            "Some outro text."
        )
        segments = _split_markdown_into_segments(content)
        types = [s["type"] for s in segments]
        assert types == ["text", "table", "text"]

    def test_table_inside_code_block_treated_as_text(self):
        content = "```\n| not | a | table |\n| --- | --- | --- |\n```"
        segments = _split_markdown_into_segments(content)
        # Everything is text because it is inside a fenced code block
        assert all(s["type"] == "text" for s in segments)

    def test_tilde_code_fence(self):
        content = "~~~\n| not | a | table |\n~~~"
        segments = _split_markdown_into_segments(content)
        assert all(s["type"] == "text" for s in segments)

    def test_multiple_tables(self):
        content = "| A |\n| --- |\n| 1 |\ntext between\n| B |\n| --- |\n| 2 |"
        segments = _split_markdown_into_segments(content)
        types = [s["type"] for s in segments]
        assert types == ["table", "text", "table"]

    def test_blank_line_inside_table_breaks_segment(self):
        """Blank lines between table rows produce two separate table segments."""
        content = "| H | V |\n| --- | --- |\n| r1 | v1 |\n\n| r2 | v2 |"
        segments = _split_markdown_into_segments(content)
        table_segs = [s for s in segments if s["type"] == "table"]
        assert len(table_segs) == 2


# ===================================================================
# _is_page_break_gap
# ===================================================================


class TestIsPageBreakGap:
    def test_blank_lines_only(self):
        assert _is_page_break_gap("\n\n\n") is True

    def test_single_dash_rule(self):
        assert _is_page_break_gap("---") is True

    def test_dash_rule_with_blank_lines(self):
        assert _is_page_break_gap("\n---\n") is True

    def test_real_text_is_not_gap(self):
        assert _is_page_break_gap("Some paragraph.") is False

    def test_text_mixed_with_blank(self):
        assert _is_page_break_gap("\nSome text\n") is False

    def test_empty_string(self):
        assert _is_page_break_gap("") is True


# ===================================================================
# _merge_table_fragments
# ===================================================================


class TestMergeTableFragments:
    def _make_segments(self, *pairs):
        """Helper: pairs of (type, content)."""
        return [{"type": t, "content": c} for t, c in pairs]

    def test_no_tables_unchanged(self):
        segs = self._make_segments(("text", "hello"), ("text", "world"))
        assert _merge_table_fragments(segs) == segs

    def test_blank_line_gap_merges_two_table_fragments(self):
        segs = self._make_segments(
            ("table", "| H | V |\n| --- | --- |\n| r1 | v1 |"),
            ("text", ""),
            ("table", "| r2 | v2 |"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 1
        assert result[0]["type"] == "table"
        assert "| r1 | v1 |" in result[0]["content"]
        assert "| r2 | v2 |" in result[0]["content"]

    def test_dash_rule_gap_merges_fragments(self):
        segs = self._make_segments(
            ("table", "| H |\n| --- |\n| r1 |"),
            ("text", "---"),
            ("table", "| r2 |"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 1
        assert "| r1 |" in result[0]["content"]
        assert "| r2 |" in result[0]["content"]

    def test_real_text_keeps_tables_separate(self):
        segs = self._make_segments(
            ("table", "| A |\n| --- |\n| 1 |"),
            ("text", "This is a real paragraph between the tables."),
            ("table", "| B |\n| --- |\n| 2 |"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 3
        types = [s["type"] for s in result]
        assert types == ["table", "text", "table"]

    def test_repeated_header_stripped_on_merge(self):
        header = "| H | V |"
        sep = "| --- | --- |"
        segs = self._make_segments(
            ("table", f"{header}\n{sep}\n| r1 | v1 |"),
            ("text", ""),
            # continuation fragment repeats the header
            ("table", f"{header}\n{sep}\n| r2 | v2 |"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 1
        content = result[0]["content"]
        # Header should appear exactly once
        assert content.count(header) == 1
        # All data rows must be present
        assert "| r1 | v1 |" in content
        assert "| r2 | v2 |" in content

    def test_three_fragments_merged(self):
        segs = self._make_segments(
            ("table", "| H |\n| --- |\n| r1 |"),
            ("text", ""),
            ("table", "| r2 |"),
            ("text", "---"),
            ("table", "| r3 |"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 1
        content = result[0]["content"]
        assert "| r1 |" in content
        assert "| r2 |" in content
        assert "| r3 |" in content

    def test_non_table_segments_preserved_between_distinct_tables(self):
        segs = self._make_segments(
            ("text", "intro"),
            ("table", "| A |\n| --- |\n| 1 |"),
            ("text", "middle paragraph here"),
            ("table", "| B |\n| --- |\n| 2 |"),
            ("text", "outro"),
        )
        result = _merge_table_fragments(segs)
        assert len(result) == 5


# ===================================================================
# _chunk_table
# ===================================================================


class TestChunkTable:
    def test_small_table_single_chunk(self, tokenizer):
        table = "| A | B |\n| --- | --- |\n| 1 | 2 |"
        chunks = _chunk_table(
            tokenizer, table, max_token_size=100, overlap_token_size=0
        )
        assert len(chunks) == 1
        assert "| A | B |" in chunks[0]
        assert "| 1 | 2 |" in chunks[0]

    def test_table_below_8192_token_ceiling_is_single_chunk(self, tokenizer):
        """Any table under _TABLE_SINGLE_CHUNK_MAX_TOKENS stays as one chunk,
        even if it far exceeds the general chunk_token_size (1200)."""
        header = "| Name | Value |"
        separator = "| --- | --- |"
        rows = [f"| item{i} | {i} |" for i in range(200)]
        table = "\n".join([header, separator] + rows)
        chunks = _chunk_table(tokenizer, table, max_token_size=20, overlap_token_size=0)
        # Must remain a single chunk because total tokens << 8192
        assert len(chunks) == 1
        assert "| item0 |" in chunks[0]
        assert "| item199 |" in chunks[0]

    def test_large_table_row_split(self, tokenizer):
        """A table exceeding table_max_tokens should be split into row groups."""
        header = "| Name | Value |"
        separator = "| --- | --- |"
        rows = [f"| item{i} | {i} |" for i in range(50)]
        table = "\n".join([header, separator] + rows)

        # Force splitting by setting table_max_tokens very small
        chunks = _chunk_table(
            tokenizer,
            table,
            max_token_size=20,
            overlap_token_size=0,
            table_max_tokens=20,
        )
        assert len(chunks) > 1
        for chunk in chunks:
            assert chunk.startswith("| Name | Value |\n| --- | --- |")

    def test_header_preserved_in_every_chunk(self, tokenizer):
        header = "| H1 | H2 |"
        separator = "| --- | --- |"
        rows = [f"| r{i} | c{i} |" for i in range(30)]
        table = "\n".join([header, separator] + rows)

        chunks = _chunk_table(
            tokenizer,
            table,
            max_token_size=15,
            overlap_token_size=0,
            table_max_tokens=15,
        )
        for chunk in chunks:
            lines = chunk.split("\n")
            assert lines[0] == header
            assert lines[1] == separator

    def test_empty_table(self, tokenizer):
        chunks = _chunk_table(tokenizer, "", max_token_size=100, overlap_token_size=0)
        assert chunks == []

    def test_table_no_separator_line(self, tokenizer):
        """Table without a |---| separator is still chunked."""
        table = "| A | B |\n| 1 | 2 |\n| 3 | 4 |"
        chunks = _chunk_table(
            tokenizer, table, max_token_size=100, overlap_token_size=0
        )
        assert len(chunks) == 1
        assert "| A | B |" in chunks[0]

    def test_oversized_single_row(self, tokenizer):
        """A single data row exceeding table_max_tokens is still emitted (no data loss)."""
        header = "| H |"
        separator = "| --- |"
        big_row = "| " + " ".join(f"word{i}" for i in range(50)) + " |"
        table = "\n".join([header, separator, big_row])

        chunks = _chunk_table(
            tokenizer,
            table,
            max_token_size=10,
            overlap_token_size=0,
            table_max_tokens=10,
        )
        assert len(chunks) >= 1
        all_text = "\n".join(chunks)
        assert "word0" in all_text
        assert "word49" in all_text


# ===================================================================
# chunking_by_token_size_with_table_awareness
# ===================================================================


class TestTableAwareChunking:
    def test_no_table_passthrough(self, tokenizer):
        """Plain text with no tables should behave identically to the
        original chunking_by_token_size."""
        content = "Hello world. " * 50
        aware = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=20, overlap_token_size=5
        )
        original = chunking_by_token_size(
            tokenizer, content, max_token_size=20, overlap_token_size=5
        )
        assert len(aware) == len(original)
        for a, o in zip(aware, original):
            assert a["content"] == o["content"]
            assert a["tokens"] == o["tokens"]

    def test_simple_table_single_chunk(self, tokenizer):
        content = "| A | B |\n| --- | --- |\n| 1 | 2 |"
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=100, overlap_token_size=0
        )
        assert len(chunks) == 1
        assert "| A | B |" in chunks[0]["content"]
        assert "| 1 | 2 |" in chunks[0]["content"]
        assert chunks[0]["chunk_order_index"] == 0

    def test_table_stays_single_chunk_regardless_of_chunk_token_size(self, tokenizer):
        """Even if max_token_size is tiny (simulating chunk_token_size=1200),
        the table must remain a single chunk as long as its tokens < 8192."""
        header = "| Product | Price | Quantity |"
        separator = "| --- | --- | --- |"
        rows = [f"| item{i} | {i}.00 | {i * 2} |" for i in range(100)]
        content = "\n".join([header, separator] + rows)

        # max_token_size=50 simulates the general chunk size being small;
        # the table should still be one chunk.
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=50, overlap_token_size=0
        )
        assert len(chunks) == 1
        assert "| item0 |" in chunks[0]["content"]
        assert "| item99 |" in chunks[0]["content"]

    def test_table_with_code_block(self, tokenizer):
        content = (
            "```\n"
            "| not | a | table |\n"
            "| --- | --- | --- |\n"
            "```\n"
            "\n"
            "| A | B |\n"
            "| --- | --- |\n"
            "| 1 | 2 |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        contents = [c["content"] for c in chunks]
        # The code block is text, the real table is a table chunk
        code_chunk = [c for c in contents if "not" in c]
        assert len(code_chunk) >= 1
        table_chunk = [c for c in contents if "| A | B |" in c and "| 1 | 2 |" in c]
        assert len(table_chunk) == 1

    def test_mixed_text_and_table(self, tokenizer):
        content = (
            "Introduction paragraph here.\n"
            "\n"
            "| X | Y |\n"
            "| --- | --- |\n"
            "| 1 | 2 |\n"
            "\n"
            "Conclusion paragraph here."
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        assert len(chunks) >= 3
        table_chunks = [
            c
            for c in chunks
            if "| X | Y |" in c["content"] and "| 1 | 2 |" in c["content"]
        ]
        assert len(table_chunks) == 1

    def test_multi_segment_index_continuity(self, tokenizer):
        content = (
            "Text block 1.\n"
            "\n"
            "| A |\n"
            "| --- |\n"
            "| 1 |\n"
            "\n"
            "Text block 2.\n"
            "\n"
            "| B |\n"
            "| --- |\n"
            "| 2 |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        indices = [c["chunk_order_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_multipage_blank_line_table_merged_into_single_chunk(self, tokenizer):
        """Blank line between pages inside a table → fragments merged → one chunk."""
        content = (
            "| Col | Value |\n"
            "| --- | --- |\n"
            "| row1 | a |\n"
            "| row2 | b |\n"
            "\n"  # ← page break blank line
            "| row3 | c |\n"
            "| row4 | d |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        # All data must be in a single chunk
        assert len(chunks) == 1
        c = chunks[0]["content"]
        assert "| Col | Value |" in c
        assert "| row1 | a |" in c
        assert "| row2 | b |" in c
        assert "| row3 | c |" in c
        assert "| row4 | d |" in c

    def test_multipage_dash_rule_table_merged(self, tokenizer):
        """--- between page sections inside a table → fragments merged."""
        content = (
            "| Col | Value |\n"
            "| --- | --- |\n"
            "| row1 | a |\n"
            "---\n"  # ← page break rule
            "| row2 | b |\n"
            "| row3 | c |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        assert len(chunks) == 1
        c = chunks[0]["content"]
        assert "| row1 | a |" in c
        assert "| row2 | b |" in c
        assert "| row3 | c |" in c

    def test_multipage_repeated_header_stripped(self, tokenizer):
        """Tool reprints header on each page → duplicate stripped after merge."""
        header = "| Name | Score |"
        sep = "| --- | --- |"
        content = (
            f"{header}\n{sep}\n"
            "| Alice | 90 |\n"
            "| Bob | 85 |\n"
            "\n"
            f"{header}\n{sep}\n"  # repeated header on page 2
            "| Carol | 92 |\n"
            "| Dave | 88 |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        assert len(chunks) == 1
        c = chunks[0]["content"]
        # Header appears exactly once
        assert c.count(header) == 1
        # All rows present
        assert "| Alice | 90 |" in c
        assert "| Bob | 85 |" in c
        assert "| Carol | 92 |" in c
        assert "| Dave | 88 |" in c

    def test_two_distinct_tables_not_merged(self, tokenizer):
        """Two separate tables separated by real text stay as separate chunks."""
        content = (
            "| A |\n| --- |\n| 1 |\n"
            "\n"
            "This is real text between two tables.\n"
            "\n"
            "| B |\n| --- |\n| 2 |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        table_chunks = [c for c in chunks if c["content"].startswith("|")]
        assert len(table_chunks) == 2

    def test_chunk_has_required_keys(self, tokenizer):
        content = "Some text.\n\n| A |\n| --- |\n| 1 |"
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        for chunk in chunks:
            assert "tokens" in chunk
            assert "content" in chunk
            assert "chunk_order_index" in chunk
            assert isinstance(chunk["tokens"], int)
            assert isinstance(chunk["content"], str)
            assert isinstance(chunk["chunk_order_index"], int)

    def test_split_by_character_passed_to_text(self, tokenizer):
        """Ensure split_by_character is forwarded to text segments."""
        content = "Para one.\n\nPara two.\n\n| A |\n| --- |\n| 1 |"
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer,
            content,
            split_by_character="\n\n",
            max_token_size=200,
            overlap_token_size=0,
        )
        text_chunks = [c for c in chunks if "|" not in c["content"]]
        assert len(text_chunks) >= 2
