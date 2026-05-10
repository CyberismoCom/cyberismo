# Makefile for Cyberismo thesis benchmarks.
#
# Run from this directory (cyberismo repo root). Defaults assume an external
# bench tree at $(BENCH_DIR) holding fixtures, results, and plots.
#
# Common invocations:
#   make fixtures              # generate the default scale grid
#   make bench                 # run the full benchmark suite
#   make bench VARIANT_NODE=/tmp/clingo-mutexfix.node
#                              # also run threading against a second clingo build
#   make plots                 # produce all PDFs
#   make all                   # fixtures -> bench -> merge -> plots
#
# Override any variable on the command line, e.g. `make bench BENCH_DIR=/tmp/run1`.

BENCH_DIR     ?= $(HOME)/cyberismo-bench
FIXTURES_DIR  ?= $(BENCH_DIR)/fixtures
RESULTS_DIR   ?= $(BENCH_DIR)/results
PLOTS_DIR     ?= $(BENCH_DIR)/plots

SCALES        ?= 10 50 200 500 1000 2000 3000 5000 10000 25000 50000
PROJECTS      ?= cyberismo-docs module-eu-cra

# Optional second clingo build for threading variant comparison. When
# VARIANT_NODE is set to a path, `make bench` runs bench-threading twice:
# once with the in-place node-clingo .node (tagged "stock") and once after
# copying VARIANT_NODE in (tagged $(VARIANT_NAME)).
VARIANT_NODE  ?=
VARIANT_NAME  ?= mutexfix

SCRIPTS := tools/benchmarks/scripts
PY      ?= python3

.DEFAULT_GOAL := help

.PHONY: help fixtures bench merge plots gallery eta all \
        clean clean-results clean-plots clean-fixtures

help:
	@echo "Cyberismo benchmark Makefile"
	@echo ""
	@echo "Layout (override BENCH_DIR or individual *_DIR vars):"
	@echo "  BENCH_DIR    = $(BENCH_DIR)"
	@echo "  FIXTURES_DIR = $(FIXTURES_DIR)"
	@echo "  RESULTS_DIR  = $(RESULTS_DIR)"
	@echo "  PLOTS_DIR    = $(PLOTS_DIR)"
	@echo ""
	@echo "Targets:"
	@echo "  fixtures            Generate fixtures for SCALES = $(SCALES)"
	@echo "  bench               Run all benchmarks. Pass VARIANT_NODE=/path to compare two clingo builds."
	@echo "  merge               Merge per-machine JSONs into canonical filenames"
	@echo "  plots               Generate every figure"
	@echo "  gallery             Build PNG gallery index.html (requires PNGs already in PLOTS_DIR/png)"
	@echo "  eta                 Estimate run-all time. Usage: make eta JSON=path/to/main-host.json"
	@echo "  all                 fixtures -> bench -> merge -> plots"
	@echo "  clean-results       Wipe RESULTS_DIR"
	@echo "  clean-plots         Wipe PLOTS_DIR"
	@echo "  clean-fixtures      Wipe FIXTURES_DIR (expensive to regenerate)"
	@echo "  clean               clean-results + clean-plots"

fixtures: | $(FIXTURES_DIR)
	@for p in $(PROJECTS); do \
	  for s in $(SCALES); do \
	    echo ""; \
	    echo "=== $$p scale=$$s ==="; \
	    pnpm --filter @cyberismo/benchmarks bench:gen-fixtures $(FIXTURES_DIR) \
	      --project $$p --scale $$s || exit 1; \
	  done; \
	done

bench: | $(RESULTS_DIR)
	$(SCRIPTS)/run-all.sh $(FIXTURES_DIR) $(RESULTS_DIR) "$(VARIANT_NODE)" "$(VARIANT_NAME)"

merge:
	$(SCRIPTS)/merge-machines.sh $(RESULTS_DIR)

plots: | $(PLOTS_DIR)
	$(PY) $(SCRIPTS)/plot.py all $(RESULTS_DIR) $(PLOTS_DIR)

gallery: | $(PLOTS_DIR)
	$(SCRIPTS)/make-gallery.sh $(PLOTS_DIR)

eta:
	@if [ -z "$(JSON)" ]; then \
	  echo "Usage: make eta JSON=path/to/main-host.json" >&2; \
	  exit 1; \
	fi
	$(SCRIPTS)/eta.sh $(JSON) $(FIXTURES_DIR)

all: fixtures bench merge plots

$(FIXTURES_DIR) $(RESULTS_DIR) $(PLOTS_DIR):
	mkdir -p $@

clean: clean-results clean-plots

clean-results:
	rm -rf $(RESULTS_DIR)

clean-plots:
	rm -rf $(PLOTS_DIR)

clean-fixtures:
	rm -rf $(FIXTURES_DIR)
