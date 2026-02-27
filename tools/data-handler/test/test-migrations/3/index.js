// Fake migration for testing - version 3
export default {
  async migrate() {
    return { success: true, message: 'Migration to version 3 completed' };
  },
};
