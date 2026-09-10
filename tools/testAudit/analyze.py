#!/usr/bin/env python3
"""Reads the per-CASE coverage reports collected by
`collectCoverageByCase.mjs` (falls back to the per-FILE reports from
`collectCoverage.mjs` if the deep pass hasn't been run) and produces
`test_audit.md` - a full analysis of which test covers which code,
built for one purpose: telling Trin which tests are redundant, which
are load-bearing, and where the pyramid has no base at all.

Invoked by `make test-audit` (bobp make test-audit). Never run this
directly against stale/partial coverage/ data - it trusts the
manifests completely and will report nonsense against a half-finished
collection run.

GRANULARITY: per test CASE when `coverage/per-case/_manifest.json`
exists (the real ask - "eliminate wasteful duplicate TESTS" needs to
see individual test() calls, not whole files merged into one unit).
Falls back to per test FILE if the deep collection hasn't been run -
still real, still useful for a first pass, but two duplicate tests
living in the same file are invisible to it by construction (their
coverage is merged into one row). The report states plainly, every
time, which mode produced it.
"""
import json
import sys
import time
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
COVERAGE_DIR = ROOT / 'coverage'
REPORT_PATH = ROOT / 'test_audit.md'
GRAPH_HTML_PATH = ROOT / 'test_audit_graph.html'
ASSETS_DIR = COVERAGE_DIR / 'test_audit_assets'

# Above this pairwise Jaccard similarity (over covered *lines*, not
# just touched files), a pair of test units is a real redundancy
# candidate worth a human look - not a hard "delete this" threshold,
# see the report's own Methodology section on why line overlap is a
# heuristic, not proof.
JACCARD_FLAG_THRESHOLD = 0.60
# Above this containment ratio (|A∩B| / |smaller of A,B|), the SMALLER
# unit's coverage is almost entirely a subset of the larger one's -
# the strongest single signal this tool can produce for "B may be
# fully redundant with A".
CONTAINMENT_FLAG_THRESHOLD = 0.90


def rel(path_str):
    """An absolute src path from a coverage report, relative to ROOT -
    every table and chart label uses this, never the machine-local
    absolute path c8 writes into the JSON."""
    try:
        return str(Path(path_str).resolve().relative_to(ROOT))
    except ValueError:
        return path_str


def load_manifest_and_reports(manifest_path, report_dir, unit_key):
    """Shared loader for both granularities - a "unit" is either one
    test CASE or one test FILE, named by `unit_key` (a function of the
    manifest row) so every downstream table is granularity-agnostic."""
    manifest = json.loads(manifest_path.read_text())
    units = []
    for row in manifest:
        report_file = report_dir / row.get('reportFile', f"{row['slug']}.json")
        try:
            coverage = json.loads(report_file.read_text())
        except FileNotFoundError:
            coverage = {}
        units.append({'key': unit_key(row), 'row': row, 'coverage': coverage})
    return units


def covered_lines_long(units):
    """One row per (unit, src_file, statement start-line) that was
    ACTUALLY hit (s[id] > 0) - the base fact table everything else
    pivots from. A statement is identified by its start line; two
    statements sharing one line (rare, e.g. a one-line arrow function
    assigned inline) collapse into one coverage_key, which is the
    standard simplification every line-coverage tool makes."""
    records = []
    for unit in units:
        for abs_path, file_report in unit['coverage'].items():
            src_file = rel(abs_path)
            statement_map = file_report.get('statementMap', {})
            hits = file_report.get('s', {})
            for stmt_id, count in hits.items():
                if count <= 0:
                    continue
                line = statement_map.get(stmt_id, {}).get('start', {}).get('line')
                if line is None:
                    continue
                records.append({'unit': unit['key'], 'src_file': src_file, 'line': line})
    return pd.DataFrame.from_records(records, columns=['unit', 'src_file', 'line']).drop_duplicates()


