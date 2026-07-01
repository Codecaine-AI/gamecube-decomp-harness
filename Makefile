SHELL := /bin/sh

REPO_ROOT ?= $(abspath ..)
STATE_DIR ?= $(CURDIR)/.decomp-orchestrator-state
RUN_ID ?=
PR ?=
PR_QA_FLAGS ?=
PR_QA_RUN_AGENTS ?= 1
PR_QA_COMMENT ?= 1
PR_QA_WAIT_CI ?= 0

PROVIDER ?= codex-lb
MODEL ?= gpt-5.5
THINKING ?= medium
WORKER_THINKING ?= medium

WORKERS ?= 20
AGENT_TIMEOUT_SECONDS ?= 1800
GOAL_KIND ?= matched_code_percent
GOAL ?= 100
CANDIDATE_LIMIT ?= 64
QUEUE_TARGET ?= $(CANDIDATE_LIMIT)
CANDIDATE_WINDOW ?= 256
IDLE_SLEEP_MS ?= 5000
DRY_RUN ?= 0
DRY_FLAG := $(if $(filter 1 true yes,$(DRY_RUN)),--dry-run-agents,)
RUN_ID_FLAG := $(if $(RUN_ID),--run-id "$(RUN_ID)",)
PR_QA_AGENT_FLAG := $(if $(filter 1 true yes,$(PR_QA_RUN_AGENTS)),--run-agents,)
PR_QA_COMMENT_FLAG := $(if $(filter 1 true yes,$(PR_QA_COMMENT)),--comment-unresolved,)
PR_QA_CI_FLAG := $(if $(filter 1 true yes,$(PR_QA_WAIT_CI)),--wait-ci,)
ORCH_GLOBAL_FLAGS := --repo-root "$(REPO_ROOT)" --state-dir "$(STATE_DIR)" $(DRY_FLAG) --provider "$(PROVIDER)" --model "$(MODEL)" --thinking-level "$(THINKING)" --agent-timeout-seconds "$(AGENT_TIMEOUT_SECONDS)"

.PHONY: help install check smoke ui status init-run start dry-start recover-leases regression-check pr-split-plan pr-draft-qa kg-status kg-maintain

help:
	@printf '%s\n' \
	  'Common targets:' \
	  '  make ui                 Start the hot-reloading dashboard at http://localhost:8787' \
	  '  make status             Print orchestrator status for REPO_ROOT/STATE_DIR' \
	  '  make init-run           Create a run with WORKERS/GOAL/CANDIDATE_LIMIT' \
	  '  make start              Start babysit/run-loop for the current run' \
	  '  make dry-start          Same as start with DRY_RUN=1' \
	  '  make recover-leases     Force-recover active leases for the run' \
	  '  make regression-check   Run the saved-baseline regression gate' \
	  '  make pr-split-plan      Render PR split/handoff plan' \
	  '  make pr-draft-qa PR=N   Run draft PR QA lifecycle for PR N' \
	  '  make kg-status          Print knowledge graph status' \
	  '  make kg-maintain        Run knowledge maintenance' \
	  '  make check              Typecheck + review-lint tests' \
	  '  make smoke              Run smoke test' \
	  '' \
	  'Useful variables:' \
	  '  REPO_ROOT="$(REPO_ROOT)"' \
	  '  STATE_DIR="$(STATE_DIR)"' \
	  '  RUN_ID="$(RUN_ID)"' \
	  '  WORKERS=$(WORKERS) AGENT_TIMEOUT_SECONDS=$(AGENT_TIMEOUT_SECONDS) GOAL=$(GOAL) DRY_RUN=$(DRY_RUN)'

install:
	bun install

check:
	bun run check

smoke:
	bun run smoke

ui:
	bun run ui:dev

status:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) status

init-run:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) init-run \
	  --desired-workers "$(WORKERS)" \
	  --goal-kind "$(GOAL_KIND)" \
	  --goal-value "$(GOAL)" \
	  --candidate-limit "$(CANDIDATE_LIMIT)"

start:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) babysit \
	  $(RUN_ID_FLAG) \
	  --max-workers "$(WORKERS)" \
	  --idle-sleep-ms "$(IDLE_SLEEP_MS)" \
	  --worker-thinking-level "$(WORKER_THINKING)" \
	  --candidate-limit "$(CANDIDATE_LIMIT)" \
	  --queue-target-size "$(QUEUE_TARGET)" \
	  --candidate-window "$(CANDIDATE_WINDOW)" \
	  --force-recover-leases

dry-start:
	$(MAKE) start DRY_RUN=1

recover-leases:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) recover-leases \
	  $(RUN_ID_FLAG) \
	  --force \
	  --reason "operator requested recovery via make"

regression-check:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) regression-check $(RUN_ID_FLAG)

pr-split-plan:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) pr-split-plan

pr-draft-qa:
	@test -n "$(PR)" || (printf '%s\n' 'Set PR=<number>, for example: make pr-draft-qa PR=2704' >&2; exit 2)
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) pr-draft-qa \
	  $(RUN_ID_FLAG) \
	  --pr "$(PR)" \
	  $(PR_QA_AGENT_FLAG) \
	  $(PR_QA_COMMENT_FLAG) \
	  $(PR_QA_CI_FLAG) \
	  $(PR_QA_FLAGS)

kg-status:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) kg-status

kg-maintain:
	bun run server:job -- $(ORCH_GLOBAL_FLAGS) kg-maintain $(RUN_ID_FLAG)
