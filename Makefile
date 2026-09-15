.PHONY: help install dev test bench a11y demo build preview

help:
	@echo "Todo app"
	@echo "  make install  Install npm dependencies"
	@echo "  make dev      Start the Vite dev server"
	@echo "  make test     Run unit tests"
	@echo "  make bench    Run the 10k performance harness"
	@echo "  make a11y     Run accessibility and responsive checks"
	@echo "  make demo     Run the acceptance demonstration checks"
	@echo "  make build    Typecheck and production build"
	@echo "  make preview  Serve the production build"
	@echo "Docs: docs/architecture.md docs/performance-budgets.md docs/acceptance-demo.md"

install:
	npm install

dev:
	npm run dev

test:
	npm test

bench:
	npm run bench

a11y:
	npm run a11y

demo:
	npm run demo

build:
	npm run build

preview:
	npm run preview
