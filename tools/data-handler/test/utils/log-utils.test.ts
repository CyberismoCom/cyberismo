// testing
import { expect } from 'chai';
import { describe, it } from 'mocha';

// ismo
import {
  errorFunction,
  errorMessage,
  logError,
  logErrorMessage,
} from '../../src/utils/log-utils.js';

describe('log utils', () => {
  it('logError (success)', () => {
    const errorReason = 'new error reason';
    const error = new Error(errorReason);
    logError(error);
    expect(true); // always succeeds;
  });
  it('logError - called with empty object', () => {
    logError({});
    expect(true); // always succeeds
    // todo: add sinon spy to console.error
  });
  it('logErrorMessage - no replacement string (success)', () => {
    const errorMsg = 'Error';
    logErrorMessage(errorMsg);
    expect(true); // always succeeds
  });
  it('logErrorMessage - no replacement string (success)', () => {
    const errorMsg = 'Error replace this with this';
    logErrorMessage(errorMsg, 'this', 'that');
    expect(true); // always succeeds
  });
  it('errorMessage (success)', () => {
    const errorReason = 'new error reason';
    const expectedErrorReason = 'old error reason';
    const retVal = errorMessage(errorReason, 'new', 'old');
    expect(retVal).to.equal(expectedErrorReason);
  });
  it('errorFunction (success)', () => {
    const errorReason = 'new error reason';
    const error = new Error(errorReason);
    const retVal = errorFunction(error);
    expect(retVal).to.equal(errorReason);
  });
  it('errorFunction - no error function as a parameter', () => {
    const retVal = errorFunction({});
    expect(retVal).to.contain('logError called without an error object');
  });
});
