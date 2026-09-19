.DEFAULT_GOAL := help
UV ?= uv

.PHONY: help setup verify dev test lint typecheck check clean build-object-capture

help:
	@echo "setup      create the 3.12 venv and install dependencies"
	@echo "verify     probe host capabilities (Milestone 0)"
	@echo "build-object-capture  compile the macOS mesh helper"
	@echo "dev        run the API with reload"
	@echo "test       run the test suite"
	@echo "test-slow  run integration tests (needs colmap + blender)"
	@echo "lint       ruff"
	@echo "typecheck  mypy"
	@echo "check      lint + typecheck + test"

setup:
	$(UV) venv --python 3.12
	$(UV) sync --all-groups

verify:
	$(UV) run machine-twin verify

# The mesh backend on macOS. PhotogrammetrySession support is a GPU question the
# framework alone can answer, so the probe needs this binary to report anything
# better than UNVERIFIED.
OC_DIR := tools/object-capture
build-object-capture: $(OC_DIR)/object-capture-helper

$(OC_DIR)/object-capture-helper: $(OC_DIR)/ObjectCaptureHelper.swift
	xcrun swiftc -O -parse-as-library -o $@ $<

dev:
	$(UV) run uvicorn machine_twin.api.app:app --reload --port 8000

test:
	$(UV) run pytest -q

# Renders the fixture and runs a real COLMAP solve. Needs blender and colmap.
test-slow:
	$(UV) run pytest -q -m slow

lint:
	$(UV) run ruff check machine_twin tests
	$(UV) run ruff format --check machine_twin tests

typecheck:
	$(UV) run mypy machine_twin

check: lint typecheck test

clean:
	rm -f $(OC_DIR)/object-capture-helper
	rm -rf .venv .pytest_cache .ruff_cache .mypy_cache
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
