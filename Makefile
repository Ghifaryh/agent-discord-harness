.PHONY: build-clis clean help

CLI_REPOS = outline-cli plane-cli forgejo-cli

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

build-clis: ## Clone and build all CLI binaries into bin/
	@for tool in $(CLI_REPOS); do \
		echo "Building $$tool..."; \
		git clone --depth 1 git@github.com:Ghifaryh/$$tool.git /tmp/$$tool 2>/dev/null || \
		git -C /tmp/$$tool pull --ff-only; \
		cd /tmp/$$tool && go build -o $(CURDIR)/bin/$$tool .; \
		echo "  → bin/$$tool"; \
	done
	@chmod +x bin/outline-cli bin/plane-cli bin/forgejo-cli
	@echo "Done. All CLI binaries built."

clean: ## Remove compiled binaries from bin/
	rm -f bin/outline-cli bin/plane-cli bin/forgejo-cli
	@echo "Cleaned bin/"
