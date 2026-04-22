.PHONY: build run dist build-rosespeech setup start clean help

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

clean: ## Remove build artifacts
	rm -rf ProjectRose/node_modules ProjectRose/out ProjectRose/release rosespeech-dist

# ── Help ───────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
