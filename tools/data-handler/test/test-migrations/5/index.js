// Invalid migration for testing - missing migrate method
export default {
  async before() {
    return { success: true, message: 'Before step completed' };
  },

  // Missing migrate() method - this should cause loadMigration to fail
};
