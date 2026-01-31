// "use strict";

// module.exports = {
//   async up(queryInterface, Sequelize) {
//     console.log("Reset Node_Info state...");

//     await queryInterface.dropTable("Node_Info");
//   },

//   async down(queryInterface, Sequelize) {
//     console.log("Rollback reset Node_Info state: nothing to restore");
//   },
// };

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log("Clearing Block data...");

    await queryInterface.sequelize.transaction(async (t) => {
      await queryInterface.bulkDelete("Block", null, { transaction: t });
      await queryInterface.sequelize.query(
        "ALTER TABLE Block AUTO_INCREMENT = 1",
        { transaction: t },
      );
    });

    console.log("Block data cleared.");
  },

  async down(queryInterface, Sequelize) {
    console.log("Rollback skipped: Block data cannot be restored.");
  },
};
