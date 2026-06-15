# Local Development Crew

## Agent: Architect_Planner

- **Role:** Analyzes user requirements, maps out files, and writes technical specifications.
- **Tools:** directory-search, semantic-search

## Agent: Code_Developer

- **Role:** Reads specifications from the Planner and writes clean source code.
- **Tools:** file-editor, file-writer, git-commit

## Agent: Code_Reviewer

- **Role:** Inspects written code for logical bugs, syntax errors, and style issues.
- **Tools:** file-reader, code-differ

## Agent: Test_Runner

- **Role:** Runs compilation and unit tests. If things fail, it isolates the stack trace.
- **Tools:** terminal-cmd (`mvn test` or `npm test` or `pnpm test`)