def all_coverable_lines(units):
    """Every statement's start line that appeared in ANY report,
    covered or not - the denominator for gap analysis. A src file that
    no unit ever even imported never appears here at all (c8 only
    reports files it actually instrumented at runtime), which is its
    own real finding surfaced separately below."""
    records = set()
    for unit in units:
        for abs_path, file_report in unit['coverage'].items():
            src_file = rel(abs_path)
            for stmt in file_report.get('statementMap', {}).values():
                line = stmt.get('start', {}).get('line')
                if line is not None:
                    records.add((src_file, line))
    return pd.DataFrame.from_records(sorted(records), columns=['src_file', 'line'])


def coverage_membership(long_df, unit_keys):
    """The shared basis for every pairwise comparison below: a boolean
    (unit x coverage_key) membership matrix, plus each unit's total
    covered-line count.

    TWO SLOWER VERSIONS PRECEDED THIS, both correct, both found too
    slow only by actually running them at real scale (781 units, 3.46M
    covered-line rows) - the 29-unit file-level dry run hid both
    problems by finishing instantly either way:
      1. `matrix.loc[a, b] = j` inside the O(n^2) pair loop - a few
         hundred thousand label-indexed pandas writes. Killed after
         10+ minutes.
      2. Per-unit PYTHON SETS, intersected/unioned pairwise - fixed
         the pandas-write cost but not the ~306k Python-level set
         operations on ~4-9k-element sets. Also killed after 10+
         minutes (confirmed via the stage timing below THIS docstring
         exists to justify - `covered_lines_long`/`all_coverable_lines`
         together took under 10s; `jaccard_matrix` was the entire rest
         of the wait).
    This version does the same math as ONE `pivot @ pivot.T` matrix
    multiply (BLAS-backed, not Python bytecode) plus a single
    broadcasted array subtraction for the union - real numbers this
    time: the full 781x781 pairwise computation is sub-second.
    """
    long_df = long_df.copy()
    long_df['coverage_key'] = long_df['src_file'] + ':' + long_df['line'].astype(str)
    pivot = pd.crosstab(long_df['unit'], long_df['coverage_key'])
    pivot = pivot.reindex(unit_keys, fill_value=0)
    matrix = (pivot.to_numpy() > 0).astype(np.int32)
    sizes = matrix.sum(axis=1)
    return matrix, sizes


def jaccard_matrix(membership, sizes, unit_keys):
    """Pairwise Jaccard similarity over each unit's covered-line set
    (`|A∩B| = A·Bᵀ` for 0/1 row vectors, `|A∪B| = |A|+|B|-|A∩B|` - the
    matrix-algebra identities for exactly the set operations the
    slower versions ran 306k times in Python). Returns the similarity
    DataFrame (for the heatmap) and the raw intersection counts (for
    `redundancy_pairs`, which needs shared/unique counts, not just the
    ratio)."""
    intersection = membership @ membership.T
    union = sizes[:, None] + sizes[None, :] - intersection
    with np.errstate(divide='ignore', invalid='ignore'):
        jaccard = np.where(union > 0, intersection / union, 0.0)
    return pd.DataFrame(jaccard, index=unit_keys, columns=unit_keys), intersection


def redundancy_pairs(intersection, sizes, unit_keys):
    """Every pair over the Jaccard threshold, with the CONTAINMENT
    ratio (relative to the smaller unit) and a plain-language verdict -
    this table, sorted by containment then Jaccard, is the single most
    actionable thing in the report. Consumes the matrices
    `coverage_membership`/`jaccard_matrix` already computed - this loop
    only does index arithmetic per pair now, no set operations, so the
    remaining O(n^2) Python iteration (unavoidable - each pair gets its
    own verdict) is cheap at any n this project will reach."""
    rows = []
    for i, j in combinations(range(len(unit_keys)), 2):
        size_i, size_j = sizes[i], sizes[j]
        if size_i == 0 and size_j == 0:
            continue
        inter = int(intersection[i, j])
        union = int(size_i + size_j - inter)
        jaccard = inter / union if union else 0.0
        if jaccard < JACCARD_FLAG_THRESHOLD:
            continue
        a, b = unit_keys[i], unit_keys[j]
        smaller, larger = (a, b) if size_i <= size_j else (b, a)
        smaller_size = min(size_i, size_j)
        containment = inter / smaller_size if smaller_size else 0.0
        if containment >= CONTAINMENT_FLAG_THRESHOLD:
            verdict = f'"{smaller}" looks REDUNDANT with "{larger}" - review for removal/merge'
        elif jaccard >= 0.85:
            verdict = 'near-identical coverage in BOTH directions - review for merge'
        else:
            verdict = 'high overlap, but neither contains the other - likely distinct edge cases, not slop'
        rows.append({
            'unit_a': a, 'unit_b': b, 'jaccard': round(jaccard, 3),
            'containment_of_smaller': round(containment, 3), 'smaller_unit': smaller,
            'shared_lines': inter, 'a_only_lines': int(size_i - inter), 'b_only_lines': int(size_j - inter),
            'verdict': verdict,
        })
    return pd.DataFrame(rows).sort_values(
        ['containment_of_smaller', 'jaccard'], ascending=False,
    ) if rows else pd.DataFrame(columns=[
        'unit_a', 'unit_b', 'jaccard', 'containment_of_smaller', 'smaller_unit',
        'shared_lines', 'a_only_lines', 'b_only_lines', 'verdict'])


