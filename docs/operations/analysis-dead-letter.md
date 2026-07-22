# Analysis dead-letter recovery

1. Locate the task by agency, task ID and correlation ID; do not log report commentary.
2. Confirm immutable evidence generations still exist and the task model/prompt versions are approved.
3. Classify quota/provider errors as retryable and invalid claims/evidence as data defects.
4. Correct configuration or create a new version-bound task. Never mutate a successful result.
5. Record the retry/abandon decision and verify queue age, token usage and the resulting quality run.
