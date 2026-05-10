# Makefile for Cyberismo thesis benchmarks.
#
# Run from this directory (cyberismo repo root). Defaults assume an external
# bench tree at $(BENCH_DIR) holding fixtures, results, and plots.
#
# Common invocations:
#   make fixtures              # generate the default scale grid
#   make build-variant         # build clingo from feature/parallel_shared, stash .node, restore stock
#   make bench                 # run the full benchmark suite (auto-detects stashed variant)
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

# Second clingo build for threading variant comparison. `make build-variant`
# checks out $(VARIANT_BRANCH) in the clingo submodule, builds node-clingo
# against it, stashes the resulting .node at $(VARIANT_NODE), then restores
# the original clingo HEAD and rebuilds stock. `make bench` then picks up
# that stash automatically and runs threading once per variant.
VARIANT_BRANCH ?= feature/parallel_shared
VARIANT_NAME   ?= mutexfix
VARIANT_NODE   ?= tools/node-clingo/build-variants/$(VARIANT_NAME)/node-clingo.node

NODECLINGO_DIR  := tools/node-clingo
CLINGO_SRC      := $(NODECLINGO_DIR)/external/clingo
NODECLINGO_NODE := $(NODECLINGO_DIR)/build/Release/node-clingo.node

SCRIPTS := tools/benchmarks/scripts
PY      ?= python3

.DEFAULT_GOAL := help

.PHONY: help fixtures bench build-variant merge plots gallery eta all \
        clean clean-results clean-plots clean-fixtures clean-variant

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
	@echo "  build-variant       Build clingo from $(VARIANT_BRANCH), stash .node, restore stock"
	@echo "  bench               Run all benchmarks. If $(VARIANT_NODE) exists, threading runs twice."
	@echo "  merge               Merge per-machine JSONs into canonical filenames"
	@echo "  plots               Generate every figure"
	@echo "  gallery             Build PNG gallery index.html (requires PNGs already in PLOTS_DIR/png)"
	@echo "  eta                 Estimate run-all time. Usage: make eta JSON=path/to/main-host.json"
	@echo "  all                 fixtures -> bench -> merge -> plots"
	@echo "  clean-results       Wipe RESULTS_DIR"
	@echo "  clean-plots         Wipe PLOTS_DIR"
	@echo "  clean-fixtures      Wipe FIXTURES_DIR (expensive to regenerate)"
	@echo "  clean-variant       Wipe stashed variant .node"
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
	@if [ -f "$(VARIANT_NODE)" ]; then \
	  $(SCRIPTS)/run-all.sh $(FIXTURES_DIR) $(RESULTS_DIR) "$(VARIANT_NODE)" "$(VARIANT_NAME)"; \
	else \
	  echo "Note: $(VARIANT_NODE) not found — running stock-only threading."; \
	  echo "      Run 'make build-variant' first to enable variant comparison."; \
	  $(SCRIPTS)/run-all.sh $(FIXTURES_DIR) $(RESULTS_DIR); \
	fi

# Build node-clingo against $(VARIANT_BRANCH), stash the .node aside, then
# restore the original clingo HEAD and rebuild stock. `pnpm clean` wipes the
# cmake build dir so each pnpm build is a clean rebuild against the checked-out
# branch. `git submodule update --init --recursive` runs after every checkout
# because branches may add/remove submodules (e.g. feature/parallel_shared
# adds third_party/parallel-hashmap).
build-variant:
	@orig=$$(git ls-tree HEAD $(CLINGO_SRC) | awk '{print $$3}'); \
	 if [ -z "$$orig" ]; then \
	   echo "could not resolve stock clingo SHA from parent repo HEAD" >&2; exit 1; \
	 fi; \
	 echo "=== Building variant clingo: $(VARIANT_BRANCH) ==="; \
	 echo "Stock clingo SHA (from parent repo): $$orig"; \
	 mkdir -p $$(dirname $(VARIANT_NODE)); \
	 set -e; \
	 ( cd $(CLINGO_SRC) && git checkout $(VARIANT_BRANCH) && git submodule update --init --recursive ); \
	 ( cd $(NODECLINGO_DIR) && pnpm run clean && pnpm run build:native && pnpm build ); \
	 cp $(NODECLINGO_NODE) $(VARIANT_NODE); \
	 echo ""; \
	 echo "=== Restoring stock clingo: $$orig ==="; \
	 ( cd $(CLINGO_SRC) && git checkout $$orig && git submodule update --init --recursive ); \
	 ( cd $(NODECLINGO_DIR) && pnpm run clean && pnpm run build:native && pnpm build ); \
	 echo ""; \
	 echo "Variant .node:  $(VARIANT_NODE)"; \
	 echo "Stock .node:    $(NODECLINGO_NODE)"

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

clean-variant:
	rm -rf $(dir $(VARIANT_NODE))