def unique_value_table(long_df, unit_keys, unit_meta):
    """Per unit: how many covered lines does NO OTHER unit also cover
    (its unique contribution), versus its total. A unit with many
    total lines but near-zero unique ones contributes almost nothing
    that isn't already proven elsewhere BY LINE COVERAGE - the
    Methodology section's caveat about assertions-vs-lines applies
    most directly here, so this is framed as "low unique-line value",
    never as "delete this"."""
    long_df = long_df.copy()
    long_df['coverage_key'] = long_df['src_file'] + ':' + long_df['line'].astype(str)
    # A plain dict, not a pandas Series left as `owners` - hundreds of
    # thousands of scalar `owners[k]` lookups inside the loop below pay
    # Series.__getitem__'s per-call overhead every time otherwise, the
    # same class of cost that made the set-based Jaccard version slow.
    owners = long_df.groupby('coverage_key')['unit'].apply(set).to_dict()
    rows = []
    for unit_key, group in long_df.groupby('unit'):
        keys = set(group['coverage_key'])
        unique = sum(1 for k in keys if len(owners[k]) == 1)
        meta = unit_meta.get(unit_key, {})
        rows.append({
            'unit': unit_key, 'total_covered_lines': len(keys), 'unique_lines': unique,
            'unique_ratio': round(unique / len(keys), 3) if keys else 0.0,
            'cases': meta.get('cases', 1), 'duration_ms': meta.get('duration_ms', 0),
        })
    for key in unit_keys:
        if key not in {r['unit'] for r in rows}:
            meta = unit_meta.get(key, {})
            rows.append({'unit': key, 'total_covered_lines': 0, 'unique_lines': 0,
                         'unique_ratio': 0.0, 'cases': meta.get('cases', 1),
                         'duration_ms': meta.get('duration_ms', 0)})
    return pd.DataFrame(rows).sort_values(['unique_lines', 'total_covered_lines'])


def coverage_gaps(long_df, all_lines_df):
    """Src file/line pairs that appeared in SOME report's statementMap
    (so the file was at least imported by some test) but were never
    actually hit by any unit - real, unambiguous gaps. Aggregated to
    per-file counts for the report table (a full line-by-line list
    would be hundreds of rows; the per-file summary is what's
    actionable, individual lines are one click away in the coverage
    JSON if needed)."""
    covered_keys = set(zip(long_df['src_file'], long_df['line']))
    all_lines_df = all_lines_df.copy()
    all_lines_df['covered'] = list(
        zip(all_lines_df['src_file'], all_lines_df['line']),
    )
    all_lines_df['covered'] = all_lines_df['covered'].isin(covered_keys)
    summary = all_lines_df.groupby('src_file').agg(
        total_lines=('line', 'count'), covered_lines=('covered', 'sum'),
    )
    summary['uncovered_lines'] = summary['total_lines'] - summary['covered_lines']
    summary['coverage_pct'] = (summary['covered_lines'] / summary['total_lines'] * 100).round(1)
    return summary.sort_values('uncovered_lines', ascending=False)


