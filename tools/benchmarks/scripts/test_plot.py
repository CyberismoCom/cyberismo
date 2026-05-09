"""Smoke tests for plot.py.

Runs each plot.py subcommand against the synthetic JSON fixtures in
test-fixtures/ and asserts the expected PDF files are written and non-empty.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS_DIR = Path(__file__).resolve().parent
FIXTURES = SCRIPTS_DIR / "test-fixtures"
PLOT_SCRIPT = SCRIPTS_DIR / "plot.py"

CACHING_PDFS = ["caching-scaling.pdf"]
THREADING_PDFS = ["threading-batch.pdf", "threading-latency.pdf"]
MAIN_PDFS = [
    "main-tree-scaling.pdf",
    "main-tree-speedup.pdf",
    "main-phase-breakdown.pdf",
    "main-incremental-decomp.pdf",
    "main-rendering.pdf",
]
ALL_PDFS = CACHING_PDFS + THREADING_PDFS + MAIN_PDFS


def _run(subcommand: str, out_dir: Path) -> subprocess.CompletedProcess:
    """Invoke plot.py with the given subcommand. Raises on non-zero exit."""
    return subprocess.run(
        [sys.executable, str(PLOT_SCRIPT), subcommand, str(FIXTURES), str(out_dir)],
        capture_output=True,
        text=True,
        check=True,
    )


def _assert_nonempty_pdfs(out_dir: Path, names: list[str]) -> None:
    for name in names:
        path = out_dir / name
        assert path.exists(), f"missing PDF: {path}"
        size = path.stat().st_size
        assert size > 1024, f"PDF too small ({size} bytes): {path}"
        # Quick magic-byte check
        with path.open("rb") as fh:
            assert fh.read(4) == b"%PDF", f"not a PDF (bad header): {path}"


def test_caching(tmp_path: Path) -> None:
    _run("caching", tmp_path)
    _assert_nonempty_pdfs(tmp_path, CACHING_PDFS)


def test_threading(tmp_path: Path) -> None:
    _run("threading", tmp_path)
    _assert_nonempty_pdfs(tmp_path, THREADING_PDFS)


def test_main(tmp_path: Path) -> None:
    _run("main", tmp_path)
    _assert_nonempty_pdfs(tmp_path, MAIN_PDFS)


def test_all(tmp_path: Path) -> None:
    _run("all", tmp_path)
    _assert_nonempty_pdfs(tmp_path, ALL_PDFS)


@pytest.mark.parametrize("name", ["caching.json", "threading.json", "main.json"])
def test_fixtures_exist(name: str) -> None:
    """Make sure the fixtures we depend on are checked in."""
    assert (FIXTURES / name).is_file()


def test_pgf_output_or_warning(tmp_path: Path) -> None:
    """`all` should produce a .pgf companion alongside each .pdf when
    lualatex is available; otherwise only PDFs and a single stderr warning."""
    proc = _run("all", tmp_path)
    _assert_nonempty_pdfs(tmp_path, ALL_PDFS)
    if shutil.which("lualatex") is not None:
        # At least one figure should have a .pgf companion. We assert all of
        # them exist so a partial failure is loud.
        for pdf_name in ALL_PDFS:
            pgf = tmp_path / pdf_name.replace(".pdf", ".pgf")
            assert pgf.exists() and pgf.stat().st_size > 0, (
                f"missing or empty PGF: {pgf}"
            )
    else:
        # No lualatex: no PGFs produced, single warning on stderr.
        assert not list(tmp_path.glob("*.pgf"))
        warnings = [
            line for line in proc.stderr.splitlines() if "PGF output skipped" in line
        ]
        assert len(warnings) == 1, (
            f"expected exactly one PGF warning, got {len(warnings)}: "
            f"{proc.stderr!r}"
        )
