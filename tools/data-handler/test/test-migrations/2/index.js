// Fake migration for testing - version 2
export default {
  async before() {
    return { success: true, message: 'Before step completed' };
  },

  async backup(context) {
    return { success: true, message: context.backupDir || 'Backup completed' };
  },

  async migrate() {
    return { success: true, message: 'Migration to version 2 completed' };
  },

  async after() {
    return { success: true, message: 'After step completed' };
  },
};
