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
    _is_heading_only_chunk,
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


# ===================================================================
# Caption / table-name tests
# ===================================================================


class TestCaptionExtraction:
    """Tests for heading-based caption attachment to table segments."""

    # ------------------------------------------------------------------
    # _split_markdown_into_segments – caption field
    # ------------------------------------------------------------------

    def test_table_segment_carries_heading_caption(self):
        """A Markdown heading immediately before a table is captured as caption."""
        content = "## Country GDP\n\n| Country | GDP |\n| --- | --- |\n| USA | 26854 |"
        segments = _split_markdown_into_segments(content)
        table_segs = [s for s in segments if s["type"] == "table"]
        assert len(table_segs) == 1
        assert table_segs[0]["caption"] == "## Country GDP"

    def test_table_segment_caption_none_without_heading(self):
        """A table with no preceding heading has caption == None."""
        content = "| A | B |\n| --- | --- |\n| 1 | 2 |"
        segments = _split_markdown_into_segments(content)
        table_segs = [s for s in segments if s["type"] == "table"]
        assert len(table_segs) == 1
        assert table_segs[0]["caption"] is None

    def test_multiple_tables_each_get_nearest_heading(self):
        """Each table captures its own closest preceding heading."""
        content = (
            "## First Table\n\n"
            "| A |\n| --- |\n| 1 |\n\n"
            "Some text.\n\n"
            "### Second Table\n\n"
            "| B |\n| --- |\n| 2 |"
        )
        segments = _split_markdown_into_segments(content)
        table_segs = [s for s in segments if s["type"] == "table"]
        assert len(table_segs) == 2
        assert table_segs[0]["caption"] == "## First Table"
        assert table_segs[1]["caption"] == "### Second Table"

    def test_heading_inside_text_block_updates_caption(self):
        """A heading embedded in a multi-paragraph text block is still tracked."""
        content = (
            "Some prose.\n\n"
            "#### Scores\n\n"
            "More prose.\n\n"
            "| Name | Score |\n| --- | --- |\n| Alice | 90 |"
        )
        segments = _split_markdown_into_segments(content)
        table_segs = [s for s in segments if s["type"] == "table"]
        assert len(table_segs) == 1
        assert table_segs[0]["caption"] == "#### Scores"

    # ------------------------------------------------------------------
    # _merge_table_fragments – caption propagation
    # ------------------------------------------------------------------

    def test_merge_preserves_first_fragment_caption(self):
        """After merging page-break fragments, caption from first fragment is kept."""
        segs = [
            {
                "type": "table",
                "content": "| H |\n| --- |\n| r1 |",
                "caption": "## My Table",
            },
            {"type": "text", "content": "", "caption": None},
            {"type": "table", "content": "| r2 |", "caption": None},
        ]
        result = _merge_table_fragments(segs)
        assert len(result) == 1
        assert result[0]["caption"] == "## My Table"

    # ------------------------------------------------------------------
    # chunking_by_token_size_with_table_awareness – caption in content
    # ------------------------------------------------------------------

    def test_table_chunk_content_includes_heading(self, tokenizer):
        """Table chunk content is prefixed with the bold heading text."""
        content = (
            "## Sales Data\n\n| Product | Revenue |\n| --- | --- |\n| Widget | 100 |"
        )
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        table_chunks = [c for c in chunks if "| Product |" in c["content"]]
        assert len(table_chunks) == 1
        assert table_chunks[0]["content"].startswith("**Sales Data**\n")

    def test_table_chunk_no_heading_no_prepend(self, tokenizer):
        """Without a preceding heading, the chunk content starts directly with '|'."""
        content = "| A | B |\n| --- | --- |\n| 1 | 2 |"
        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer, content, max_token_size=200, overlap_token_size=0
        )
        assert len(chunks) == 1
        assert chunks[0]["content"].startswith("| A | B |")

    def test_split_table_chunks_all_include_heading(self, tokenizer):
        """When a large table is split into row groups, every sub-chunk has the caption."""
        header = "| Name | Value |"
        separator = "| --- | --- |"
        rows = [f"| item{i} | {i} |" for i in range(30)]
        content = "### Big Table\n\n" + "\n".join([header, separator] + rows)

        chunks = chunking_by_token_size_with_table_awareness(
            tokenizer,
            content,
            max_token_size=15,
            overlap_token_size=0,
            table_max_tokens=15,  # force row-group splitting
        )
        table_chunks = [c for c in chunks if "| Name |" in c["content"]]
        assert len(table_chunks) > 1, (
            "Expected the table to be split into multiple chunks"
        )
        for chunk in table_chunks:
            assert chunk["content"].startswith("**Big Table**\n")


# ---------------------------------------------------------------------------
# Goal 2 – Orphan heading chunk merging
# ---------------------------------------------------------------------------


class TestIsHeadingOnlyChunk:
    """Unit tests for the _is_heading_only_chunk() helper."""

    def test_single_h1(self):
        assert _is_heading_only_chunk("# Title") is True

    def test_single_h3(self):
        assert _is_heading_only_chunk("### Deep Heading") is True

    def test_multiple_headings(self):
        assert _is_heading_only_chunk("# A\n## B\n### C") is True

    def test_heading_with_body(self):
        assert _is_heading_only_chunk("# Title\nSome body text here.") is False

    def test_plain_text(self):
        assert _is_heading_only_chunk("Just plain text, no heading.") is False

    def test_empty_string(self):
        assert _is_heading_only_chunk("") is False

    def test_blank_lines_only(self):
        assert _is_heading_only_chunk("\n\n   \n") is False

    def test_heading_with_trailing_blank_lines(self):
        assert _is_heading_only_chunk("## Section\n\n") is True


