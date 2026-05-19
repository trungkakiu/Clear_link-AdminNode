import { type } from "os";

export default (sequelize, DataTypes) => {
  const Block = sequelize.define(
    "Block",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      headerRaw: {
        type: DataTypes.BLOB("long"),
        allowNull: false,
      },
      Height: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
      },
      status: {
        type: DataTypes.STRING,
      },
      Hash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      PreviousHash: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      current_id: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      MerkleRoot: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      Creator: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      Owner_id: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      ValidatorSignature: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      original_value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      Version: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      exact_index: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      history_index: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      type_index: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: "Block",
      timestamps: true,
      indexes: [
        {
          name: "idx_block_height_unique",
          unique: true,
          fields: ["Height"],
        },
        {
          name: "idx_block_hash_unique",
          unique: true,
          fields: ["Hash"],
        },
        {
          name: "idx_block_exact_index_unique",
          unique: true,
          fields: ["exact_index"],
        },
        {
          name: "idx_block_history",
          fields: ["history_index"],
        },
        {
          name: "idx_block_type",
          fields: ["type_index"],
        },
        {
          name: "idx_block_search_composite",
          fields: ["current_id", "status", "type"],
        },
      ],
    },
  );

  return Block;
};
