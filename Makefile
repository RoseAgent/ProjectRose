.PHONY: build run dist build-rosespeech setup start clean package-extensions ci typecheck test-unit test-e2e help

# ── Editor ─────────────────────────────────────────────────────────────

build: ## Install npm dependencies and compile ProjectRose
	cd ProjectRose && npm install && npm run build

run: ## Launch ProjectRose in dev mode (RoseSpeech starts automatically)
	cd ProjectRose && npm run dev

dist: build-rosespeech ## Package ProjectRose as a distributable installer
	cd ProjectRose && npm install && npm run dist

# ── RoseSpeech ─────────────────────────────────────────────────────────

setup: ## Install RoseSpeech Python dependencies (developers only — not needed by end users)
	pip install -r RoseSpeech/requirements.txt

build-rosespeech: ## Bundle RoseSpeech into a self-contained executable via PyInstaller
	cd RoseSpeech && pyinstaller rosespeech.spec --noconfirm --distpath ../rosespeech-dist

# ── Combined ───────────────────────────────────────────────────────────

start: setup build ## Install all dependencies then launch in dev mode
	cd ProjectRose && npm run dev

package-extensions: ## Package RoseExtensions into ZIPs in dist/extensions/
	node scripts/package-extensions.mjs

# ── CI ──────────────────────────────────────────────────────────────────

ci: typecheck test-unit test-e2e ## Run all CI checks locally (typecheck + unit + e2e)

typecheck: ## Run TypeScript type checks
	cd ProjectRose && npm run typecheck

test-unit: ## Run unit tests
	cd ProjectRose && npm run test:unit

test-e2e: ## Build app and run E2E tests (requires Electron binary)
	node node_modules/electron/install.js
	cd ProjectRose && npm run build && npm run test:e2e

clean: ## Remove build artifacts
	rm -rf ProjectRose/node_modules ProjectRose/out ProjectRose/release rosespeech-dist dist/extensions

# ── Help ───────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
