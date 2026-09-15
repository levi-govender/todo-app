.PHONY: help install dev test bench a11y build preview

help:
	@echo "Todo app"
	@echo "  make install  Install npm dependencies"
	@echo "  make dev      Start the Vite dev server"
	@echo "  make test     Run unit tests"
	@echo "  make bench    Run the 10k performance harness"
	@echo "  make a11y     Run accessibility and responsive checks"
	@echo "  make build    Typecheck and production build"
	@echo "  make preview  Serve the production build"

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

build:
	npm run build

preview:
	npm run preview
