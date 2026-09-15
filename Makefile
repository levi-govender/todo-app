.PHONY: help install dev test build preview

help:
	@echo "Todo app"
	@echo "  make install  Install npm dependencies"
	@echo "  make dev      Start the Vite dev server"
	@echo "  make test     Run unit tests"
	@echo "  make build    Typecheck and production build"
	@echo "  make preview  Serve the production build"

install:
	npm install

dev:
	npm run dev

test:
	npm test

build:
	npm run build

preview:
	npm run preview
