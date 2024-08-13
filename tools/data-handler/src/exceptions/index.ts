import { ValidationError } from 'json-schema';

export class DHValidationError extends Error {
  public errors?: ValidationError[];
  constructor(message: string, errors?: ValidationError[]) {
    super(message);
    this.name = 'DHValidationError';
    this.errors = errors;
  }
}

export class SchemaNotFound extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaNotFound';
  }
}