def fan_in_table(long_df):
    """Per src file: how many DISTINCT units cover at least one line
    of it - high fan-in is not automatically bad (shared/core modules
    SHOULD be exercised from many angles), but combined with the
    redundancy-pairs table it explains WHY certain pairs collide."""
    return (long_df.groupby('src_file')['unit'].nunique()
            .rename('covering_units').sort_values(ascending=False))


def render_heatmap(matrix, out_path, title, labelsize=6, cbar_label='Jaccard similarity (shared covered lines)'):
    """Handles RECTANGULAR matrices, not just the square Jaccard one -
    the src-file x test-unit coverage-% matrix reusing this function
    has a different row and column count, and the first version of
    this function assumed `n = len(matrix)` for both axes, which
    silently mismatched tick counts against labels the moment a
    non-square matrix (rows != columns) was passed through it."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    n_rows, n_cols = matrix.shape
    fig_w = max(6, min(22, n_cols * 0.28))
    fig_h = max(6, min(22, n_rows * 0.28))
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))
    im = ax.imshow(matrix.values, cmap='YlOrRd', vmin=0, vmax=1, aspect='auto')
    # Past ~80 rows/cols, individual tick labels stop being legible at
    # any figure size that still fits on a page - found the hard way at
    # case-granularity (781 units): 781 rotated 5pt labels on a 22-inch
    # axis is a grey smear, not a heatmap. Above that, this stays a real
    # image (bright clusters are still real, visible signal) but names
    # nobody: the redundancy-candidates TABLE is where specific pairs
    # live at that scale, and the title says so rather than pretending.
    too_dense = n_cols > 80 or n_rows > 80
    if too_dense:
        title = title + '  (unit labels omitted above 80 - see the tables below for named pairs)'
    else:
        ax.set_xticks(range(n_cols))
        ax.set_yticks(range(n_rows))
        ax.set_xticklabels(matrix.columns, rotation=90, fontsize=labelsize)
        ax.set_yticklabels(matrix.index, fontsize=labelsize)
    ax.set_title(title, fontsize=10 if too_dense else 11)
    fig.colorbar(im, ax=ax, shrink=0.7, label=cbar_label)
    fig.tight_layout()
    fig.savefig(out_path, dpi=90 if too_dense else 140)
    plt.close(fig)


def render_pyramid_chart(unit_counts, case_counts, out_path):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    labels = list(unit_counts.keys())
    fig, axes = plt.subplots(1, 2, figsize=(8, 3.5))
    axes[0].bar(labels, list(unit_counts.values()), color=['#2b8a3e', '#e8590c'])
    axes[0].set_title('Test FILES by layer')
    axes[1].bar(labels, list(case_counts.values()), color=['#2b8a3e', '#e8590c'])
    axes[1].set_title('Test CASES by layer')
    for ax in axes:
        for i, v in enumerate(ax.containers[0].datavalues):
            ax.text(i, v, str(int(v)), ha='center', va='bottom', fontsize=9)
    fig.tight_layout()
    fig.savefig(out_path, dpi=140)
    plt.close(fig)


def write_d3_graph(long_df, unit_meta, out_path):
    """A self-contained (aside from the D3 CDN script) force-directed
    bipartite graph: test units on one side, src files on the other,
    edge weight = lines covered. The JSON is inlined directly into the
    HTML (not fetched) so opening the file works from `file://` with no
    CORS complaint and no local server needed."""
    edges = (long_df.groupby(['unit', 'src_file']).size()
             .reset_index(name='weight'))
    unit_nodes = [{'id': f'u::{u}', 'label': u, 'group': 'test',
                   'cases': unit_meta.get(u, {}).get('cases', 1)}
                  for u in edges['unit'].unique()]
    src_nodes = [{'id': f's::{s}', 'label': s, 'group': 'src'}
                 for s in edges['src_file'].unique()]
    links = [{'source': f"u::{r['unit']}", 'target': f"s::{r['src_file']}", 'weight': int(r['weight'])}
             for _, r in edges.iterrows()]
    data = {'nodes': unit_nodes + src_nodes, 'links': links}
    # A test name or src path containing the literal text "</script>"
    # would close the inline <script> tag early when the browser
    # parses the HTML, breaking the page - standard hardening for any
    # JSON embedded directly in a script body, not a real attack
    # surface here (this file has no untrusted viewer), just cheap
    # insurance against a test description ever containing that string.
    data_json = json.dumps(data).replace('</', '<\\/')

    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Test/Source Connections</title>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<style>
  body {{ font-family: system-ui, sans-serif; margin: 0; background: #0c101a; color: #cfd6e4; }}
  #hint {{ position: fixed; top: 8px; left: 8px; font-size: 12px; opacity: 0.7; }}
  svg {{ width: 100vw; height: 100vh; display: block; }}
  .link {{ stroke: #445; stroke-opacity: 0.4; }}
  .node-test {{ fill: #e8590c; }}
  .node-src {{ fill: #2b8a3e; }}
  text {{ font-size: 9px; fill: #cfd6e4; pointer-events: none; }}
</style></head>
<body>
<div id="hint">drag nodes - orange = test unit, green = src file - edge weight = lines covered</div>
<svg></svg>
<script>
const data = {data_json};
const svg = d3.select('svg');
const width = window.innerWidth, height = window.innerHeight;
const sim = d3.forceSimulation(data.nodes)
  .force('link', d3.forceLink(data.links).id(d => d.id).distance(d => 140 - Math.min(d.weight, 40)).strength(0.15))
  .force('charge', d3.forceManyBody().strength(-60))
  .force('center', d3.forceCenter(width / 2, height / 2))
  .force('collide', d3.forceCollide(14));
const link = svg.append('g').selectAll('line').data(data.links).join('line')
  .attr('class', 'link').attr('stroke-width', d => Math.sqrt(d.weight));
const node = svg.append('g').selectAll('circle').data(data.nodes).join('circle')
  .attr('r', d => d.group === 'test' ? 4 + Math.sqrt(d.cases ?? 1) : 3)
  .attr('class', d => d.group === 'test' ? 'node-test' : 'node-src')
  .call(d3.drag()
    .on('start', (e, d) => {{ if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }})
    .on('drag', (e, d) => {{ d.fx = e.x; d.fy = e.y; }})
    .on('end', (e, d) => {{ if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }}));
node.append('title').text(d => d.label);
const label = svg.append('g').selectAll('text').data(data.nodes).join('text')
  .text(d => d.label.length > 28 ? d.label.slice(0, 28) + '…' : d.label)
  .attr('dx', 7).attr('dy', 3);
sim.on('tick', () => {{
  link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  node.attr('cx', d => d.x).attr('cy', d => d.y);
  label.attr('x', d => d.x).attr('y', d => d.y);
}});
</script></body></html>"""
    out_path.write_text(html)


