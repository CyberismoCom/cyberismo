# Spec Delta

## ADDED Requirements

### Requirement: A calculation edit is checked on its own

Changing the program of a calculation SHALL have the logic backend check the new program on its own, and SHALL be
refused, leaving the project unchanged, when the backend reports an error in it. Problems of the project as a whole
are not part of this check; a backend refuses them when the write commits, which fails the write like any failed
write.

#### Scenario: Edit checked on its own

- **GIVEN** a project with a card and the calculation `test/calculations/calc`, opened with the clingo backend
- **WHEN** its program is changed to `:- card(C).`, which is valid on its own but leaves the project without an
  answer
- **THEN** the calculation holds `:- card(C).`
