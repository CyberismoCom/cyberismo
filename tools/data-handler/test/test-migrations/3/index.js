// Fake migration for testing - version 3 (fails in before())
export default {
  async before() {
    return {
      success: false,
      message: 'Before step failed intentionally',
      error: new Error('Test error'),
    };
  },

  async migrate() {
    return { success: true, message: 'Migration to version 3 completed' };
  },
};