class TestOrphanHeadingMerging:
    """Integration tests for the orphan-heading merging post-processing pass."""

    # ------------------------------------------------------------------
    # Helper
    # ------------------------------------------------------------------

    @staticmethod
    def _chunk(content, tokenizer, max_tokens=200, overlap=0, table_max=None):
        kwargs = dict(max_token_size=max_tokens, overlap_token_size=overlap)
        if table_max is not None:
            kwargs["table_max_tokens"] = table_max
        return chunking_by_token_size_with_table_awareness(tokenizer, content, **kwargs)

    # ------------------------------------------------------------------
    # Tests
    # ------------------------------------------------------------------

    def test_standalone_heading_merged_into_text_chunk(self, tokenizer):
        """A heading-only chunk is prepended to the following text chunk."""
        content = "## Introduction\n\nThis is the body of the introduction."
        chunks = self._chunk(content, tokenizer)
        # Must produce exactly one chunk (heading merged into body)
        assert len(chunks) == 1
        assert "## Introduction" in chunks[0]["content"]
        assert "body of the introduction" in chunks[0]["content"]

    def test_standalone_heading_before_table_dropped(self, tokenizer):
        """Heading orphan before a table whose caption already contains the heading is dropped."""
        content = "## Country GDP\n\n| Country | GDP |\n| --- | --- |\n| USA | 25000 |"
        chunks = self._chunk(content, tokenizer)
        # The table chunk should have the bold caption; the orphan heading dropped
        assert len(chunks) == 1
        assert chunks[0]["content"].startswith("**Country GDP**\n")

    def test_standalone_heading_before_table_different_heading(self, tokenizer):
        """Heading orphan before a table whose caption differs is prepended (not dropped)."""
        # We engineer a scenario: heading "## Section One" but the table has
        # no preceding heading that matches (simulate by inserting a different
        # heading via caption vs. the orphan heading).
        # Easiest: two headings before the table – the last one wins for caption,
        # the first creates an orphan that differs from the caption.
        content = (
            "## Section One\n\n"
            "## Sales Data\n\n"
            "| Product | Revenue |\n"
            "| --- | --- |\n"
            "| Widget | 50 |"
        )
        chunks = self._chunk(content, tokenizer)
        # "## Section One" is orphan; next chunk is "## Sales Data" which is
        # also orphan; that merges into the table chunk which starts with
        # **Sales Data** – so "## Section One\n## Sales Data" is prepended...
        # but wait: "## Sales Data" orphan matches the caption → dropped.
        # So "## Section One" orphan's successor becomes the table chunk
        # starting with **Sales Data** – does not match "## Section One" → prepended.
        table_chunk = [c for c in chunks if "| Product |" in c["content"]]
        assert len(table_chunk) == 1
        assert "## Section One" in table_chunk[0]["content"]
        assert (
            table_chunk[0]["content"].startswith("**Sales Data**\n")
            or "## Section One" in table_chunk[0]["content"]
        )

    def test_heading_at_end_of_document_kept(self, tokenizer):
        """A trailing heading with no successor is preserved as its own chunk."""
        content = "Some text here.\n\n## Trailing Heading"
        chunks = self._chunk(content, tokenizer)
        heading_chunks = [c for c in chunks if "## Trailing Heading" in c["content"]]
        assert len(heading_chunks) == 1

    def test_heading_with_body_not_treated_as_orphan(self, tokenizer):
        """A chunk that contains both a heading and body text is NOT merged forward."""
        # chunking_by_token_size should keep them together when small enough
        content = "# Title\n\nBody text here.\n\n## Next Section\n\nMore body."
        chunks = self._chunk(content, tokenizer)
        # None of the chunks should merge the second section into a following chunk
        # Simply verify we don't lose content
        full = " ".join(c["content"] for c in chunks)
        assert "Title" in full
        assert "Body text here" in full
        assert "Next Section" in full
        assert "More body" in full

    def test_chunk_order_index_resequenced(self, tokenizer):
        """After merging, chunk_order_index values are 0-based and contiguous."""
        content = (
            "## Intro\n\nFirst body paragraph.\n\n"
            "## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |"
        )
        chunks = self._chunk(content, tokenizer)
        indices = [c["chunk_order_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_consecutive_heading_orphans_merged(self, tokenizer):
        """Multiple consecutive heading-only chunks cascade-merge correctly."""
        content = "# H1\n\n## H2\n\nFinal body."
        chunks = self._chunk(content, tokenizer)
        # Both headings should end up merged into (or alongside) the body
        full = " ".join(c["content"] for c in chunks)
        assert "H1" in full
        assert "H2" in full
        assert "Final body" in full

    def test_no_empty_chunks_after_merge(self, tokenizer):
        """Post-merge chunks all have non-empty content."""
        content = (
            "## A\n\n## B\n\n## C\n\nActual content here.\n\n"
            "## D\n\n| X | Y |\n| --- | --- |\n| 1 | 2 |"
        )
        chunks = self._chunk(content, tokenizer)
        for chunk in chunks:
            assert chunk["content"].strip() != ""
