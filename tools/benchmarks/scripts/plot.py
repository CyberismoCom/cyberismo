#!/usr/bin/env python3
"""Plot benchmark JSON output as PDF figures for the thesis evaluation chapter.

Consumes JSON files produced by tools/benchmarks/src/bench-{caching,threading,main}.ts
and emits the eight figures the thesis chapter expects, both as `.pdf` and as
`.pgf` (the latter for `\\input` into the LaTeX document; requires lualatex).

Usage:
    python plot.py all       <results-dir> <output-dir>
    python plot.py caching   <results-dir> <output-dir>
    python plot.py threading <results-dir> <output-dir>
    python plot.py main      <results-dir> <output-dir>

<results-dir> contains caching.json / threading.json / main.json.
<output-dir> is created if it does not already exist.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Iterable

import matplotlib

matplotlib.use("pdf")  # ensure non-GUI backend; vector PDF output
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# ── Style ───────────────────────────────────────────────────────────────────

# Stable colour mapping per variant. Used everywhere to keep figures consistent.
VARIANT_COLOURS: dict[str, str] = {
    # main-scaling
    "baseline":              "#7f7f7f",  # grey
    "baseline+resultfield":  "#1f77b4",  # blue
    "c-api":                 "#ff7f0e",  # orange
    "c-api+resultfield":     "#2ca02c",  # green
    "c-api+preparsing":      "#d62728",  # red
    "incremental":           "#9467bd",  # purple
    # caching
    "cache-disabled":        "#7f7f7f",
    "cache-miss":            "#d62728",
    "cache-hit":             "#2ca02c",
    # threading
    "sync":                  "#7f7f7f",
    "async":                 "#1f77b4",
    "sync-batch":            "#7f7f7f",
    "async-batch":           "#1f77b4",
}

VARIANT_ORDER_MAIN = [
    "baseline",
    "baseline+resultfield",
    "c-api",
    "c-api+resultfield",
    "c-api+preparsing",
    "incremental",
]

VARIANT_ORDER_CACHING = ["cache-disabled", "cache-enabled", "cache-miss", "cache-hit"]

PHASE_COMPONENTS = ["glueUs", "addUs", "groundUs", "solveUs"]
PHASE_LABELS = {
    "glueUs":   "glue",
    "addUs":    "add",
    "groundUs": "ground",
    "solveUs":  "solve",
}
PHASE_COLOURS = {
    "glueUs":   "#9467bd",
    "addUs":    "#1f77b4",
    "groundUs": "#ff7f0e",
    "solveUs":  "#2ca02c",
}

plt.rcParams.update({
    "figure.dpi": 100,
    "savefig.dpi": 200,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "grid.linestyle": ":",
    "axes.spines.top": False,
    "axes.spines.right": False,
    "legend.frameon": False,
    "legend.fontsize": 9,
    "axes.labelsize": 10,
    "axes.titlesize": 11,
    "xtick.labelsize": 9,
    "ytick.labelsize": 9,
    # PGF backend: use lualatex (matches the TAU thesis class) and let the
    # surrounding LaTeX document control fonts. Keep the preamble minimal.
    "pgf.texsystem": "lualatex",
    "pgf.rcfonts": False,
    "pgf.preamble": "",
})

# Set once per script invocation when the PGF backend fails (e.g. lualatex
# missing). Used to suppress duplicate warnings across figures.
_PGF_WARNED = False


class PlotInputError(Exception):
    """Raised when an input JSON file is missing or malformed.

    Caught by `cmd_all` so that one bad file does not abort the whole batch.
    """


# ── Loading ─────────────────────────────────────────────────────────────────

def load_runs(json_path: Path) -> pd.DataFrame:
    """Load a benchmark JSON file and return its `runs` array as a DataFrame.

    Adds derived columns:
        totalMs   = totalUs / 1000
        machine   = top-level machine name (broadcast to every row)

    Raises `PlotInputError` if the file is missing, malformed, or has no
    `runs` key. Callers that want to abort the process can convert this to a
    `SystemExit`; `cmd_all` catches it to keep the batch going.
    """
    try:
        with json_path.open("r", encoding="utf-8") as fh:
            payload = json.load(fh)
    except FileNotFoundError:
        raise PlotInputError(f"error: {json_path} not found")
    except json.JSONDecodeError as exc:
        raise PlotInputError(f"error: {json_path} is not valid JSON: {exc.msg}")
    if "runs" not in payload:
        raise PlotInputError(f"error: {json_path} has no 'runs' key")
    runs = pd.DataFrame(payload["runs"])
    if runs.empty:
        return runs
    runs["machine"] = payload.get("machine", "unknown")
    runs["totalMs"] = runs["totalUs"] / 1000.0
    # Normalise missing query column to a sentinel so groupby works.
    if "query" not in runs.columns:
        runs["query"] = "-"
    runs["query"] = runs["query"].fillna("-")
    return runs


def variant_colour(variant: str) -> str:
    return VARIANT_COLOURS.get(variant, "#444444")


def project_pretty(name: str) -> str:
    """Pretty-print project prefix for axis titles."""
    mapping = {
        "decision": "cyberismo-docs",
        "docs": "cyberismo-docs",
        "eucra": "eucra",
    }
    return mapping.get(name, name)


# ── Plot helpers ────────────────────────────────────────────────────────────

def aggregate_runs(
    df: pd.DataFrame,
    group_cols: Iterable[str],
    value_col: str = "totalMs",
) -> pd.DataFrame:
    """Mean and std of `value_col` per group."""
    agg = (
        df.groupby(list(group_cols))[value_col]
        .agg(mean="mean", std="std", count="count")
        .reset_index()
    )
    agg["std"] = agg["std"].fillna(0.0)
    return agg


def line_with_band(
    ax,
    x: np.ndarray,
    mean: np.ndarray,
    std: np.ndarray,
    *,
    label: str,
    colour: str,
) -> None:
    """Plot a mean line with a 1-σ shaded band."""
    ax.plot(x, mean, label=label, color=colour, linewidth=1.6, marker="o", markersize=3)
    ax.fill_between(x, mean - std, mean + std, color=colour, alpha=0.18, linewidth=0)


def project_panels(
    df: pd.DataFrame,
    *,
    figsize: tuple[float, float],
) -> tuple[plt.Figure, dict[str, plt.Axes]]:
    """Create a side-by-side panel per project present in `df`."""
    projects = sorted(df["project"].unique())
    n = len(projects)
    fig, axes = plt.subplots(1, n, figsize=figsize, sharey=False, squeeze=False)
    return fig, dict(zip(projects, axes[0]))


def place_legend_below(fig: plt.Figure, axes: Iterable[plt.Axes], ncol: int) -> None:
    """Collect handles/labels from the first non-empty axis, place legend below."""
    handles, labels = [], []
    for ax in axes:
        h, l = ax.get_legend_handles_labels()
        if h:
            handles, labels = h, l
            break
    if not handles:
        return
    fig.legend(
        handles,
        labels,
        loc="lower center",
        ncol=ncol,
        bbox_to_anchor=(0.5, -0.02),
        frameon=False,
    )
    fig.subplots_adjust(bottom=0.22)


def save_figure(fig: plt.Figure, out_path: Path) -> None:
    """Save `fig` as both <out_path>.pdf and <out_path>.pgf.

    `out_path` is expected to use the `.pdf` suffix; the `.pgf` companion is
    derived via `with_suffix('.pgf')` so the thesis can `\\input` it directly.

    The PGF write uses matplotlib's `pgf` backend per-savefig so the global
    backend stays on `pdf`. If the PGF write fails (typically because
    lualatex is not installed), a single warning is emitted to stderr for
    the whole script invocation and PDF-only output continues.
    """
    global _PGF_WARNED
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, format="pdf", bbox_inches="tight")
    pgf_path = out_path.with_suffix(".pgf")
    try:
        fig.savefig(pgf_path, format="pgf", backend="pgf", bbox_inches="tight")
    except Exception:
        if not _PGF_WARNED:
            print(
                "warning: PGF output skipped because lualatex is not "
                "available; only PDFs were written",
                file=sys.stderr,
            )
            _PGF_WARNED = True
    plt.close(fig)


# ── Caching ─────────────────────────────────────────────────────────────────

def plot_caching(results_dir: Path, output_dir: Path) -> list[Path]:
    """caching-scaling.pdf — line chart per project, one line per cache variant."""
    df = load_runs(results_dir / "caching.json")
    if df.empty:
        raise SystemExit("caching.json contained no runs")

    df = df[df["feature"] == "caching"].copy()
    projects = sorted(df["project"].unique())
    fig, panels = project_panels(df, figsize=(5.5 * max(len(projects), 1), 4.0))

    variants_present = [v for v in VARIANT_ORDER_CACHING if v in df["variant"].unique()]
    # Append any unexpected variants too, for forward compatibility.
    for v in sorted(df["variant"].unique()):
        if v not in variants_present:
            variants_present.append(v)

    for project, ax in panels.items():
        sub = df[df["project"] == project]
        for variant in variants_present:
            cell = sub[sub["variant"] == variant]
            if cell.empty:
                continue
            agg = aggregate_runs(cell, ["cardCount"])
            agg = agg.sort_values("cardCount")
            line_with_band(
                ax,
                agg["cardCount"].to_numpy(),
                agg["mean"].to_numpy(),
                agg["std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("total time (ms)")

    place_legend_below(fig, panels.values(), ncol=min(len(variants_present), 4))
    fig.suptitle("Caching: total solve time vs. project size", y=1.02)
    out = output_dir / "caching-scaling.pdf"
    save_figure(fig, out)
    return [out]


# ── Threading ───────────────────────────────────────────────────────────────

def plot_threading(results_dir: Path, output_dir: Path) -> list[Path]:
    """threading-batch.pdf and threading-latency.pdf."""
    df = load_runs(results_dir / "threading.json")
    if df.empty:
        raise SystemExit("threading.json contained no runs")
    df = df[df["feature"] == "threading"].copy()

    out_paths: list[Path] = []

    # ── Batch wall-clock ────────────────────────────────────────────────
    batch = df[df["variant"].isin(["sync-batch", "async-batch"])].copy()
    if batch.empty:
        raise SystemExit("threading.json had no sync-batch / async-batch records")
    # wallClockMs is set on batch records; fall back to totalMs if it wasn't.
    batch["batchMs"] = batch["wallClockMs"].fillna(batch["totalMs"])

    machines = sorted(batch["machine"].unique())
    variant_order = ["sync-batch", "async-batch"]

    fig, ax = plt.subplots(figsize=(6.5, 4.0))
    n_groups = len(variant_order)
    n_machines = len(machines)
    bar_width = 0.8 / max(n_machines, 1)
    x_base = np.arange(n_groups)

    for m_idx, machine in enumerate(machines):
        means = []
        stds = []
        for v in variant_order:
            cell = batch[(batch["machine"] == machine) & (batch["variant"] == v)]
            means.append(cell["batchMs"].mean() if not cell.empty else 0.0)
            stds.append(cell["batchMs"].std(ddof=1) if len(cell) > 1 else 0.0)
        means = np.nan_to_num(np.array(means))
        stds = np.nan_to_num(np.array(stds))
        offset = (m_idx - (n_machines - 1) / 2.0) * bar_width
        colours = [variant_colour(v) for v in variant_order]
        bars = ax.bar(
            x_base + offset,
            means,
            bar_width,
            yerr=stds,
            capsize=3,
            color=colours,
            edgecolor="black",
            linewidth=0.5,
            label=machine if n_machines > 1 else None,
        )
        if n_machines > 1:
            for bar in bars:
                bar.set_hatch("//" if m_idx % 2 else "")

    ax.set_xticks(x_base)
    ax.set_xticklabels(["sequential (sync)", "concurrent (async)"])
    ax.set_ylabel("batch wall-clock time (ms)")
    ax.set_title("Threading: 64-solve batch wall-clock")

    if n_machines > 1:
        # Manual legend listing both machines.
        ax.legend(title="machine", loc="best")

    out_batch = output_dir / "threading-batch.pdf"
    save_figure(fig, out_batch)
    out_paths.append(out_batch)

    # ── Per-solve latency distribution ──────────────────────────────────
    solos = df[df["variant"].isin(["sync", "async"])].copy()
    if solos.empty:
        raise SystemExit("threading.json had no sync / async per-solve records")

    # One box per (machine, variant). variants kept in fixed order.
    variant_order_solo = ["sync", "async"]
    boxes: list[np.ndarray] = []
    labels: list[str] = []
    colours: list[str] = []
    for machine in machines:
        for v in variant_order_solo:
            cell = solos[(solos["machine"] == machine) & (solos["variant"] == v)]
            if cell.empty:
                continue
            boxes.append(cell["totalMs"].to_numpy())
            label = v if len(machines) == 1 else f"{machine}\n{v}"
            labels.append(label)
            colours.append(variant_colour(v))

    fig, ax = plt.subplots(figsize=(max(5.0, 1.4 * len(boxes) + 2), 4.0))
    bp = ax.boxplot(
        boxes,
        tick_labels=labels,
        showfliers=True,
        patch_artist=True,
        widths=0.6,
        medianprops=dict(color="black", linewidth=1.2),
        flierprops=dict(marker=".", markersize=3, alpha=0.4),
    )
    for patch, colour in zip(bp["boxes"], colours):
        patch.set_facecolor(colour)
        patch.set_alpha(0.55)
        patch.set_edgecolor("black")
        patch.set_linewidth(0.6)

    ax.set_ylabel("per-solve total time (ms)")
    ax.set_title("Threading: per-solve latency distribution (64 solves × 5 batches)")
    ax.set_yscale("log")

    out_lat = output_dir / "threading-latency.pdf"
    save_figure(fig, out_lat)
    out_paths.append(out_lat)

    return out_paths


# ── Main scaling ────────────────────────────────────────────────────────────

def _decide_log_y(values: np.ndarray) -> bool:
    """Pick log-y if dynamic range ≥ 50× and all values strictly positive."""
    pos = values[values > 0]
    if pos.size == 0:
        return False
    return float(pos.max() / pos.min()) >= 50.0


def _plot_main_query_scaling(
    df: pd.DataFrame, query_name: str, output_dir: Path, slug: str
) -> Path | None:
    """Per-query scaling plot. Returns None if no records for this query."""
    sub = df[df["query"] == query_name].copy()
    if sub.empty:
        return None

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.2))
    all_means: list[float] = []
    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        for variant in VARIANT_ORDER_MAIN:
            cell = psub[psub["variant"] == variant]
            if cell.empty:
                continue
            agg = aggregate_runs(cell, ["cardCount"]).sort_values("cardCount")
            line_with_band(
                ax,
                agg["cardCount"].to_numpy(),
                agg["mean"].to_numpy(),
                agg["std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
            all_means.extend(agg["mean"].tolist())
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("total time (ms)")

    # Linear y, log x: linear y honestly shows absolute timing at scale
    # (log-y compresses the variant gap at large N); log x spreads our
    # non-uniform scale grid so small-N detail isn't squashed.
    for ax in panels.values():
        ax.set_xscale("log")

    place_legend_below(fig, panels.values(), ncol=3)
    fig.suptitle(f"Main scaling: {query_name} query, total time vs. project size", y=1.02)
    out = output_dir / f"main-{slug}-scaling.pdf"
    save_figure(fig, out)
    return out


def _plot_main_query_speedup(
    df: pd.DataFrame, query_name: str, output_dir: Path, slug: str
) -> Path | None:
    """Per-query speedup vs baseline plot. Returns None if no data."""
    sub = df[df["query"] == query_name].copy()
    if sub.empty:
        return None

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.2))
    other_variants = [v for v in VARIANT_ORDER_MAIN if v != "baseline"]
    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        baseline = psub[psub["variant"] == "baseline"]
        if baseline.empty:
            ax.set_title(f"{project_pretty(project)} — no baseline")
            continue
        baseline_stats = (
            baseline.groupby("cardCount")["totalMs"]
            .agg(baselineMs="mean", baselineStd="std")
        )
        baseline_stats["baselineStd"] = baseline_stats["baselineStd"].fillna(0.0)
        for variant in other_variants:
            cell = psub[psub["variant"] == variant]
            if cell.empty:
                continue
            variant_stats = cell.groupby("cardCount")["totalMs"].agg(["mean", "std"])
            variant_stats["std"] = variant_stats["std"].fillna(0.0)
            joined = variant_stats.join(baseline_stats, how="inner")
            joined["speedup"] = joined["baselineMs"] / joined["mean"]
            joined["speedup_std"] = (
                joined["speedup"]
                * np.sqrt(
                    (joined["baselineStd"] / joined["baselineMs"]) ** 2
                    + (joined["std"] / joined["mean"]) ** 2
                )
            ).fillna(0.0)
            joined = joined.drop(columns=["baselineMs", "baselineStd"])
            x = joined.index.to_numpy()
            line_with_band(
                ax,
                x,
                joined["speedup"].to_numpy(),
                joined["speedup_std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
        ax.axhline(1.0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("speedup vs. baseline (×)")
        ax.set_xscale("log")

    place_legend_below(fig, panels.values(), ncol=3)
    fig.suptitle(f"Main scaling: {query_name} query speedup over baseline", y=1.02)
    out = output_dir / f"main-{slug}-speedup.pdf"
    save_figure(fig, out)
    return out


def plot_main_tree_scaling(df: pd.DataFrame, output_dir: Path) -> Path:
    sub = df[df["query"] == "tree"].copy()
    if sub.empty:
        raise SystemExit("main.json had no tree query records")

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.2))
    all_means: list[float] = []
    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        for variant in VARIANT_ORDER_MAIN:
            cell = psub[psub["variant"] == variant]
            if cell.empty:
                continue
            agg = aggregate_runs(cell, ["cardCount"]).sort_values("cardCount")
            line_with_band(
                ax,
                agg["cardCount"].to_numpy(),
                agg["mean"].to_numpy(),
                agg["std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
            all_means.extend(agg["mean"].tolist())
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("total time (ms)")

    # Linear y, log x: linear y honestly shows absolute timing at scale
    # (log-y compresses the variant gap at large N); log x spreads our
    # non-uniform scale grid so small-N detail isn't squashed.
    for ax in panels.values():
        ax.set_xscale("log")

    place_legend_below(fig, panels.values(), ncol=3)
    fig.suptitle("Main scaling: tree query, total time vs. project size", y=1.02)
    out = output_dir / "main-tree-scaling.pdf"
    save_figure(fig, out)
    return out


def plot_main_tree_speedup(df: pd.DataFrame, output_dir: Path) -> Path:
    sub = df[df["query"] == "tree"].copy()
    if sub.empty:
        raise SystemExit("main.json had no tree query records")

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.2))
    other_variants = [v for v in VARIANT_ORDER_MAIN if v != "baseline"]

    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        baseline = psub[psub["variant"] == "baseline"]
        if baseline.empty:
            ax.set_title(f"{project_pretty(project)} — no baseline")
            continue
        baseline_stats = (
            baseline.groupby("cardCount")["totalMs"]
            .agg(baselineMs="mean", baselineStd="std")
        )
        baseline_stats["baselineStd"] = baseline_stats["baselineStd"].fillna(0.0)
        for variant in other_variants:
            cell = psub[psub["variant"] == variant]
            if cell.empty:
                continue
            # Per-run speedup is more honest than ratio of means; here we use
            # variant-mean / baseline-mean per scale point because the runs
            # are not paired across variants.
            variant_stats = cell.groupby("cardCount")["totalMs"].agg(["mean", "std"])
            variant_stats["std"] = variant_stats["std"].fillna(0.0)
            joined = variant_stats.join(baseline_stats, how="inner")
            joined["speedup"] = joined["baselineMs"] / joined["mean"]
            # Ratio-of-means uncertainty: r * sqrt((sb/b)**2 + (sv/v)**2)
            joined["speedup_std"] = (
                joined["speedup"]
                * np.sqrt(
                    (joined["baselineStd"] / joined["baselineMs"]) ** 2
                    + (joined["std"] / joined["mean"]) ** 2
                )
            ).fillna(0.0)
            joined = joined.drop(columns=["baselineMs", "baselineStd"])
            x = joined.index.to_numpy()
            line_with_band(
                ax,
                x,
                joined["speedup"].to_numpy(),
                joined["speedup_std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
        ax.axhline(1.0, color="black", linewidth=0.8, linestyle="--", alpha=0.5)
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("speedup vs. baseline (×)")
        ax.set_xscale("log")

    place_legend_below(fig, panels.values(), ncol=3)
    fig.suptitle("Main scaling: tree query speedup over baseline", y=1.02)
    out = output_dir / "main-tree-speedup.pdf"
    save_figure(fig, out)
    return out


def _plot_phase_cell(
    cell: pd.DataFrame,
    target_variants: list[str],
    title: str,
    out_path: Path,
) -> None:
    """Single phase-breakdown stacked bar for a (project, scale, query) cell."""
    means = (
        cell.groupby("variant")[PHASE_COMPONENTS].mean().reindex(target_variants)
    ) / 1000.0  # us → ms
    means = means.dropna(how="all")
    if means.empty:
        return

    fig, ax = plt.subplots(figsize=(6.0, 4.2))
    x = np.arange(len(means.index))
    bottoms = np.zeros(len(means.index))
    for component in PHASE_COMPONENTS:
        vals = means[component].fillna(0.0).to_numpy()
        ax.bar(
            x,
            vals,
            bottom=bottoms,
            color=PHASE_COLOURS[component],
            label=PHASE_LABELS[component],
            edgecolor="black",
            linewidth=0.4,
            width=0.6,
        )
        bottoms += vals

    ax.set_xticks(x)
    ax.set_xticklabels(means.index, rotation=15, ha="right")
    ax.set_ylabel("time (ms)")
    ax.set_title(title)
    ax.legend(loc="best", title="phase")
    save_figure(fig, out_path)


def _plot_phase_progression(
    sub: pd.DataFrame,
    target_variants: list[str],
    project: str,
    out_path: Path,
    normalised: bool = False,
) -> None:
    """Per-variant stacked bars across scales, one panel per variant.
    If `normalised` is True, each bar is 100% so the composition shift
    is visible without being dominated by the absolute-time growth."""
    psub = sub[sub["project"] == project].copy()
    if psub.empty:
        return

    variants_present = [v for v in target_variants if v in psub["variant"].unique()]
    if not variants_present:
        return

    n = len(variants_present)
    fig, axes = plt.subplots(1, n, figsize=(4.0 * n, 4.4), sharey=True)
    if n == 1:
        axes = [axes]

    for ax, variant in zip(axes, variants_present):
        vsub = psub[psub["variant"] == variant]
        means = (
            vsub.groupby("cardCount")[PHASE_COMPONENTS]
            .mean()
            .sort_index()
        ) / 1000.0  # us → ms
        if normalised:
            row_sums = means.sum(axis=1)
            row_sums = row_sums.replace(0, np.nan)
            means = means.div(row_sums, axis=0).fillna(0.0) * 100.0
        scales = means.index.to_numpy().astype(int)
        positions = np.arange(len(scales))
        bottoms = np.zeros(len(scales))
        for component in PHASE_COMPONENTS:
            vals = means[component].fillna(0.0).to_numpy()
            ax.bar(
                positions,
                vals,
                bottom=bottoms,
                color=PHASE_COLOURS[component],
                label=PHASE_LABELS[component],
                edgecolor="black",
                linewidth=0.3,
                width=0.7,
            )
            bottoms += vals
        ax.set_xticks(positions)
        ax.set_xticklabels([str(s) for s in scales], rotation=45, ha="right")
        ax.set_title(variant)
        ax.set_xlabel("cards")
        if normalised:
            ax.set_ylim(0, 100)

    axes[0].set_ylabel("share of total time (%)" if normalised else "time (ms)")
    place_legend_below(fig, axes, ncol=4)
    fig.suptitle(
        f"Phase progression across scale — {project_pretty(project)}, tree query"
        + (" (normalised)" if normalised else ""),
        y=1.02,
    )
    save_figure(fig, out_path)


def plot_main_phase_breakdown(df: pd.DataFrame, output_dir: Path) -> list[Path]:
    """Phase breakdown for native variants on the tree query. Emits:
      - per-(project, scale) cell figures into phase-breakdown/  (deep dive)
      - per-project progression figures (variants × scales side-by-side)
    Pick whichever serves the chapter better."""
    sub = df[df["query"] == "tree"].copy()
    target_variants = [
        "c-api",
        "c-api+resultfield",
        "c-api+preparsing",
    ]
    sub = sub[sub["variant"].isin(target_variants)].copy()
    if sub.empty:
        raise SystemExit("main.json had no native tree records for phase breakdown")

    out_paths: list[Path] = []

    # Per-cell figures (one per project × scale).
    cell_dir = output_dir / "phase-breakdown"
    cell_dir.mkdir(parents=True, exist_ok=True)
    for (project, scale), cell in sub.groupby(["project", "cardCount"]):
        scale_int = int(scale)
        title = (
            f"Phase breakdown — {project_pretty(project)}, {scale_int} cards, tree query"
        )
        out_path = (
            cell_dir / f"main-phase-breakdown-{project}-{scale_int}.pdf"
        )
        _plot_phase_cell(cell, target_variants, title, out_path)
        if out_path.exists():
            out_paths.append(out_path)

    # Per-project progression figures (one panel per variant, scales along x).
    # Both absolute (time in ms) and normalised (% of total) variants —
    # absolute shows the magnitude, normalised shows composition shift.
    for project in sorted(sub["project"].unique()):
        for suffix, normalised in [("", False), ("-normalised", True)]:
            out_path = output_dir / f"main-phase-progression-{project}{suffix}.pdf"
            _plot_phase_progression(
                sub, target_variants, project, out_path, normalised=normalised
            )
            if out_path.exists():
                out_paths.append(out_path)

    return out_paths


def plot_main_incremental_decomp(df: pd.DataFrame, output_dir: Path) -> Path:
    sub = df[(df["variant"] == "incremental") & (df["query"] == "tree")].copy()
    if sub.empty:
        raise SystemExit("main.json had no incremental tree records")

    # The bench records only the per-query clingo cost (the prebuilt ASPIF is
    # generated at fixture-build time). totalUs == solveUs for incremental
    # records by construction.
    sub["clingoMs"] = sub["solveUs"] / 1000.0

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.0))
    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        agg = (
            psub.groupby("cardCount")["clingoMs"]
            .agg(["mean", "std"])
            .sort_index()
        )
        agg["std"] = agg["std"].fillna(0.0)
        scales = agg.index.to_numpy().astype(int)
        positions = np.arange(len(scales))
        ax.bar(
            positions,
            agg["mean"].to_numpy(),
            yerr=agg["std"].to_numpy(),
            width=0.7,
            color=PHASE_COLOURS["solveUs"],
            edgecolor="black",
            linewidth=0.3,
            label="clingo (solve on prebuilt ASPIF)",
            capsize=3,
        )
        ax.set_xticks(positions)
        ax.set_xticklabels([str(s) for s in scales], rotation=45, ha="right")
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("per-query time (ms)")

    place_legend_below(fig, panels.values(), ncol=1)
    fig.suptitle(
        "Incremental: per-query clingo cost on prebuilt ASPIF (gringo amortised at fixture-build)",
        y=1.02,
    )
    out = output_dir / "main-incremental-decomp.pdf"
    save_figure(fig, out)
    return out


def plot_main_rendering(df: pd.DataFrame, output_dir: Path) -> Path | None:
    sub = df[df["query"] == "rendering"].copy()
    if sub.empty:
        print("main.json had no rendering records", file=sys.stderr)
        return None
    target_variants = [
        "c-api",
        "c-api+preparsing",
        "baseline+resultfield",
    ]
    sub = sub[sub["variant"].isin(target_variants)].copy()
    if sub.empty:
        print(
            "main.json had no rendering data for target variants",
            file=sys.stderr,
        )
        return None

    fig, panels = project_panels(sub, figsize=(5.5 * max(len(sub["project"].unique()), 1), 4.0))
    all_means: list[float] = []
    for project, ax in panels.items():
        psub = sub[sub["project"] == project]
        for variant in target_variants:
            cell = psub[psub["variant"] == variant]
            if cell.empty:
                continue
            agg = aggregate_runs(cell, ["cardCount"]).sort_values("cardCount")
            line_with_band(
                ax,
                agg["cardCount"].to_numpy(),
                agg["mean"].to_numpy(),
                agg["std"].to_numpy(),
                label=variant,
                colour=variant_colour(variant),
            )
            all_means.extend(agg["mean"].tolist())
        ax.set_title(project_pretty(project))
        ax.set_xlabel("cards")
        ax.set_ylabel("total time (ms)")

    # Linear y, log x: linear y honestly shows absolute timing at scale
    # (log-y compresses the variant gap at large N); log x spreads our
    # non-uniform scale grid so small-N detail isn't squashed.
    for ax in panels.values():
        ax.set_xscale("log")

    place_legend_below(fig, panels.values(), ncol=3)
    fig.suptitle("Main scaling: rendering pipeline cost vs. project size", y=1.02)
    out = output_dir / "main-rendering.pdf"
    save_figure(fig, out)
    return out


def plot_main(results_dir: Path, output_dir: Path) -> list[Path]:
    df = load_runs(results_dir / "main.json")
    if df.empty:
        raise SystemExit("main.json contained no runs")
    df = df[df["feature"] == "main-scaling"].copy()
    out: list[Path] = [
        plot_main_tree_scaling(df, output_dir),
        plot_main_tree_speedup(df, output_dir),
    ]
    out.extend(plot_main_phase_breakdown(df, output_dir))
    rendering = plot_main_rendering(df, output_dir)
    if rendering is not None:
        out.append(rendering)
    # Per-card-query scaling + speedup plots (appendix-style figures).
    for q in ["card-leaf-task", "card-phase", "card-risk", "card-root"]:
        s = _plot_main_query_scaling(df, q, output_dir, q)
        if s is not None:
            out.append(s)
        sp = _plot_main_query_speedup(df, q, output_dir, q)
        if sp is not None:
            out.append(sp)
    return out


# ── CLI ─────────────────────────────────────────────────────────────────────

def cmd_caching(args: argparse.Namespace) -> int:
    try:
        paths = plot_caching(args.results_dir, args.output_dir)
    except PlotInputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    for p in paths:
        print(p)
    return 0


def cmd_threading(args: argparse.Namespace) -> int:
    try:
        paths = plot_threading(args.results_dir, args.output_dir)
    except PlotInputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    for p in paths:
        print(p)
    return 0


def cmd_main(args: argparse.Namespace) -> int:
    try:
        paths = plot_main(args.results_dir, args.output_dir)
    except PlotInputError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    for p in paths:
        print(p)
    return 0


def cmd_all(args: argparse.Namespace) -> int:
    out: list[Path] = []
    # Per-feature input failures should not abort the whole batch — skip the
    # offending feature, log to stderr, continue with the rest.
    for feature_name, plot_fn in (
        ("caching", plot_caching),
        ("threading", plot_threading),
        ("main", plot_main),
    ):
        try:
            out.extend(plot_fn(args.results_dir, args.output_dir))
        except PlotInputError as exc:
            print(str(exc), file=sys.stderr)
            print(f"warning: skipped {feature_name} feature", file=sys.stderr)
    for p in out:
        print(p)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Plot Cyberismo benchmark JSON output as thesis PDFs.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    def add_paths(p: argparse.ArgumentParser) -> None:
        p.add_argument("results_dir", type=Path, help="Directory containing benchmark JSON files")
        p.add_argument("output_dir", type=Path, help="Directory to write PDFs into (created if absent)")

    p_all = sub.add_parser("all", help="Generate every figure from every JSON file")
    add_paths(p_all)
    p_all.set_defaults(func=cmd_all)

    p_cache = sub.add_parser("caching", help="Generate caching figure")
    add_paths(p_cache)
    p_cache.set_defaults(func=cmd_caching)

    p_thread = sub.add_parser("threading", help="Generate threading figures")
    add_paths(p_thread)
    p_thread.set_defaults(func=cmd_threading)

    p_main = sub.add_parser("main", help="Generate main-scaling figures")
    add_paths(p_main)
    p_main.set_defaults(func=cmd_main)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
