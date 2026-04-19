.PHONY: build run dist up down dev dev-down logs start clean

# ── Editor ────────────────────────────────────────────────────────────

build: ## Install dependencies and build RoseEditor
	cd RoseEditor && npm install && npm run build

run: ## Launch RoseEditor in dev mode
	cd RoseEditor && npm run dev

dist: ## Package RoseEditor as a Windows installer
	cd RoseEditor && npm install && npm run dist

# ── Servers (Docker) ──────────────────────────────────────────────────

up: ## Start both servers in production mode
	docker compose up -d --build

down: ## Stop production servers
	docker compose down

dev: ## Start both servers in dev mode with hot reload
	docker compose -f docker-compose.dev.yml up --build

dev-down: ## Stop dev servers
	docker compose -f docker-compose.dev.yml down

logs: ## Tail logs from production servers
	docker compose logs -f

# ── Combined ──────────────────────────────────────────────────────────

start: up ## Start servers then launch editor in dev mode
	cd RoseEditor && npm run dev

clean: ## Remove Docker volumes and build artifacts
	docker compose down -v
	docker compose -f docker-compose.dev.yml down -v
	rm -rf RoseEditor/node_modules RoseEditor/out RoseEditor/release

# ── Data ──────────────────────────────────────────────────────────────

download-pile: ## Download Common Pile dataset to ./pile/ (run once, large download)
	pip install -q huggingface_hub && PILE_DIR=./pile python RoseTrainer/scripts/download_pile.py

# ── Help ──────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
