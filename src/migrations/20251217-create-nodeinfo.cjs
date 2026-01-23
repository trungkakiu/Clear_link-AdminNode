// "use strict";

// module.exports = {
//   async up(queryInterface, Sequelize) {
//     console.log("Creating table Node_Info...");

//     await queryInterface.createTable("Node_Info", {
//       id: {
//         type: Sequelize.INTEGER,
//         autoIncrement: true,
//         primaryKey: true,
//         allowNull: false,
//       },

//       node_id: {
//         type: Sequelize.STRING,
//         allowNull: false,
//         unique: true,
//       },

//       role: {
//         type: Sequelize.STRING,
//         allowNull: false,
//         defaultValue: "validator",
//       },

//       address: {
//         type: Sequelize.STRING,
//         allowNull: false,
//       },

//       ip_address: {
//         type: Sequelize.STRING,
//         allowNull: true,
//       },

//       public_key: {
//         type: Sequelize.TEXT("long"),
//         allowNull: false,
//       },

//       stake: {
//         type: Sequelize.DOUBLE,
//         defaultValue: 0,
//       },

//       reputation_score: {
//         type: Sequelize.DOUBLE,
//         defaultValue: 100,
//       },

//       status: {
//         type: Sequelize.STRING,
//         defaultValue: "active",
//       },

//       node_type: {
//         type: Sequelize.STRING,
//         allowNull: false,
//         defaultValue: "user_validator",
//       },

//       block_height: {
//         type: Sequelize.INTEGER,
//         defaultValue: 0,
//       },

//       ping_latency: {
//         type: Sequelize.FLOAT,
//         allowNull: true,
//       },

//       network_speed: {
//         type: Sequelize.FLOAT,
//         allowNull: true,
//       },

//       storage_usage: {
//         type: Sequelize.FLOAT,
//         allowNull: true,
//       },

//       cpu_usage: {
//         type: Sequelize.FLOAT,
//         allowNull: true,
//       },

//       memory_usage: {
//         type: Sequelize.FLOAT,
//         allowNull: true,
//       },

//       last_active: {
//         type: Sequelize.BIGINT,
//         allowNull: false,
//         defaultValue: Math.floor(Date.now() / 1000),
//       },

//       created_at: {
//         allowNull: false,
//         type: Sequelize.DATE,
//         defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
//       },

//       updated_at: {
//         allowNull: false,
//         type: Sequelize.DATE,
//         defaultValue: Sequelize.literal(
//           "CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"
//         ),
//       },
//     });
//   },

//   async down(queryInterface, Sequelize) {
//     console.log("Dropping table Node_Info...");
//     await queryInterface.dropTable("Node_Info");
//   },
// };