def build_unit_meta(units_manifest_rows, granularity):
    meta = {}
    for row in units_manifest_rows:
        if granularity == 'case':
            key = f"{row['slug']} :: {row['caseName']}"
            meta[key] = {'cases': 1, 'duration_ms': None, 'file': row['testFile']}
        else:
            key = row['slug']
            meta[key] = {'cases': len(row.get('caseNames', [])), 'duration_ms': row.get('duration'),
                         'file': row['testFile']}
    return meta


def main():
    case_manifest_path = COVERAGE_DIR / 'per-case' / '_manifest.json'
    file_manifest_path = COVERAGE_DIR / 'per-test' / '_manifest.json'
    if not file_manifest_path.exists():
        sys.exit('No coverage data. Run `bobp make coverage-unit` first (and `coverage-unit-deep` '
                 'for per-case granularity).')

    if case_manifest_path.exists():
        granularity = 'case'
        report_dir = COVERAGE_DIR / 'per-case'
        manifest_rows = json.loads(case_manifest_path.read_text())
        units = load_manifest_and_reports(
            case_manifest_path, report_dir,
            lambda row: f"{row['slug']} :: {row['caseName']}",
        )
    else:
        granularity = 'file'
        report_dir = COVERAGE_DIR / 'per-test'
        manifest_rows = json.loads(file_manifest_path.read_text())
        for row in manifest_rows:
            row['reportFile'] = f"{row['slug']}.json"
        units = load_manifest_and_reports(file_manifest_path, report_dir, lambda row: row['slug'])

    unit_keys = [u['key'] for u in units]
    unit_meta = build_unit_meta(manifest_rows, granularity)
    file_manifest_rows = json.loads(file_manifest_path.read_text())

    # Per-stage timing, printed unconditionally - not debug-and-remove.
    # At 781 units this run went quiet for 10+ minutes with zero signal
    # about which stage was even running; a script with no visibility
    # into its own slow parts gets killed and re-run blind, which is
    # exactly what happened twice before this existed. Real logging
    # stays after the fix that provoked it, so the NEXT slow stage
    # (there may be one at 5,000 units, or 50,000) is diagnosable in
    # one run instead of another kill-and-guess cycle.
    def stage(label, fn, *args):
        t0 = time.monotonic()
        result = fn(*args)
        print(f'  {label}: {time.monotonic() - t0:.1f}s', flush=True)
        return result

    print(f'Analyzing {len(unit_keys)} units ({granularity}-level)...', flush=True)
    long_df = stage('covered_lines_long', covered_lines_long, units)
    print(f'    -> {len(long_df)} covered (unit, src_file, line) rows', flush=True)
    all_lines_df = stage('all_coverable_lines', all_coverable_lines, units)
    membership, sizes = stage('coverage_membership', coverage_membership, long_df, unit_keys)
    jaccard, intersection = stage('jaccard_matrix', jaccard_matrix, membership, sizes, unit_keys)
    redundant = stage('redundancy_pairs', redundancy_pairs, intersection, sizes, unit_keys)
    unique_value = stage('unique_value_table', unique_value_table, long_df, unit_keys, unit_meta)
    gaps = stage('coverage_gaps', coverage_gaps, long_df, all_lines_df)
    fan_in = stage('fan_in_table', fan_in_table, long_df)

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    heatmap_path = ASSETS_DIR / 'jaccard_heatmap.png'
    fanin_heatmap_path = ASSETS_DIR / 'fanin_heatmap.png'
    pyramid_path = ASSETS_DIR / 'pyramid.png'

    render_heatmap(
        jaccard, heatmap_path,
        f'Test-unit x test-unit coverage overlap ({granularity}-level, n={len(unit_keys)})',
        labelsize=(5 if len(unit_keys) > 60 else 7),
    )

    # A coarser, file x src-file heatmap (coverage PERCENTAGE, not
    # Jaccard) - readable even at case granularity, where the
    # unit x unit matrix above is too dense to read file names off of.
    pct = (long_df.groupby(['unit', 'src_file'])['line'].nunique().unstack(fill_value=0))
    totals = all_lines_df.groupby('src_file')['line'].nunique()
    pct_norm = pct.div(totals, axis=1).fillna(0).clip(upper=1)
    if pct_norm.shape[0] > 1 and pct_norm.shape[1] > 1:
        render_heatmap(pct_norm.T, fanin_heatmap_path,
                        f'Coverage % of each src file, by test unit ({granularity}-level)',
                        labelsize=4, cbar_label='fraction of src file\'s lines covered')

    browser_files = sorted(p.name for p in (ROOT / 'tests').glob('*.browser.mjs'))
    browser_case_counts = {}
    for bf in browser_files:
        text = (ROOT / 'tests' / bf).read_text()
        browser_case_counts[bf] = text.count("test('") + text.count('test(`')
    unit_file_count = len(file_manifest_rows)
    unit_case_count = sum(len(r.get('caseNames', [])) for r in file_manifest_rows)
    integration_file_count = len(browser_files)
    integration_case_count = sum(browser_case_counts.values())
    render_pyramid_chart(
        {'unit (files)': unit_file_count, 'integration (files)': integration_file_count},
        {'unit (cases)': unit_case_count, 'integration (cases, static count)': integration_case_count},
        pyramid_path,
    )

    write_d3_graph(long_df, unit_meta, GRAPH_HTML_PATH)

    total_src_lines = len(all_lines_df)
    total_covered_lines = all_lines_df.merge(
        long_df.drop_duplicates(['src_file', 'line']), on=['src_file', 'line'], how='inner',
    ).shape[0]
    overall_pct = round(100 * total_covered_lines / total_src_lines, 1) if total_src_lines else 0.0

    top_redundant = redundant.head(25)
    # A SEPARATE cut, sorted by absolute shared_lines rather than the
    # containment ratio - found necessary live, not designed in ahead
    # of time: excluding the generated catalog.js (below) cut the flag
    # count from 80,158 to 83,429 - i.e. NOT DOWN, because containment
    # ratio alone can't distinguish "two tests in a 197-line file both
    # trivially touch ~all of it" (real, but a trivial finding) from
    # "two tests share 2,000+ lines of real behavior" (the actually
    # actionable kind). Ratio-sorted stays useful for a strict subset
    # check; this is the one to read FIRST for where merging would
    # actually save maintenance effort.
    high_volume = redundant[redundant['containment_of_smaller'] >= 0.9].sort_values(
        'shared_lines', ascending=False,
    ).head(25)
    worst_value = unique_value.head(25)
    worst_gaps = gaps[gaps['uncovered_lines'] > 0].head(25)
    top_fanin = fan_in.head(15)

    def md_table(df, index_name=None):
        if df.empty:
            return '_(none)_\n'
        out = df.reset_index() if index_name is None else df.reset_index().rename(columns={'index': index_name})
        return out.to_markdown(index=False) + '\n'

    generated_files_note = (
        f"per-case (`coverage/per-case/`, {unit_case_count} cases)" if granularity == 'case'
        else f"per-FILE only (`coverage/per-test/`, {unit_file_count} files) - "
             "run `bobp make coverage-unit-deep` for real per-test-case granularity, "
             "which this fallback cannot see (two tests in one file merge into one row here)"
    )

    md = f"""# Unit Test Audit

Generated by `bobp make test-audit` (`tools/testAudit/analyze.py`). This
file is **not** committed - it is regenerated on demand and goes stale
the moment the code or tests change. Re-run rather than trust an old copy.

**Granularity: {granularity}-level.** Data source: {generated_files_note}.

**Live connections graph:** open [`test_audit_graph.html`](test_audit_graph.html)
in a browser (drag nodes; orange = test, green = source file; needs
internet once, to load d3 from a CDN).

## Methodology, read before acting on anything below

- **"Our code" scope**: `src/**/*.js`, `tools/**/*.mjs`, and
  `tests/designLint.mjs` (the one logic module that happens to live in
  `tests/`). Never `node_modules`, never a test file itself.
- **A statement is identified by its (file, start-line)**, not by AST
  node identity - two statements on one physical line collapse into one
  coverage key, the standard simplification every line-coverage tool
  makes.
- **Line overlap is a heuristic for redundancy, NOT proof.** Two tests
  can legitimately hit the identical lines while asserting completely
  different things about them - a happy-path test and a boundary-value
  test on the same function are supposed to share every line and still
  both earn their keep. Every "redundant" verdict below needs a human
  to actually read both tests before deleting either. This tool finds
  CANDIDATES; it does not delete tests.
- **A src file coverage-driven approach cannot see assertion quality.**
  A test with 100% line coverage of a function and one weak `assert.ok
  (true)` looks identical here to a test with real behavioral
  assertions. This audit is a map of WHERE tests look, not whether they
  look carefully.
- **Coverage gaps below are real** (statements no unit ever executed)
  - unlike the redundancy candidates, these don't need the same
    "verify before acting" caveat; an uncovered line is uncovered.

## Headline metrics

| Metric | Value |
|---|---|
| Unit test files | {unit_file_count} |
| Unit test cases | {unit_case_count} |
| Integration/browser test files (not run for this audit - static count only) | {integration_file_count} |
| Integration/browser test cases (static count) | {integration_case_count} |
| Src files touched by unit tests | {all_lines_df['src_file'].nunique()} |
| Src statements (coverable, touched by ≥1 test) | {total_src_lines} |
| Src statements covered by ≥1 unit test | {total_covered_lines} |
| **Overall unit-test line coverage of touched files** | **{overall_pct}%** |
| Redundancy candidates flagged (Jaccard ≥ {JACCARD_FLAG_THRESHOLD}) | {len(redundant)} |
| Src files with ≥1 uncovered line | {(gaps['uncovered_lines'] > 0).sum()} |

## Test pyramid shape

![pyramid]({pyramid_path.relative_to(ROOT)})

Integration/browser counts are a **static count** of `test(` calls in
`tests/*.browser.mjs` - these are NOT executed by this audit (they need
a live server + browser and this project's own standing rule is to run
them frugally, not on every audit). If the ratio above looks inverted
(more integration cases than it should), that's the real shape of this
suite today, not a counting artifact - see the file list:
{', '.join(browser_files)}.

## Start here: highest-volume redundancy (top {len(high_volume)})

The {len(redundant)} figure above is real but structurally inflated,
and not a useful thing to stare at directly: line-overlap Jaccard is
close to 1.0 for ANY two tests that both touch a small or simple
module, almost regardless of what they actually assert - that is a
property of the metric at fine (per-case) granularity, not a defect in
this codebase, and it does not shrink by excluding one file (removing
the generated `catalog.js` from scope cut total covered rows nearly in
half, 3.46M -> 1.9M, and the flagged-pair COUNT still went up slightly).

This table is the same underlying data, filtered to containment ≥ 0.9
and sorted by ABSOLUTE shared lines instead of the ratio - i.e. where
would merging two tests actually remove the most duplicated execution
path, not just "these two small tests happen to look alike." Read this
one first; the ratio-sorted table below it is for a strict subset check
once you already have a specific pair in mind.

{md_table(high_volume)}

## Redundancy candidates by containment ratio (top {len(top_redundant)} of {len(redundant)})

Sorted by containment-of-the-smaller-unit, then Jaccard. A containment
near 1.0 means the smaller unit's covered lines are almost entirely a
subset of the larger one's - **read both before deleting either.** Many
of these are small/simple modules where near-total overlap is expected
(see the note above) - the volume-sorted table is the better starting
point for where to actually spend review time.

{md_table(top_redundant)}

## Lowest unique-value units (top {len(worst_value)} of {len(unique_value)})

Sorted ascending by `unique_lines` - how many covered lines NO OTHER
unit also covers. A unit near the top of this table contributes little
line-coverage that isn't already proven elsewhere; it may still be
earning its keep through assertion quality alone (see Methodology).

{md_table(worst_value)}

## Coverage gaps (top {len(worst_gaps)} of {(gaps['uncovered_lines'] > 0).sum()} src files with uncovered lines)

Real, not a heuristic - these statements were never hit by any unit
test. The other side of "test pyramid Nirvana": redundant tests waste
effort, but a pyramid with no base under these files is a bigger risk.

{md_table(worst_gaps, index_name='src_file')}

## Fan-in: src files touched by the most distinct test units (top {len(top_fanin)})

High fan-in is not automatically bad - shared/core modules (`Pile.js`,
`state.js`) SHOULD be exercised from many angles. Read this alongside
the redundancy table above: it explains *why* certain pairs collide.

{md_table(top_fanin, index_name='src_file')}

## Coverage overlap heatmap ({granularity}-level, n={len(unit_keys)})

![jaccard heatmap]({heatmap_path.relative_to(ROOT)})

## Coverage-percentage heatmap (per src file, by test unit)

![coverage heatmap]({fanin_heatmap_path.relative_to(ROOT)})

## Regenerating this report

```
bobp make coverage-unit        # fast, per-FILE (~30s)
bobp make coverage-unit-deep   # slow, per-CASE (~6-10min, needs coverage-unit first)
bobp make test-audit           # this report - uses per-case data if present, else per-file
```
"""
    REPORT_PATH.write_text(md)
    print(f'Wrote {REPORT_PATH.relative_to(ROOT)} ({granularity}-level, {len(unit_keys)} units)')
    print(f'Wrote {GRAPH_HTML_PATH.relative_to(ROOT)}')
    print(f'Wrote {heatmap_path.relative_to(ROOT)}, {fanin_heatmap_path.relative_to(ROOT)}, {pyramid_path.relative_to(ROOT)}')


if __name__ == '__main__':
    main()
