name: Pull request
description: Describe your changes
labels: []
body:
  - type: textarea
    id: summary
    attributes:
      label: Summary
      description: What does this PR do and why?
    validations:
      required: true
  - type: checkboxes
    id: checks
    attributes:
      label: Checklist
      options:
        - label: "cargo fmt --all -- --check passes"
        - label: "cargo clippy --workspace --all-targets passes"
        - label: "frontend lint/typecheck/build pass"
        - label: "tests added/updated where relevant"
