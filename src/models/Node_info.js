export default (sequelize, DataTypes) => {
  const Node_Info = sequelize.define(
    "Node_Info",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },

      node_id: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },

      role: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "validator",
      },

      address: {
        type: DataTypes.STRING,
        allowNull: false,
      },

      ip_address: {
        type: DataTypes.STRING,
        allowNull: true,
      },

      public_key: {
        type: DataTypes.TEXT("long"),
        allowNull: false,
      },

      stake: {
        type: DataTypes.DOUBLE,
        defaultValue: 0,
      },

      reputation_score: {
        type: DataTypes.DOUBLE,
        defaultValue: 100,
      },

      status: {
        type: DataTypes.STRING,
        defaultValue: "active",
      },

      node_type: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "user_validator",
      },

      block_height: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },

      ping_latency: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      network_speed: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      storage_usage: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      cpu_usage: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      memory_usage: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },

      last_active: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: () => Math.floor(Date.now() / 1000),
      },
    },
    {
      tableName: "Node_Info",
      freezeTableName: true,
      timestamps: true,
      underscored: true,
    }
  );

  return Node_Info;
};
