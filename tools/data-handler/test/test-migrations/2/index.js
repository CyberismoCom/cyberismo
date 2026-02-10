// Fake migration for testing - version 2
export default {
  async migrate() {
    return { success: true, message: 'Migration to version 2 completed' };
  },
};
