// Fake migration for testing - version 4 (only migrate step, no before/after/backup)
export default {
  async migrate() {
    return { success: true, message: 'Migration to version 4 completed' };
  },
};
